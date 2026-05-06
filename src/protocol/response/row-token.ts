import { DataType, RowStatus } from '../../constants/tds-const';
import { TdsReader } from '../tds-reader';
import { DataFormat } from '../../types/data-format';

// Data types with a 4-byte length field in the ROW token
const LARGE_TYPES = new Set<DataType>([
  DataType.TEXT, DataType.IMAGE, DataType.UNITEXT,
  DataType.LONGCHAR, DataType.LONGBINARY,
]);

export class RowParser {
  readonly values: Array<Buffer | null>;

  private constructor(values: Array<Buffer | null>) {
    this.values = values;
  }

  /**
   * Parses a ROW token (0xD1) using the column metadata from ROWFMT.
   *
   * Per column:
   *   - Fixed types without COLUMNSTATUS: read fixedByteLen() bytes directly
   *   - Fixed types with COLUMNSTATUS:    1 byte status; 0 = null, otherwise value bytes
   *   - Variable types (large):           4-byte length, then bytes (0 = null)
   *   - Variable types (normal):          1-byte length, then bytes (0 = null)
   */
  static read(buf: Buffer, columns: DataFormat[]): RowParser {
    const r = new TdsReader(buf);
    r.readUInt8(); // token type (0xD1)

    const values: Array<Buffer | null> = [];

    for (const col of columns) {
      if (col.isFixedLength()) {
        if (col.status & RowStatus.COLUMNSTATUS) {
          const colStatus = r.readUInt8();
          if (colStatus === 0x00) {
            values.push(null);
          } else {
            values.push(r.readBytes(col.fixedByteLen()));
          }
        } else {
          values.push(r.readBytes(col.fixedByteLen()));
        }
      } else {
        const len = LARGE_TYPES.has(col.dataType)
          ? r.readUInt32BE()
          : r.readUInt8();
        values.push(len === 0 ? null : r.readBytes(len));
      }
    }

    return new RowParser(values);
  }
}
