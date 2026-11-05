import * as os from 'os';
import type { ConnectionOptions as TlsConnectionOptions } from 'tls';
import { PduType, OptionId, DoneStatus, EnvType, DEFAULT_PACKET_SIZE } from './constants/tds-const';
import { TdsSocket, RawSocket, TdsMessage, TdsTimeoutError } from './protocol/tds-socket';
import { TokenParser, TdsToken } from './protocol/response/token-parser';
import { LoginToken } from './protocol/tokens/login-token';
import { CapabilityToken } from './protocol/tokens/capability-token';
import { LanguageToken } from './protocol/tokens/language-token';
import { LogoutToken } from './protocol/tokens/logout-token';
import { OptionCmdToken } from './protocol/tokens/option-cmd-token';
import { DataFormat } from './types/data-format';
import { TypeMapper, JsValue } from './types/type-mapper';
import { SybaseError, ServerMessage } from './error';

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
  /** Database to switch to after login (`use <database>`). */
  database?: string;
  /** Client charset sent in the login packet (Sybase name, e.g. `utf8`, `iso_1`). */
  charset?: string;
  language?: string;
  /**
   * Requested TDS packet size in bytes (default 2048). Used once the server
   * confirms it via ENVCHANGE; until then 512 is used.
   */
  packetSize?: number;
  /** Application name shown in `sysprocesses.program_name`. */
  appName?: string;
  /** Abort connection establishment (TCP + login) after this many ms. Default 15000, 0 = none. */
  connectTimeout?: number;
  /**
   * Abort a single request after this many ms. The driver sends an ATTENTION
   * (cancel) and waits for the server's acknowledgement; if that fails the
   * connection is closed. Default 0 = no limit.
   */
  requestTimeout?: number;
  /** TCP keep-alive. Default true. */
  keepAlive?: boolean;
  /** Use TLS for the connection (requires an SSL-enabled ASE listener). */
  tls?: boolean | TlsConnectionOptions;
  /**
   * @deprecated Little-endian sessions are not supported (token lengths are
   * always read big-endian). Passing `true` makes `connect()` throw.
   */
  byteswap?: boolean;
}

export interface ResultSet {
  columns: DataFormat[];
  rows: JsValue[][];
}

export interface QueryResult {
  /** Columns of the first result set (empty if the request returned none). */
  columns: DataFormat[];
  /** Rows of the first result set. */
  rows: JsValue[][];
  /** Affected/selected row count of the last DONE token that carried a count. */
  rowCount: number;
  /** All result sets in the order the server sent them. */
  resultSets: ResultSet[];
  /** Informational server messages (severity < 11, e.g. PRINT). */
  messages: ServerMessage[];
  /** Return status of a stored procedure, if one was executed. */
  returnStatus?: number;
  /** Output parameter values of a stored procedure, in declaration order. */
  outputParams: JsValue[];
}

export const DEFAULT_REQUEST_PACKET_SIZE = 2048;

