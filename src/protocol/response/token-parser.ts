import { TokenType } from '../../constants/tds-const';
import { DataFormat } from '../../types/data-format';
import { LoginAckParser, LoginAckData } from './login-ack';
import { DoneParser } from './done-token';
import { EedParser } from './eed-token';
import { EnvChangeParser, EnvEntry } from './env-change-token';
import { RowFmtParser } from './row-fmt-token';
import { RowParser } from './row-token';

// ---------------------------------------------------------------------------
// Discriminated-Union TdsToken
// ---------------------------------------------------------------------------

export type TdsToken =
  | { type: 'loginAck';  data: LoginAckParser }
  | { type: 'done';      data: DoneParser }
  | { type: 'eed';       data: EedParser }
  | { type: 'envChange'; data: EnvChangeParser }
  | { type: 'rowFmt';    data: RowFmtParser }
  | { type: 'row';       data: RowParser }
  | { type: 'paramFmt';  data: RowFmtParser }
  | { type: 'params';    data: RowParser }
  | { type: 'returnStatus'; data: { status: number } };

// ---------------------------------------------------------------------------
// TokenParser
// ---------------------------------------------------------------------------

export class TokenParser {
  private _columns: DataFormat[] = [];
  private _paramColumns: DataFormat[] = [];

  get lastColumns(): DataFormat[] { return this._columns; }

  /**
   * Parses a complete TDS message body (from TdsSocket.receive().data)
   * and returns an array of all contained tokens.
   * ROW tokens are decoded using the column metadata from the last ROWFMT.
   */
  parse(data: Buffer, encoding: BufferEncoding = 'utf8'): TdsToken[] {
    const tokens: TdsToken[] = [];
    let pos = 0;

    while (pos < data.length) {
      const tokenType = data[pos];

      switch (tokenType) {
        case TokenType.LOGINACK: {
          const t = LoginAckParser.read(data.slice(pos), encoding);
          tokens.push({ type: 'loginAck', data: t });
          pos += this._loginAckSize(data, pos);
          break;
        }

        case TokenType.DONE:
        case TokenType.DONEPROC:
        case TokenType.DONEINPROC: {
          const t = DoneParser.read(data.slice(pos));
          tokens.push({ type: 'done', data: t });
          pos += 9; // always 9 bytes
          break;
        }

        case TokenType.EED: {
          const bodyLen = data.readUInt16BE(pos + 1);
          const t = EedParser.read(data.slice(pos), encoding);
          tokens.push({ type: 'eed', data: t });
          pos += 3 + bodyLen;
          break;
        }

        case TokenType.ENVCHANGE: {
          const bodyLen = data.readUInt16BE(pos + 1);
          const t = EnvChangeParser.read(data.slice(pos));
          tokens.push({ type: 'envChange', data: t });
          pos += 3 + bodyLen;
          break;
        }

        case TokenType.ROWFMT:
        case TokenType.ROWFMT2: {
          const bodyLen = data.readUInt16BE(pos + 1);
          const t = RowFmtParser.read(data.slice(pos), encoding);
          this._columns = t.columns;
          tokens.push({ type: 'rowFmt', data: t });
          pos += 3 + bodyLen;
          break;
        }

        case TokenType.ROW: {
          const t = RowParser.read(data.slice(pos), this._columns);
          tokens.push({ type: 'row', data: t });
          pos += t.byteLength;
          break;
        }

        // Output parameters of a stored procedure: PARAMFMT describes, PARAMS carries values.
        case TokenType.PARAMFMT: {
          const bodyLen = data.readUInt16BE(pos + 1);
          const t = RowFmtParser.read(data.slice(pos), encoding);
          this._paramColumns = t.columns;
          tokens.push({ type: 'paramFmt', data: t });
          pos += 3 + bodyLen;
          break;
        }

        case TokenType.PARAMS: {
          const t = RowParser.read(data.slice(pos), this._paramColumns);
          tokens.push({ type: 'params', data: t });
          pos += t.byteLength;
          break;
        }

        // RETURNSTATUS: token byte + fixed INT4, no length field.
        // (Layout not covered by the local docs – verify against a real server.)
        case TokenType.RETURNSTATUS: {
          tokens.push({ type: 'returnStatus', data: { status: data.readInt32BE(pos + 1) } });
          pos += 5;
          break;
        }

        // Length-prefixed tokens we receive but don't need to interpret:
        // CAPABILITY (server echoes its capabilities during login),
        // ORDERBY, TABNAME, COLNAME, COLINFO, RETURNSTATUS, PROCID, DYNAMIC_ACK,
        // COLFMT (0xAE – TDS 4.x column-format metadata Sybase ASE sends alongside ROWFMT).
        // CURINFO / CURINFO3 – server cursor-state notifications sent after cursor operations.
        case TokenType.CAPABILITY:
        case TokenType.UNKONWN1:
        case TokenType.TABNAME:
        case TokenType.COLINFO: // COLINFO
        case TokenType.OPTIONCMD: // OPTIONCMD (server echo)
        case 0xAE: // COLFMT (TDS 4.x compat metadata)
        case 0x7C: // PROCID
        case 0x62: // DYNAMIC2 ACK
        case 0xE7: // DYNAMIC ACK
        case TokenType.ORDERBY:
        case TokenType.CURINFO:
        case TokenType.CURINFO3:
        {
          const bodyLen = data.readUInt16BE(pos + 1);
          pos += 3 + bodyLen;
          break;
        }

        // PARAMFMT2 uses a 4-byte length field.
        case TokenType.PARAMFMT2: {
          const bodyLen = data.readUInt32BE(pos + 1);
          pos += 5 + bodyLen;
          break;
        }

        default:
          throw new Error(
            `Unbekannter TDS-Token-Typ 0x${tokenType.toString(16).padStart(2, '0')} bei Offset ${pos}`,
          );
      }
    }

    return tokens;
  }

  // -------------------------------------------------------------------------
  // Helper methods for size calculation
  // -------------------------------------------------------------------------

  private _loginAckSize(data: Buffer, pos: number): number {
    const bodyLen = data.readUInt16BE(pos + 1);
    return 3 + bodyLen;
  }

}
