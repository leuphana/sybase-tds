import { TdsReader } from '../tds-reader';
import { DataFormat } from '../../types/data-format';

export class RowFmtParser {
  readonly columns: DataFormat[];

  private constructor(columns: DataFormat[]) {
    this.columns = columns;
  }

  /**
   * Layout: [0xEE|0x61][bodyLen(2)][colCount(2)][DataFormat blocks…]
   */
  static read(buf: Buffer, encoding: BufferEncoding = 'utf8'): RowFmtParser {
    const r = new TdsReader(buf);
    r.readUInt8();    // token type (ROWFMT or ROWFMT2)
    r.readUInt16BE(); // body length (not needed — we read colCount then iterate)
    const colCount = r.readUInt16BE();

    const columns: DataFormat[] = [];
    for (let i = 0; i < colCount; i++) {
      columns.push(DataFormat.read(r, encoding));
    }

    return new RowFmtParser(columns);
  }
}