/** Maps a Sybase charset name to a Node.js encoding (only lossless mappings). */
export function sybaseCharsetToEncoding(charset: string): BufferEncoding | null {
  switch (charset.trim().toLowerCase()) {
    case 'utf8':
    case 'utf-8':   return 'utf8';
    case 'iso_1':
    case 'iso88591':
    case 'iso-8859-1':
    case 'latin1':  return 'latin1';
    case 'ascii_7':
    case 'ascii':   return 'ascii';
    default:        return null;
  }
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$#@]{0,254}$/;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export class Connection {
  // Assigned by connect() – valid to use after that call.
  private _socket!: TdsSocket;

  private _parser: TokenParser;
  readonly _mapper: TypeMapper;

  private readonly _options: ConnectOptions;
  private readonly _rawSocket?: RawSocket;

  /** Serialises requests: TDS allows only one outstanding request per connection. */
  private _queue: Promise<unknown> = Promise.resolve();
  private _broken: Error | null = null;
  private _ended = false;
  private _inTransaction = false;
  private _database = '';

  /** Set by Transaction while begin() … commit()/rollback() is active. */
  _transactionActive = false;

  constructor(options: ConnectOptions, rawSocket?: RawSocket) {
    this._options   = options;
    this._rawSocket = rawSocket;
    this._parser    = new TokenParser();
    this._mapper    = new TypeMapper(false, 'utf8');
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Encoding used for SQL text and character data (follows the server charset). */
  get encoding(): BufferEncoding { return this._mapper.encoding; }

  /** Current database as reported by the server. */
  get database(): string { return this._database; }

  /** True if the connection can no longer be used (closed, failed, protocol error). */
  get isClosed(): boolean {
    return this._ended || this._broken !== null || !this._socket || this._socket.closed;
  }

  /** True while the server reports an open transaction (DONE_INXACT) or a Transaction is active. */
  get inTransaction(): boolean {
    return this._inTransaction || this._transactionActive;
  }

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  async connect(): Promise<this> {
    const {
      host,
      port           = 5000,
      username,
      password       = '',
      charset,
      language,
      appName,
      packetSize     = DEFAULT_REQUEST_PACKET_SIZE,
      connectTimeout = 15_000,
    } = this._options;

    if (this._options.byteswap) {
      throw new Error('byteswap: true wird nicht unterstützt – der Treiber arbeitet ausschließlich Big-Endian');
    }
    if (charset !== undefined) {
      const enc = sybaseCharsetToEncoding(charset);
      if (!enc) throw new Error(`Zeichensatz "${charset}" wird nicht unterstützt (utf8, iso_1, ascii_7)`);
      this._mapper.encoding = enc;
    }

    const deadline = connectTimeout > 0 ? Date.now() + connectTimeout : 0;
    const remaining = () => {
      if (!deadline) return 0;
      const ms = deadline - Date.now();
      if (ms <= 0) throw new TdsTimeoutError(`Login nach ${connectTimeout} ms abgebrochen`);
      return ms;
    };

    // Until the server confirms a larger size via ENVCHANGE(PACKETSIZE) we
    // send with the TDS minimum of 512 bytes; `packetSize` is only requested
    // in the login body.
    const socket = this._rawSocket !== undefined
      ? new TdsSocket(this._rawSocket, { packetSize: DEFAULT_PACKET_SIZE })
      : await TdsSocket.connect(host, port, {
          packetSize: DEFAULT_PACKET_SIZE,
          connectTimeout,
          keepAlive: this._options.keepAlive,
          tls:       this._options.tls,
        });

    const loginBuf = Buffer.concat([
      LoginToken.build({
        username,
        password,
        hostname: os.hostname().slice(0, 30),
        charset,
        language,
        appName,
        packetSize,
      }),
      new CapabilityToken().build(),
    ]);

    try {
      await socket.send(PduType.BUF_LOGIN, loginBuf);

      const msg    = await socket.receive(remaining());
      const tokens = new TokenParser().parse(msg.data, this.encoding);

      const loginAck = tokens.find(t => t.type === 'loginAck');
      const eed      = tokens.find(t => t.type === 'eed' && t.data.isError());

      if (eed && eed.type === 'eed') throw new SybaseError(eed.data);
      if (!loginAck || loginAck.type !== 'loginAck' || !loginAck.data.succeeded()) {
        throw new Error('Login fehlgeschlagen');
      }

      this._socket = socket;
      for (const t of tokens) if (t.type === 'envChange') this._applyEnvChange(t);
    } catch (err) {
      socket.destroy(err as Error);
      throw err;
    }

    socket.onClose((err) => { if (!this._ended && !this._broken) this._broken = err; });

    try {
      // Session setup: enable ANSI quoted identifiers so "double-quoted" names work
      await this._requestWithTimeout(PduType.BUF_NORMAL, OptionCmdToken.build(OptionId.QUOTED_IDENT, 1), remaining());

      if (this._options.database) {
        const db = this._options.database;
        if (!IDENTIFIER_RE.test(db)) throw new Error(`Ungültiger Datenbankname: ${db}`);
        await this._requestWithTimeout(PduType.BUF_NORMAL, LanguageToken.build(`use ${db}`, false, this.encoding), remaining());
      }
    } catch (err) {
      this._markBroken(err as Error);
      throw err;
    }

    return this;
  }

  // -------------------------------------------------------------------------
  // Public query API
  // -------------------------------------------------------------------------

  /**
   * Executes SQL. Without `params` the text is sent as a LANGUAGE request.
   * With `params`, `?` placeholders are bound server-side via a temporary
   * prepared statement (no string interpolation → no SQL injection).
   * ASE only accepts untyped `?` in WHERE, SET and VALUES clauses.
   */
  async query(sql: string, params?: JsValue[]): Promise<QueryResult> {
    if (params && params.length > 0) {
      const stmt = await this.prepare(sql);
      try {
        return await stmt.execute(params);
      } finally {
        if (!this.isClosed) await stmt.close().catch(() => undefined);
      }
    }
    return this._request(PduType.BUF_NORMAL, LanguageToken.build(sql, false, this.encoding));
  }

  // -------------------------------------------------------------------------
  // Internal helpers (used by PreparedStatement / Cursor / Transaction)
  // -------------------------------------------------------------------------

  /** Sends one request and reads its complete response; serialised per connection. */
  _request(pduType: PduType, data: Buffer): Promise<QueryResult> {
    return this._requestWithTimeout(pduType, data, this._options.requestTimeout ?? 0);
  }

  private _requestWithTimeout(pduType: PduType, data: Buffer, timeoutMs: number): Promise<QueryResult> {
    return this._enqueue(async () => {
      this._assertUsable();
      await this._socket.send(pduType, data);
      try {
        return await this._collectResult(timeoutMs);
      } catch (err) {
        if (err instanceof TdsTimeoutError) {
          await this._cancelAfterTimeout();
        } else if (!(err instanceof SybaseError)) {
          // Protocol/socket error: state of the stream is unknown.
          this._markBroken(err as Error);
        }
        throw err;
      }
    });
  }

  private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._queue.then(fn, fn);
    this._queue = run.catch(() => undefined);
    return run;
  }

  private _assertUsable(): void {
    if (this._ended)  throw new Error('Connection wurde beendet');
    if (this._broken) throw new Error(`Connection ist nicht mehr nutzbar: ${this._broken.message}`);
    if (!this._socket) throw new Error('Connection ist nicht verbunden – zuerst connect() aufrufen');
    if (this._socket.closed) throw new Error('Socket geschlossen');
  }

  private _markBroken(err: Error): void {
    if (!this._broken) this._broken = err;
    this._socket?.destroy(err);
  }

  /** Sends ATTENTION and discards everything up to the server's DONE_ATTN acknowledgement. */
  private async _cancelAfterTimeout(): Promise<void> {
    try {
      await this._socket.send(PduType.BUF_ATTN, Buffer.alloc(0));
      const deadline = Date.now() + 5_000;
      for (;;) {
        const ms  = Math.max(1, deadline - Date.now());
        const msg = await this._socket.receive(ms);
        const tokens = this._parser.parse(msg.data, this.encoding);
        if (tokens.some(t => t.type === 'done' && (t.data.status & DoneStatus.ATTN) !== 0)) return;
      }
    } catch (err) {
      this._markBroken(new Error(`Abbruch nach Timeout fehlgeschlagen: ${(err as Error).message}`));
    }
  }

  /**
   * Reads messages until the final DONE (without DONE_MORE). Errors are
   * collected and thrown only after the response has been fully consumed so
   * the stream stays in sync.
   */
  async _collectResult(timeoutMs = 0): Promise<QueryResult> {
    const resultSets: ResultSet[]   = [];
    const messages: ServerMessage[] = [];
    let current: ResultSet | null   = null;
    let paramFmt: DataFormat[]      = [];
    let outputParams: JsValue[]     = [];
    let returnStatus: number | undefined;
    let rowCount  = 0;
    let lastDoneCount = 0;
    let sawCount  = false;
    let firstError: SybaseError | null = null;
    let doneError = false;

    for (;;) {
      const msg: TdsMessage = await this._socket.receive(timeoutMs);
      const tokens: TdsToken[] = this._parser.parse(msg.data, this.encoding);

      for (const tok of tokens) {
        switch (tok.type) {
          case 'eed':
            if (tok.data.isError()) {
              if (!firstError) firstError = new SybaseError(tok.data);
            } else {
              messages.push(SybaseError.toMessage(tok.data));
            }
            break;

          case 'rowFmt':
            current = { columns: tok.data.columns, rows: [] };
            resultSets.push(current);
            break;

          case 'row': {
            if (!current) {
              // e.g. cursor fetch after the first one: no new ROWFMT, reuse last format
              current = { columns: [...this._parser.lastColumns], rows: [] };
              resultSets.push(current);
            }
            const cols = current.columns;
            current.rows.push(tok.data.values.map((raw, i) => this._mapper.decode(cols[i], raw)));
            break;
          }

          case 'paramFmt':
            paramFmt = tok.data.columns;
            break;

          case 'params':
            outputParams = tok.data.values.map((raw, i) => this._mapper.decode(paramFmt[i], raw));
            break;

          case 'returnStatus':
            returnStatus = tok.data.status;
            break;

          case 'envChange':
            this._applyEnvChange(tok);
            break;

          case 'done': {
            const d = tok.data;
            if (d.hasCount()) { rowCount = d.rowCount; sawCount = true; }
            lastDoneCount = d.rowCount;
            if (d.isError()) doneError = true;
            this._inTransaction = (d.status & DoneStatus.INXACT) !== 0;
            if (!d.hasMore()) {
              if (firstError) throw firstError;
              if (doneError && !firstError) {
                throw new Error('Server meldet Fehler (DONE_ERROR) ohne Fehlermeldung');
              }
              const first = resultSets[0];
              return {
                columns:  first?.columns ?? [],
                rows:     first?.rows ?? [],
                rowCount: sawCount ? rowCount : lastDoneCount,
                resultSets,
                messages,
                returnStatus,
                outputParams,
              };
            }
            break;
          }

          default:
            // loginAck – ignore
            break;
        }
      }
    }
  }

  private _applyEnvChange(tok: TdsToken): void {
    if (tok.type !== 'envChange') return;
    for (const e of tok.data.entries) {
      switch (e.type) {
        case EnvType.DB:
          this._database = e.newValue;
          break;
        case EnvType.CHARSET: {
          const enc = sybaseCharsetToEncoding(e.newValue);
          if (!enc) {
            throw new Error(`Server-Zeichensatz "${e.newValue}" wird nicht unterstützt (utf8, iso_1, ascii_7)`);
          }
          this._mapper.encoding = enc;
          break;
        }
        case EnvType.PACKETSIZE: {
          const size = parseInt(e.newValue, 10);
          if (size >= 512 && size <= 65_535) this._socket.packetSize = size;
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

  /** Sends LOGOUT and closes the socket. Safe to call more than once. */
  async end(): Promise<void> {
    if (this._ended) return;
    await this._enqueue(async () => {
      if (this._ended) return;
      this._ended = true;
      if (!this._socket) return;
      if (!this._socket.closed && !this._broken) {
        await this._socket.send(PduType.BUF_LOGOUT, LogoutToken.build()).catch(() => undefined);
      }
      await this._socket.close();
    });
  }

  /** Immediately closes the socket without LOGOUT (e.g. for broken connections). */
  destroy(): void {
    this._ended = true;
    this._socket?.destroy(new Error('Connection zerstört'));
  }

  // -------------------------------------------------------------------------
  // Internal accessor (for sub-classes and peer classes)
  // -------------------------------------------------------------------------

  get _internal(): this {
    return this;
  }
}
