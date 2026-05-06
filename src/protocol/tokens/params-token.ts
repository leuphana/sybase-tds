import { TokenType } from '../../constants/tds-const';

export class ParamsToken {
  static buildMarker(): Buffer {
    return Buffer.from([TokenType.PARAMS]);
  }

  static build(paramData: Buffer): Buffer {
    return Buffer.concat([Buffer.from([TokenType.PARAMS]), paramData]);
  }
}
