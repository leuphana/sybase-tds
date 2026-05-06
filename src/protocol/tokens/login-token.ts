import {
  ByteOrder,
  SecLoginFlags,
  LOGIN_BODY_SIZE,
  DEFAULT_PACKET_SIZE,
  DEFAULT_CHARSET,
  DEFAULT_LANGUAGE,
  PROGRAM_NAME,
  PROGRAM_NAME_MAX,
  TDS_VERSION,
} from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

export interface LoginOptions {
  username: string;
  password?: string;
  hostname?: string;
  servername?: string;
  appName?: string;
  language?: string;
  charset?: string;
  packetSize?: number;
  byteswap?: boolean;
  encryptedPassword?: boolean;
}

/**
 * Builds the 568-byte TDS 5.0 login body.
 *
 * Byte map from TDS_LOGIN_PAKET.md. Transmitted with PduType.BUF_LOGIN via
 * TdsSocket.send().
 */
export class LoginToken {
  static build(options: LoginOptions): Buffer {
    const {
      username,
      password          = '',
      hostname          = '',
      servername        = '',
      appName           = PROGRAM_NAME,
      language          = DEFAULT_LANGUAGE,
      charset           = DEFAULT_CHARSET,
      packetSize        = DEFAULT_PACKET_SIZE,
      byteswap          = false,
      encryptedPassword = false,
    } = options;

    const pwField   = encryptedPassword ? '' : password;
    const secLogin  = encryptedPassword ? SecLoginFlags.ALL_ENCRYPT : SecLoginFlags.NONE;
    const pid       = process.pid.toString();

    const w = new TdsWriter(byteswap);

    // 0-30: Hostname (30 + 1)
    w.writeStringLen(hostname,   30, 'latin1');
    // 31-61: Username (30 + 1)
    w.writeStringLen(username,   30, 'latin1');
    // 62-92: Password (30 + 1)
    w.writeStringLen(pwField,    30, 'latin1');
    // 93-123: Host process ID (30 + 1)
    w.writeStringLen(pid,        30, 'latin1');

    // 124: INT2 byte order
    w.writeUInt8(byteswap ? ByteOrder.INT2_LE : ByteOrder.INT2_BE);
    // 125: INT4 byte order
    w.writeUInt8(byteswap ? ByteOrder.INT4_LE : ByteOrder.INT4_BE);
    // 126: Character type (hardcoded 0x06)
    w.writeUInt8(0x06);
    // 127: Float type
    w.writeUInt8(byteswap ? ByteOrder.FLT_LE : ByteOrder.FLT_BE);
    // 128: Datetime type
    w.writeUInt8(byteswap ? ByteOrder.TWO_I4_LE : ByteOrder.TWO_I4_BE);
    // 129: Interface type (SQL = 0x01)
    w.writeUInt8(0x01);
    // 130: Connection type (0x00)
    w.writeUInt8(0x00);
    // 131-132: Spare
    w.writeZeros(2);
    // 133-136: Network buffer size (byteswap-aware)
    w.writeUInt32(packetSize);
    // 137-139: Spare
    w.writeZeros(3);

    // 140-170: App name (30 + 1)
    w.writeStringLen(appName,    30, 'latin1');
    // 171-201: Server name (30 + 1)
    w.writeStringLen(servername, 30, 'latin1');

    // 202-457: Remote password (255 + 1 length byte)
    LoginToken._writeRemotePassword(w, password, encryptedPassword);

    // 458-461: TDS version 5.0
    w.writeBytes(TDS_VERSION);
    // 462-472: Program name (10 + 1)
    w.writeStringLen(PROGRAM_NAME, PROGRAM_NAME_MAX, 'latin1');
    // 473-476: Program version [Major, Minor, Point, SP]
    w.writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00]));

    // 477: Spare
    w.writeUInt8(0x00);
    // 478: Float4 type
    w.writeUInt8(byteswap ? ByteOrder.FLT4_LE : ByteOrder.FLT4_BE);
    // 479: Smalldatetime type
    w.writeUInt8(byteswap ? ByteOrder.TWO_I2_LE : ByteOrder.TWO_I2_BE);

    // 480-510: Language (30 + 1)
    w.writeStringLen(language, 30, 'latin1');
    // 511: Notify language changes (0x00)
    w.writeUInt8(0x00);
    // 512-513: OLDSECURE
    w.writeZeros(2);
    // 514: lseclogin
    w.writeUInt8(secLogin);
    // 515: Security bulk (0x00)
    w.writeUInt8(0x00);
    // 516: HA login type (0x00 = no HA)
    w.writeUInt8(0x00);
    // 517-522: HA session ID
    w.writeZeros(6);
    // 523-524: SECSPARE
    w.writeZeros(2);

    // 525-555: Character set (30 + 1)
    w.writeStringLen(charset, 30, 'latin1');
    // 556: Notify charset changes (0x01)
    w.writeUInt8(0x01);
    // 557-563: Packet size as string (6 + 1)
    w.writeStringLen(packetSize.toString(), 6, 'latin1');
    // 564-567: DUMMY
    w.writeZeros(4);

    const body = w.toBuffer();

    if (body.length !== LOGIN_BODY_SIZE) {
      throw new Error(
        `Login-Body-Größe falsch: ${body.length} !== ${LOGIN_BODY_SIZE}`,
      );
    }

    return body;
  }

  // --------------------------------------------------------------------------
  // Remote password field (202-457): format \0<len><pw>
  // --------------------------------------------------------------------------

  private static _writeRemotePassword(
    w: TdsWriter,
    password: string,
    encryptedPassword: boolean,
  ): void {
    if (encryptedPassword || password.length === 0) {
      w.writeZeros(255);
      w.writeUInt8(0x00);
      return;
    }

    const pwBytes   = Buffer.from(password, 'latin1');
    const pwLen     = Math.min(pwBytes.length, 253); // max 253 so that 1+1+253=255
    const totalUsed = 1 + 1 + pwLen;                 // null + lenByte + pw

    const content = Buffer.alloc(255);
    content[0] = 0x00;              // leading null
    content[1] = pwLen;             // password length
    pwBytes.copy(content, 2, 0, pwLen);

    w.writeBytes(content);
    w.writeUInt8(totalUsed);        // length byte
  }
}
