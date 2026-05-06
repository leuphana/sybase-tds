import { TokenType } from '../../constants/tds-const';
import { TdsReader } from '../tds-reader';
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
  | { type: 'row';       data: RowParser };

// ---------------------------------------------------------------------------
// TokenParser
// ---------------------------------------------------------------------------

export class TokenParser {
  private _columns: DataFormat[] = [];

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
          const rowBytes = this._rowSize(data, pos);
          tokens.push({ type: 'row', data: t });
          pos += rowBytes;
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

  /** Calculates the byte size of a ROW token based on the known columns. */
  private _rowSize(data: Buffer, pos: number): number {
    const r = new TdsReader(data.slice(pos));
    r.readUInt8(); // token type

    for (const col of this._columns) {
      if (col.isFixedLength()) {
        if (col.status & 0x08 /* RowStatus.COLUMNSTATUS */) {
          const cs = r.readUInt8();
          if (cs !== 0x00) r.readBytes(col.fixedByteLen());
        } else {
          r.readBytes(col.fixedByteLen());
        }
      } else {
        const isLarge = [
          0x23, 0x22, 0xAE, 0xAF, 0xE1, // TEXT, IMAGE, UNITEXT, LONGCHAR, LONGBINARY
        ].includes(col.dataType);
        const len = isLarge ? r.readUInt32BE() : r.readUInt8();
        if (len > 0) r.readBytes(len);
      }
    }

    return r.offset;
  }
}
