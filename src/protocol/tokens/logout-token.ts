import { TokenType } from '../../constants/tds-const';

export class LogoutToken {
  static build(): Buffer {
    return Buffer.from([TokenType.LOGOUT, 0x00]);
  }
}
