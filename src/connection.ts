import * as os from 'os';
import { PduType } from './constants/tds-const';
import { TdsSocket, RawSocket } from './protocol/tds-socket';
import { TokenParser } from './protocol/response/token-parser';
import { LoginToken } from './protocol/tokens/login-token';
import { CapabilityToken } from './protocol/tokens/capability-token';
import { LanguageToken } from './protocol/tokens/language-token';
import { LogoutToken } from './protocol/tokens/logout-token';
import { DataFormat } from './types/data-format';
import { TypeMapper, JsValue } from './types/type-mapper';
import { SybaseError } from './error';

import { PreparedStatement } from './prepared-statement';
import { Cursor } from './cursor';
import { Transaction } from './transaction';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ConnectOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  charset?: string;
  language?: string;
  packetSize?: number;
  byteswap?: boolean;
}

export interface QueryResult {
  columns: DataFormat[];
  rows: JsValue[][];
  rowCount: number;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export class Connection {
  private _socket: TdsSocket;
  private _parser: TokenParser;
  readonly _mapper: TypeMapper;
  private _encoding: BufferEncoding = 'utf8';

  constructor(socket: TdsSocket, byteswap = false) {
    this._socket = socket;
    this._parser = new TokenParser();
    this._mapper = new TypeMapper(byteswap);
  }

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------

  static async connect(options: ConnectOptions, rawSocket?: RawSocket): Promise<Connection> {
    const {
      host,
      port       = 5000,
      username,
      password   = '',
      charset,
      language,
      packetSize,
      byteswap   = false,
    } = options;

    let socket: TdsSocket;
    if (rawSocket !== undefined) {
      socket = new TdsSocket(rawSocket, { packetSize });
    } else {
      socket = await TdsSocket.connect(host, port, { packetSize });
    }

    const hostname = os.hostname().slice(0, 30);

    const loginBuf = Buffer.concat([
      LoginToken.build({
        username,
        password,
        hostname,
        charset,
        language,
        packetSize,
        byteswap,
      }),
      new CapabilityToken().build(),
    ]);

    await socket.send(PduType.BUF_LOGIN, loginBuf);

    const msg    = await socket.receive();
    const tokens = new TokenParser().parse(msg.data);

    const loginAckToken = tokens.find(t => t.type === 'loginAck');
    const eedToken      = tokens.find(t => t.type === 'eed');

    if (eedToken && eedToken.type === 'eed') {
      throw new SybaseError(eedToken.data);
    }

    if (!loginAckToken || loginAckToken.type !== 'loginAck' || !loginAckToken.data.succeeded()) {
      throw new Error('Login fehlgeschlagen');
    }

    return new Connection(socket, byteswap);
  }

  // -------------------------------------------------------------------------
  // Public query API
  // -------------------------------------------------------------------------

  async query(sql: string): Promise<QueryResult> {
    await this._socket.send(PduType.BUF_LANG, LanguageToken.build(sql, false, this._encoding));
    return this._collectResult();
  }

  // -------------------------------------------------------------------------
  // Internal helpers (exposed for PreparedStatement / Cursor / Transaction)
  // -------------------------------------------------------------------------

  async _send(pduType: PduType, data: Buffer): Promise<void> {
    return this._socket.send(pduType, data);
  }

  async _collectResult(): Promise<QueryResult> {
    const columns: DataFormat[] = [];
    const rows: JsValue[][]     = [];
    let rowCount                = 0;

    while (true) {
      const msg    = await this._socket.receive();
      const tokens = this._parser.parse(msg.data, this._encoding);

      for (const tok of tokens) {
        switch (tok.type) {
          case 'eed':
            if (tok.data.isError()) throw new SybaseError(tok.data);
            break;

          case 'rowFmt':
            columns.splice(0, columns.length, ...tok.data.columns);
            break;

          case 'row': {
            const decoded = tok.data.values.map((raw, i) =>
              this._mapper.decode(columns[i], raw),
            );
            rows.push(decoded);
            break;
          }

          case 'done':
            rowCount = tok.data.rowCount;
            if (!tok.data.hasMore()) {
              return { columns, rows, rowCount };
            }
            break;

          default:
            // envChange, loginAck – ignore
            break;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Higher-level helpers
  // -------------------------------------------------------------------------

  async prepare(sql: string, params: DataFormat[] = []): Promise<PreparedStatement> {
    return PreparedStatement._create(this, sql, params);
  }

  cursor(sql: string, params: DataFormat[] = []): Cursor {
    return new Cursor(this, sql, params);
  }

  transaction(): Transaction {
    return new Transaction(this);
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  async end(): Promise<void> {
    await this._socket.send(PduType.BUF_LOGOUT, LogoutToken.build());
    await this._socket.close();
  }

  // -------------------------------------------------------------------------
  // Internal accessor (for sub-classes and peer classes)
  // -------------------------------------------------------------------------

  get _internal(): this {
    return this;
  }
}
