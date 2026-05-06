import { TdsReader } from '../tds-reader';

export interface EnvEntry {
  type: number;
  newValue: string;
  oldValue: string;
}

export class EnvChangeParser {
  readonly entries: EnvEntry[];

  private constructor(entries: EnvEntry[]) {
    this.entries = entries;
  }

  /**
   * Layout: [0xE3][bodyLen(2)]
   * Then repeating until bodyLen is consumed:
   *   [envType(1)][newLen(1)][newValue][oldLen(1)][oldValue]
   */
  static read(buf: Buffer, encoding: BufferEncoding = 'ascii'): EnvChangeParser {
    const r = new TdsReader(buf);
    r.readUInt8();                  // token type
    const bodyLen = r.readUInt16BE();
    const end     = r.offset + bodyLen;
    const entries: EnvEntry[] = [];

    while (r.offset < end) {
      const type      = r.readUInt8();
      const newLen    = r.readUInt8();
      const newValue  = newLen > 0 ? r.readString(newLen, encoding) : '';
      const oldLen    = r.readUInt8();
      const oldValue  = oldLen > 0 ? r.readString(oldLen, encoding) : '';
      entries.push({ type, newValue, oldValue });
    }

    return new EnvChangeParser(entries);
  }
}
