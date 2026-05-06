import { TokenType } from '../../constants/tds-const';
import { DataFormat } from '../../types/data-format';
import { TdsWriter } from '../tds-writer';

export class ParamFmtToken {
  static build(params: DataFormat[]): Buffer {
    const fmtBlocks = params.map(p => p.build());
    const fmtDataLen = fmtBlocks.reduce((sum, b) => sum + b.length, 0);
    const fmtLen = 2 + fmtDataLen; // paramCount(2) + all DataFormat blocks

    const w = new TdsWriter();
    w.writeUInt8(TokenType.PARAMFMT);
    w.writeUInt16BE(fmtLen);
    w.writeUInt16BE(params.length);
    for (const block of fmtBlocks) w.writeBytes(block);

    return w.toBuffer();
  }
}
