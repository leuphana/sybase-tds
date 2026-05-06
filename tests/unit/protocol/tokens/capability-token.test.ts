import { CapabilityToken } from '../../../../src/protocol/tokens/capability-token';
import { TokenType } from '../../../../src/constants/tds-const';

// Capability-Bit-Positionen aus TDS_RESTLICHE_TOKENS.md
const REQ_LANG    = 1;
const REQ_RPC     = 2;
const REQ_CURSOR  = 6;
const REQ_DYNF    = 7;
const REQ_MSG     = 8;
const CON_NOOOB   = 27;
const PROTO_NOBULK = 30;

describe('CapabilityToken', () => {
  let cap: CapabilityToken;

  beforeEach(() => {
    cap = new CapabilityToken();
  });

  describe('build() – Grundstruktur', () => {
    it('erstes Byte = 0xE2 (CAPABILITY Token-Typ)', () => {
      expect(cap.build()[0]).toBe(TokenType.CAPABILITY);
    });

    it('Bytes 1-2 = Gesamtlänge (reqMaskLen + resMaskLen + 4)', () => {
      const buf = cap.build();
      const len = buf.readUInt16BE(1);
      // Standard: 14 + 10 + 4 = 28
      expect(len).toBe(28);
    });

    it('Byte 3 = 0x01 (Request-Capabilities-Typ)', () => {
      expect(cap.build()[3]).toBe(0x01);
    });

    it('Byte 4 = Request-Masken-Länge (14 Bytes)', () => {
      expect(cap.build()[4]).toBe(14);
    });

    it('Byte 19 = 0x02 (Response-Capabilities-Typ)', () => {
      expect(cap.build()[19]).toBe(0x02);
    });

    it('Byte 20 = Response-Masken-Länge (10 Bytes)', () => {
      expect(cap.build()[20]).toBe(10);
    });

    it('Gesamtlänge des Buffers = 3 (TokenType+Length) + 28 = 31 Bytes', () => {
      expect(cap.build()).toHaveLength(31);
    });
  });

  describe('Standard-Capabilities', () => {
    it('REQ_LANG (Bit 1) ist gesetzt', () => {
      expect(cap.hasReqBit(REQ_LANG)).toBe(true);
    });

    it('REQ_RPC (Bit 2) ist gesetzt', () => {
      expect(cap.hasReqBit(REQ_RPC)).toBe(true);
    });

    it('REQ_CURSOR (Bit 6) ist gesetzt', () => {
      expect(cap.hasReqBit(REQ_CURSOR)).toBe(true);
    });

    it('REQ_DYNF (Bit 7) ist gesetzt', () => {
      expect(cap.hasReqBit(REQ_DYNF)).toBe(true);
    });

    it('REQ_MSG (Bit 8) ist gesetzt', () => {
      expect(cap.hasReqBit(REQ_MSG)).toBe(true);
    });

    it('CON_NOOOB (Bit 27) ist in Response-Maske gesetzt', () => {
      expect(cap.hasResBit(CON_NOOOB)).toBe(true);
    });

    it('PROTO_NOBULK (Bit 30) ist in Response-Maske gesetzt', () => {
      expect(cap.hasResBit(PROTO_NOBULK)).toBe(true);
    });
  });

  describe('setReqBit() / clearReqBit()', () => {
    it('setzt ein Bit korrekt', () => {
      cap.clearReqBit(REQ_LANG);
      expect(cap.hasReqBit(REQ_LANG)).toBe(false);
      cap.setReqBit(REQ_LANG);
      expect(cap.hasReqBit(REQ_LANG)).toBe(true);
    });

    it('Chaining: gibt this zurück', () => {
      expect(cap.setReqBit(10)).toBe(cap);
      expect(cap.clearReqBit(10)).toBe(cap);
    });

    it('gesetztes Bit erscheint korrekt in serialisierten Bytes', () => {
      // Bit 1 (REQ_LANG): Byte-Index = (14-1) - floor(1/8) = 13, Bit 1
      // → mask[13] hat Bit 1 gesetzt → mask[13] & 0x02 != 0
      const buf = cap.build();
      const reqMaskStart = 5; // TokenType(1) + length(2) + capType(1) + maskLen(1)
      const byte13 = buf[reqMaskStart + 13];
      expect(byte13 & 0x02).not.toBe(0); // Bit 1
    });

    it('Bit 8 (REQ_MSG) liegt in Byte 12 der Request-Maske', () => {
      // Bit 8: Byte-Index = (14-1) - floor(8/8) = 13 - 1 = 12, Bit 0
      const buf = cap.build();
      const reqMaskStart = 5;
      const byte12 = buf[reqMaskStart + 12];
      expect(byte12 & 0x01).not.toBe(0); // Bit 0
    });
  });

  describe('setResBit() / clearResBit()', () => {
    it('setzt und löscht Response-Bits', () => {
      cap.clearResBit(CON_NOOOB);
      expect(cap.hasResBit(CON_NOOOB)).toBe(false);
      cap.setResBit(CON_NOOOB);
      expect(cap.hasResBit(CON_NOOOB)).toBe(true);
    });
  });

  describe('Bit-Kodierung Konsistenz', () => {
    it('unbekanntes Bit anfangs nicht gesetzt', () => {
      // Bit 99 sollte nicht gesetzt sein (außerhalb der Standard-Defaults)
      expect(cap.hasReqBit(99)).toBe(false);
    });

    it('Bit nach setReqBit serialisiert und von hasReqBit erkannt', () => {
      cap.setReqBit(50);
      expect(cap.hasReqBit(50)).toBe(true);
    });
  });
});
