import { DoneStatus } from '../../constants/tds-const';
import { TdsReader } from '../tds-reader';

export class DoneParser {
  readonly tokenType: number;
  readonly status: number;
  readonly tranState: number;
  readonly rowCount: number;

  private constructor(tokenType: number, status: number, tranState: number, rowCount: number) {
    this.tokenType = tokenType;
    this.status    = status;
    this.tranState = tranState;
    this.rowCount  = rowCount;
  }

  hasCount(): boolean { return (this.status & DoneStatus.COUNT) !== 0; }
  isError():  boolean { return (this.status & DoneStatus.ERROR) !== 0; }
  hasMore():  boolean { return (this.status & DoneStatus.MORE)  !== 0; }

  /**
   * Layout: [type(1)][status(2)][tranState(2)][rowCount(4)] = 9 bytes total
   */
  static read(buf: Buffer): DoneParser {
    const r = new TdsReader(buf);
    return new DoneParser(
      r.readUInt8(),    // token type
      r.readUInt16BE(), // status
      r.readUInt16BE(), // transaction state
      r.readUInt32BE(), // row count
    );
  }
}
