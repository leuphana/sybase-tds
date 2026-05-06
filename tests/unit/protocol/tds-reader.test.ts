import { TdsReader } from '../../../src/protocol/tds-reader';
import { TdsWriter } from '../../../src/protocol/tds-writer';

// Hilfsfunktion: Writer → Buffer → Reader (Roundtrip-Basis)
function readerFrom(buf: Buffer, byteswap = false): TdsReader {
  return new TdsReader(buf, byteswap);
}

describe('TdsReader', () => {
  describe('readUInt8()', () => {
    it('liest ein einzelnes Byte', () => {
      const r = readerFrom(Buffer.from([0xAB]));
      expect(r.readUInt8()).toBe(0xAB);
    });

    it('rückt den Offset um 1 vor', () => {
      const r = readerFrom(Buffer.from([0x01, 0x02]));
      r.readUInt8();
      expect(r.offset).toBe(1);
    });

    it('liest sequenziell mehrere Bytes', () => {
      const r = readerFrom(Buffer.from([0x01, 0x02, 0x03]));
      expect(r.readUInt8()).toBe(0x01);
      expect(r.readUInt8()).toBe(0x02);
      expect(r.readUInt8()).toBe(0x03);
    });
  });

  describe('readUInt16BE()', () => {
    it('liest 2 Bytes Big-Endian', () => {
      const r = readerFrom(Buffer.from([0x12, 0x34]));
      expect(r.readUInt16BE()).toBe(0x1234);
    });

    it('rückt den Offset um 2 vor', () => {
      const r = readerFrom(Buffer.from([0x00, 0x00]));
      r.readUInt16BE();
      expect(r.offset).toBe(2);
    });

    it('ist unabhängig vom byteswap-Flag', () => {
      const data = Buffer.from([0x01, 0x00]);
      expect(readerFrom(data, false).readUInt16BE()).toBe(0x0100);
      expect(readerFrom(data, true).readUInt16BE()).toBe(0x0100);
    });
  });

  describe('readInt16BE()', () => {
    it('liest negativen Wert korrekt', () => {
      const r = readerFrom(Buffer.from([0xFF, 0xFF]));
      expect(r.readInt16BE()).toBe(-1);
    });
  });

  describe('readUInt32BE()', () => {
    it('liest 4 Bytes Big-Endian', () => {
      const r = readerFrom(Buffer.from([0x12, 0x34, 0x56, 0x78]));
      expect(r.readUInt32BE()).toBe(0x12345678);
    });

    it('liest TDS-Versionsnummer 0x05000000', () => {
      const r = readerFrom(Buffer.from([0x05, 0x00, 0x00, 0x00]));
      expect(r.readUInt32BE()).toBe(0x05000000);
    });
  });

  describe('readInt32BE()', () => {
    it('liest -1 korrekt', () => {
      const r = readerFrom(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      expect(r.readInt32BE()).toBe(-1);
    });
  });

  describe('readUInt16() – byteswap-aware', () => {
    it('liest Big-Endian wenn byteswap=false', () => {
      const r = readerFrom(Buffer.from([0x02, 0x01]), false);
      expect(r.readUInt16()).toBe(0x0201);
    });

    it('liest Little-Endian wenn byteswap=true', () => {
      const r = readerFrom(Buffer.from([0x01, 0x02]), true);
      expect(r.readUInt16()).toBe(0x0201);
    });
  });

  describe('readUInt32() – byteswap-aware', () => {
    it('liest Big-Endian wenn byteswap=false', () => {
      const r = readerFrom(Buffer.from([0x00, 0x00, 0x02, 0x00]), false);
      expect(r.readUInt32()).toBe(0x00000200);
    });

    it('liest Little-Endian wenn byteswap=true', () => {
      // Wert 512 = 0x200 in LE: [0x00, 0x02, 0x00, 0x00]
      const r = readerFrom(Buffer.from([0x00, 0x02, 0x00, 0x00]), true);
      expect(r.readUInt32()).toBe(512);
    });
  });

  describe('readInt32() – byteswap-aware', () => {
    it('liest -1 Big-Endian', () => {
      const r = readerFrom(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), false);
      expect(r.readInt32()).toBe(-1);
    });

    it('liest -1 Little-Endian', () => {
      const r = readerFrom(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), true);
      expect(r.readInt32()).toBe(-1);
    });
  });

  describe('readBigUInt64() – byteswap-aware', () => {
    it('liest Big-Endian wenn byteswap=false', () => {
      const r = readerFrom(
        Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
        false,
      );
      expect(r.readBigUInt64()).toBe(0x0102030405060708n);
    });

    it('liest Little-Endian wenn byteswap=true', () => {
      const r = readerFrom(
        Buffer.from([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]),
        true,
      );
      expect(r.readBigUInt64()).toBe(0x0102030405060708n);
    });
  });

  describe('readBytes()', () => {
    it('gibt einen Slice der angeforderten Länge zurück', () => {
      const r = readerFrom(Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]));
      expect(r.readBytes(2)).toEqual(Buffer.from([0xDE, 0xAD]));
    });

    it('rückt den Offset korrekt vor', () => {
      const r = readerFrom(Buffer.from([0x01, 0x02, 0x03, 0x04]));
      r.readBytes(2);
      expect(r.offset).toBe(2);
      expect(r.readUInt8()).toBe(0x03);
    });

    it('gibt eine Kopie zurück (keine Referenz)', () => {
      const source = Buffer.from([0x01, 0x02]);
      const r = readerFrom(source);
      const slice = r.readBytes(2);
      slice[0] = 0xFF;
      // source[0] und interner Buffer bleiben unberührt
      expect(source[0]).toBe(0x01);
    });
  });

  describe('readString()', () => {
    it('dekodiert ASCII als Latin-1 (Standard)', () => {
      const r = readerFrom(Buffer.from([0x41, 0x42, 0x43]));
      expect(r.readString(3)).toBe('ABC');
    });

    it('dekodiert UTF-8', () => {
      const r = readerFrom(Buffer.from('AB', 'utf8'));
      expect(r.readString(2, 'utf8')).toBe('AB');
    });
  });

  describe('readStringLen()', () => {
    it('liest maxLen+1 Bytes, gibt nur den aktiven Teil zurück', () => {
      // writeStringLen('AB', 4) → [0x41, 0x42, 0x00, 0x00, 0x02]
      const r = readerFrom(Buffer.from([0x41, 0x42, 0x00, 0x00, 0x02]));
      expect(r.readStringLen(4)).toBe('AB');
      expect(r.offset).toBe(5);
    });

    it('liest leeren String korrekt', () => {
      // writeStringLen('', 5) → [0,0,0,0,0, 0x00]
      const r = readerFrom(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
      expect(r.readStringLen(5)).toBe('');
    });

    it('liest voll belegten String (kein Padding)', () => {
      // writeStringLen('ABCDE', 5) → [0x41,0x42,0x43,0x44,0x45, 0x05]
      const r = readerFrom(
        Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45, 0x05]),
      );
      expect(r.readStringLen(5)).toBe('ABCDE');
    });

    it('simuliert Hostname-Lesen aus Login-Paket (maxLen=30)', () => {
      const w = new TdsWriter();
      w.writeStringLen('myhost', 30);
      const r = readerFrom(w.toBuffer());
      expect(r.readStringLen(30)).toBe('myhost');
      expect(r.offset).toBe(31);
    });
  });

  describe('peek()', () => {
    it('liest ein Byte ohne Offset-Verschiebung', () => {
      const r = readerFrom(Buffer.from([0xAA, 0xBB]));
      expect(r.peek()).toBe(0xAA);
      expect(r.offset).toBe(0);
    });

    it('liest mit Vorwärts-Offset', () => {
      const r = readerFrom(Buffer.from([0xAA, 0xBB, 0xCC]));
      expect(r.peek(1)).toBe(0xBB);
      expect(r.peek(2)).toBe(0xCC);
      expect(r.offset).toBe(0);
    });
  });

  describe('offset und remaining', () => {
    it('offset startet bei 0', () => {
      expect(readerFrom(Buffer.from([0x01])).offset).toBe(0);
    });

    it('remaining entspricht Pufferlänge minus Offset', () => {
      const r = readerFrom(Buffer.from([0x01, 0x02, 0x03]));
      expect(r.remaining).toBe(3);
      r.readUInt8();
      expect(r.remaining).toBe(2);
      r.readUInt16BE();
      expect(r.remaining).toBe(0);
    });
  });

  describe('Roundtrip TdsWriter → TdsReader', () => {
    it('alle Typen Big-Endian roundtrip', () => {
      const w = new TdsWriter(false);
      w.writeUInt8(0xAA)
        .writeUInt16BE(0x1234)
        .writeUInt32BE(0xDEADBEEF)
        .writeStringLen('hello', 10);

      const r = new TdsReader(w.toBuffer(), false);
      expect(r.readUInt8()).toBe(0xAA);
      expect(r.readUInt16BE()).toBe(0x1234);
      expect(r.readUInt32BE()).toBe(0xDEADBEEF);
      expect(r.readStringLen(10)).toBe('hello');
      expect(r.remaining).toBe(0);
    });

    it('byteswap-aware Typen Little-Endian roundtrip', () => {
      const w = new TdsWriter(true);
      w.writeUInt16(0x0201).writeUInt32(512);

      const r = new TdsReader(w.toBuffer(), true);
      expect(r.readUInt16()).toBe(0x0201);
      expect(r.readUInt32()).toBe(512);
      expect(r.remaining).toBe(0);
    });

    it('BigInt roundtrip', () => {
      const value = 0xDEADBEEFCAFEBABEn;
      const w = new TdsWriter(false);
      w.writeBigUInt64(value);
      const r = new TdsReader(w.toBuffer(), false);
      expect(r.readBigUInt64()).toBe(value);
    });
  });
});
