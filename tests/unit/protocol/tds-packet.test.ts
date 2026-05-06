import { TdsPacket } from '../../../src/protocol/tds-packet';
import { PduType } from '../../../src/constants/tds-const';

describe('TdsPacket', () => {
  describe('Konstanten', () => {
    it('HEADER_SIZE ist 8', () => {
      expect(TdsPacket.HEADER_SIZE).toBe(8);
    });
  });

  describe('Konstruktor', () => {
    it('setzt pduType, body, packetNumber und isLast korrekt', () => {
      const body = Buffer.from([0x01, 0x02]);
      const pkt = new TdsPacket(PduType.BUF_LANG, body, 1, true);
      expect(pkt.pduType).toBe(PduType.BUF_LANG);
      expect(pkt.body).toEqual(body);
      expect(pkt.packetNumber).toBe(1);
      expect(pkt.isLast).toBe(true);
    });

    it('Standard-Parameter: packetNumber=1, isLast=true', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0));
      expect(pkt.packetNumber).toBe(1);
      expect(pkt.isLast).toBe(true);
    });
  });

  describe('toBuffer()', () => {
    it('gesamtlänge = HEADER_SIZE + body.length', () => {
      const body = Buffer.alloc(10);
      const pkt = new TdsPacket(PduType.BUF_LOGIN, body, 1, true);
      expect(pkt.toBuffer()).toHaveLength(TdsPacket.HEADER_SIZE + 10);
    });

    it('Byte 0 = PDU-Typ', () => {
      const pkt = new TdsPacket(PduType.BUF_LOGIN, Buffer.alloc(0), 1, true);
      expect(pkt.toBuffer()[0]).toBe(0x02); // BUF_LOGIN
    });

    it('Byte 1 = 0x01 (EOM) wenn isLast=true', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, true);
      expect(pkt.toBuffer()[1]).toBe(0x01);
    });

    it('Byte 1 = 0x00 wenn isLast=false', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, false);
      expect(pkt.toBuffer()[1]).toBe(0x00);
    });

    it('Bytes 2-3 = Paketlänge Big-Endian (inkl. 8-Byte-Header)', () => {
      const body = Buffer.alloc(20);
      const pkt = new TdsPacket(PduType.BUF_LANG, body, 1, true);
      const buf = pkt.toBuffer();
      const totalLen = buf.readUInt16BE(2);
      expect(totalLen).toBe(TdsPacket.HEADER_SIZE + 20);
    });

    it('Bytes 4-5 = 0x0000 (Channel, immer 0)', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, true);
      const buf = pkt.toBuffer();
      expect(buf[4]).toBe(0x00);
      expect(buf[5]).toBe(0x00);
    });

    it('Byte 6 = Paketnummer', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 3, true);
      expect(pkt.toBuffer()[6]).toBe(3);
    });

    it('Byte 7 = 0x00 (Window, immer 0)', () => {
      const pkt = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, true);
      expect(pkt.toBuffer()[7]).toBe(0x00);
    });

    it('Body-Bytes beginnen nach dem 8-Byte-Header', () => {
      const body = Buffer.from([0xAA, 0xBB, 0xCC]);
      const pkt = new TdsPacket(PduType.BUF_LANG, body, 1, true);
      const buf = pkt.toBuffer();
      expect(buf[8]).toBe(0xAA);
      expect(buf[9]).toBe(0xBB);
      expect(buf[10]).toBe(0xCC);
    });

    it('Login-Paket: PDU-Typ 0x02, Paketlänge = 8 + bodyLen', () => {
      // Simuliert einen Mini-Login-Body
      const body = Buffer.alloc(568, 0x00);
      const pkt = new TdsPacket(PduType.BUF_LOGIN, body, 1, true);
      const buf = pkt.toBuffer();
      expect(buf[0]).toBe(0x02);
      expect(buf.readUInt16BE(2)).toBe(576); // 8 + 568
    });

    it('RPC-Paket: PDU-Typ 0x03', () => {
      const pkt = new TdsPacket(PduType.BUF_RPC, Buffer.alloc(4), 1, true);
      expect(pkt.toBuffer()[0]).toBe(0x03);
    });
  });

  describe('fromBuffer()', () => {
    it('parst PDU-Typ korrekt', () => {
      const buf = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(5), 1, true).toBuffer();
      expect(TdsPacket.fromBuffer(buf).pduType).toBe(PduType.BUF_LANG);
    });

    it('parst isLast=true bei Status-Bit 0x01', () => {
      const buf = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, true).toBuffer();
      expect(TdsPacket.fromBuffer(buf).isLast).toBe(true);
    });

    it('parst isLast=false bei Status-Bit 0x00', () => {
      const buf = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, false).toBuffer();
      expect(TdsPacket.fromBuffer(buf).isLast).toBe(false);
    });

    it('parst Paketnummer korrekt', () => {
      const buf = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 7, true).toBuffer();
      expect(TdsPacket.fromBuffer(buf).packetNumber).toBe(7);
    });

    it('parst Body korrekt', () => {
      const body = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
      const buf = new TdsPacket(PduType.BUF_LANG, body, 1, true).toBuffer();
      expect(TdsPacket.fromBuffer(buf).body).toEqual(body);
    });

    it('wirft RangeError bei Buffer kürzer als HEADER_SIZE', () => {
      expect(() => TdsPacket.fromBuffer(Buffer.alloc(7))).toThrow(RangeError);
    });

    it('wirft RangeError wenn Buffer kürzer als deklarierte Paketlänge', () => {
      // Header mit totalLen=100, aber Buffer nur 10 Bytes
      const buf = Buffer.alloc(10);
      buf[0] = PduType.BUF_LANG;
      buf[1] = 0x01;
      buf.writeUInt16BE(100, 2); // behauptet 100 Bytes
      expect(() => TdsPacket.fromBuffer(buf)).toThrow(RangeError);
    });

    it('akzeptiert Buffer der größer als die deklarierte Länge ist (Slice)', () => {
      const body = Buffer.from([0x01, 0x02]);
      const inner = new TdsPacket(PduType.BUF_LANG, body, 1, true);
      // Extra-Bytes am Ende
      const extended = Buffer.concat([inner.toBuffer(), Buffer.alloc(5)]);
      const parsed = TdsPacket.fromBuffer(extended);
      expect(parsed.body).toEqual(body);
    });
  });

  describe('Roundtrip', () => {
    it('toBuffer → fromBuffer ergibt dieselben Felder', () => {
      const original = new TdsPacket(
        PduType.BUF_RPC,
        Buffer.from([0x11, 0x22, 0x33]),
        5,
        false,
      );
      const parsed = TdsPacket.fromBuffer(original.toBuffer());
      expect(parsed.pduType).toBe(original.pduType);
      expect(parsed.body).toEqual(original.body);
      expect(parsed.packetNumber).toBe(original.packetNumber);
      expect(parsed.isLast).toBe(original.isLast);
    });

    it('leerer Body Roundtrip', () => {
      const original = new TdsPacket(PduType.BUF_LANG, Buffer.alloc(0), 1, true);
      const parsed = TdsPacket.fromBuffer(original.toBuffer());
      expect(parsed.body).toHaveLength(0);
    });
  });
});
