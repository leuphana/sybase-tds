import { TokenType } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

const DBRPC_HAS_PARAMS = 0x0002;

export class DbrpcToken {
  /**
   * Layout: [0xE6][length(2)][nameLen(1)][name][options(2)]
   * length = 3 + nameBytes.length
   * options: 0x0000 = no params, 0x0002 = params follow
   */
  static build(
    procName: string,
    hasParams = false,
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = Buffer.from(procName, encoding);
    const length = 3 + nameBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.DBRPC);
    w.writeUInt16BE(length);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt16BE(hasParams ? DBRPC_HAS_PARAMS : 0x0000);

    return w.toBuffer();
  }
}
