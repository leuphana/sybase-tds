import { PduType } from '../constants/tds-const';

/**
 * Represents a single TDS 5.0 network packet.
 *
 * Structure (byte map from TDS_LOGIN_PAKET.md):
 *   Byte 0:   PDU type
 *   Byte 1:   Status flags  (0x01 = EOM, last packet)
 *   Byte 2-3: Packet length  (big-endian, including 8-byte header)
 *   Byte 4-5: Channel        (always 0x0000)
 *   Byte 6:   Packet number  (sequence starting at 1)
 *   Byte 7:   Window         (always 0x00)
 *   Byte 8+:  Body
 */
export class TdsPacket {
  static readonly HEADER_SIZE = 8;

  constructor(
    readonly pduType: PduType,
    readonly body: Buffer,
    readonly packetNumber = 0,
    readonly isLast = true,
  ) {}

  toBuffer(): Buffer {
    const totalLen = TdsPacket.HEADER_SIZE + this.body.length;
    const buf = Buffer.alloc(totalLen);

    buf[0] = this.pduType;
    buf[1] = this.isLast ? 0x01 : 0x00;
    buf.writeUInt16BE(totalLen, 2);
    buf.writeUInt16BE(0x0000, 4);     // Channel
    buf[6] = this.packetNumber;
    buf[7] = 0x00;                    // Window

    this.body.copy(buf, TdsPacket.HEADER_SIZE);
    return buf;
  }

  static fromBuffer(buf: Buffer): TdsPacket {
    if (buf.length < TdsPacket.HEADER_SIZE) {
      throw new RangeError(
        `Buffer zu kurz für TDS-Header: ${buf.length} < ${TdsPacket.HEADER_SIZE}`,
      );
    }

    const totalLen = buf.readUInt16BE(2);
    if (buf.length < totalLen) {
      throw new RangeError(
        `Buffer zu kurz für deklarierte Paketlänge: ${buf.length} < ${totalLen}`,
      );
    }

    const pduType      = buf[0] as PduType;
    const status       = buf[1];
    const packetNumber = buf[6];
    const isLast       = (status & 0x01) !== 0;
    const body         = Buffer.from(buf.slice(TdsPacket.HEADER_SIZE, totalLen));

    return new TdsPacket(pduType, body, packetNumber, isLast);
  }
}
