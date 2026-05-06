import { TokenType, OptionId } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

// Options that carry a 4-byte integer value; all others use 1 byte.
const FOUR_BYTE_OPTIONS = new Set<number>([OptionId.TEXTSIZE, OptionId.ROWCOUNT]);

export class OptionCmdToken {
  /**
   * Layout: [0xA6][length(2)][optCount=1][optionId][valueSize][value]
   * length = 3 + valueSize
   * valueSize: 4 bytes for TEXTSIZE/ROWCOUNT, 1 byte for all other options
   */
  static build(optionId: OptionId, value: number): Buffer {
    const valueSize = FOUR_BYTE_OPTIONS.has(optionId) ? 4 : 1;
    const length = 3 + valueSize; // optCount(1) + optionId(1) + valueSize(1) + value

    const w = new TdsWriter();
    w.writeUInt8(TokenType.OPTIONCMD);
    w.writeUInt16BE(length);
    w.writeUInt8(1); // option count always 1
    w.writeUInt8(optionId);
    w.writeUInt8(valueSize);
    if (valueSize === 4) {
      w.writeUInt32BE(value);
    } else {
      w.writeUInt8(value);
    }

    return w.toBuffer();
  }
}
