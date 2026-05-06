import { TdsWriter } from '../../../src/protocol/tds-writer';

describe('TdsWriter', () => {
  describe('writeUInt8()', () => {
    it('schreibt ein einzelnes Byte korrekt', () => {
      const w = new TdsWriter();
      w.writeUInt8(0xAB);
      expect(w.toBuffer()).toEqual(Buffer.from([0xAB]));
    });

    it('schreibt 0x00', () => {
      const w = new TdsWriter();
      w.writeUInt8(0x00);
      expect(w.toBuffer()).toEqual(Buffer.from([0x00]));
    });

    it('schreibt 0xFF', () => {
      const w = new TdsWriter();
      w.writeUInt8(0xFF);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF]));
    });

    it('gibt this zurück (Chaining)', () => {
      const w = new TdsWriter();
      expect(w.writeUInt8(0x01)).toBe(w);
    });
  });

  describe('writeUInt16BE()', () => {
    it('schreibt 2 Bytes Big-Endian', () => {
      const w = new TdsWriter();
      w.writeUInt16BE(0x1234);
      expect(w.toBuffer()).toEqual(Buffer.from([0x12, 0x34]));
    });

    it('schreibt 0x0000', () => {
      const w = new TdsWriter();
      w.writeUInt16BE(0x0000);
      expect(w.toBuffer()).toEqual(Buffer.from([0x00, 0x00]));
    });

    it('schreibt 0xFFFF', () => {
      const w = new TdsWriter();
      w.writeUInt16BE(0xFFFF);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF, 0xFF]));
    });

    it('ist unabhängig vom byteswap-Flag', () => {
      const wBE = new TdsWriter(false);
      const wLE = new TdsWriter(true);
      wBE.writeUInt16BE(0x0100);
      wLE.writeUInt16BE(0x0100);
      expect(wBE.toBuffer()).toEqual(wLE.toBuffer());
    });
  });

  describe('writeInt16BE()', () => {
    it('schreibt negative Werte korrekt', () => {
      const w = new TdsWriter();
      w.writeInt16BE(-1);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF, 0xFF]));
    });

    it('schreibt -256 als [0xFF, 0x00]', () => {
      const w = new TdsWriter();
      w.writeInt16BE(-256);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF, 0x00]));
    });
  });

  describe('writeUInt32BE()', () => {
    it('schreibt 4 Bytes Big-Endian', () => {
      const w = new TdsWriter();
      w.writeUInt32BE(0x12345678);
      expect(w.toBuffer()).toEqual(Buffer.from([0x12, 0x34, 0x56, 0x78]));
    });

    it('schreibt TDS-Versionsnummer 0x05000000', () => {
      const w = new TdsWriter();
      w.writeUInt32BE(0x05000000);
      expect(w.toBuffer()).toEqual(Buffer.from([0x05, 0x00, 0x00, 0x00]));
    });

    it('ist unabhängig vom byteswap-Flag', () => {
      const wBE = new TdsWriter(false);
      const wLE = new TdsWriter(true);
      wBE.writeUInt32BE(0xDEADBEEF);
      wLE.writeUInt32BE(0xDEADBEEF);
      expect(wBE.toBuffer()).toEqual(wLE.toBuffer());
    });
  });

  describe('writeUInt16() – byteswap-aware', () => {
    it('schreibt Big-Endian wenn byteswap=false', () => {
      const w = new TdsWriter(false);
      w.writeUInt16(0x0201);
      expect(w.toBuffer()).toEqual(Buffer.from([0x02, 0x01]));
    });

    it('schreibt Little-Endian wenn byteswap=true', () => {
      const w = new TdsWriter(true);
      w.writeUInt16(0x0201);
      expect(w.toBuffer()).toEqual(Buffer.from([0x01, 0x02]));
    });
  });

  describe('writeUInt32() – byteswap-aware', () => {
    it('schreibt Big-Endian wenn byteswap=false (Standard)', () => {
      const w = new TdsWriter(false);
      w.writeUInt32(0x00000200);
      expect(w.toBuffer()).toEqual(Buffer.from([0x00, 0x00, 0x02, 0x00]));
    });

    it('schreibt Little-Endian wenn byteswap=true', () => {
      const w = new TdsWriter(true);
      w.writeUInt32(0x00000200);
      expect(w.toBuffer()).toEqual(Buffer.from([0x00, 0x02, 0x00, 0x00]));
    });

    it('bufSize 512 = 0x200 wird byteswap-abhängig korrekt geschrieben', () => {
      const wBE = new TdsWriter(false);
      wBE.writeUInt32(512);
      expect(wBE.toBuffer()).toEqual(Buffer.from([0x00, 0x00, 0x02, 0x00]));

      const wLE = new TdsWriter(true);
      wLE.writeUInt32(512);
      expect(wLE.toBuffer()).toEqual(Buffer.from([0x00, 0x02, 0x00, 0x00]));
    });
  });

  describe('writeInt32() – byteswap-aware', () => {
    it('schreibt -1 als 0xFFFFFFFF Big-Endian', () => {
      const w = new TdsWriter(false);
      w.writeInt32(-1);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
    });

    it('schreibt -1 als 0xFFFFFFFF Little-Endian', () => {
      const w = new TdsWriter(true);
      w.writeInt32(-1);
      expect(w.toBuffer()).toEqual(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('writeBigUInt64() – byteswap-aware', () => {
    it('schreibt Big-Endian wenn byteswap=false', () => {
      const w = new TdsWriter(false);
      w.writeBigUInt64(0x0102030405060708n);
      expect(w.toBuffer()).toEqual(
        Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
      );
    });

    it('schreibt Little-Endian wenn byteswap=true', () => {
      const w = new TdsWriter(true);
      w.writeBigUInt64(0x0102030405060708n);
      expect(w.toBuffer()).toEqual(
        Buffer.from([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]),
      );
    });
  });

  describe('writeBytes()', () => {
    it('kopiert den Buffer ohne Veränderung', () => {
      const w = new TdsWriter();
      const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
      w.writeBytes(data);
      expect(w.toBuffer()).toEqual(data);
    });

    it('isoliert den internen State (keine Referenz)', () => {
      const w = new TdsWriter();
      const data = Buffer.from([0x01, 0x02]);
      w.writeBytes(data);
      data[0] = 0xFF;
      expect(w.toBuffer()[0]).toBe(0x01);
    });
  });

  describe('writeZeros()', () => {
    it('schreibt n Nullbytes', () => {
      const w = new TdsWriter();
      w.writeZeros(3);
      expect(w.toBuffer()).toEqual(Buffer.from([0x00, 0x00, 0x00]));
    });

    it('schreibt 0 Bytes ohne Fehler', () => {
      const w = new TdsWriter();
      w.writeZeros(0);
      expect(w.toBuffer()).toHaveLength(0);
    });
  });

  describe('writeString()', () => {
    it('kodiert ASCII-String als Latin-1 (Standard)', () => {
      const w = new TdsWriter();
      w.writeString('ABC');
      expect(w.toBuffer()).toEqual(Buffer.from([0x41, 0x42, 0x43]));
    });

    it('kodiert UTF-8-String korrekt', () => {
      const w = new TdsWriter();
      w.writeString('AB', 'utf8');
      expect(w.toBuffer()).toEqual(Buffer.from([0x41, 0x42]));
    });

    it('schreibt leeren String ohne Bytes', () => {
      const w = new TdsWriter();
      w.writeString('');
      expect(w.toBuffer()).toHaveLength(0);
    });
  });

  describe('writeStringLen()', () => {
    it('schreibt genau maxLen+1 Bytes', () => {
      const w = new TdsWriter();
      w.writeStringLen('hi', 10);
      expect(w.toBuffer()).toHaveLength(11);
    });

    it('String wird korrekt eingebettet, Rest ist 0x00', () => {
      const w = new TdsWriter();
      w.writeStringLen('AB', 4);
      // Bytes: [0x41, 0x42, 0x00, 0x00, 0x02]
      const buf = w.toBuffer();
      expect(buf[0]).toBe(0x41); // 'A'
      expect(buf[1]).toBe(0x42); // 'B'
      expect(buf[2]).toBe(0x00); // Padding
      expect(buf[3]).toBe(0x00); // Padding
      expect(buf[4]).toBe(0x02); // Länge
    });

    it('leerer String: nur Nullbytes + Längenbyte 0', () => {
      const w = new TdsWriter();
      w.writeStringLen('', 5);
      const buf = w.toBuffer();
      expect(buf).toHaveLength(6);
      expect(buf[5]).toBe(0x00); // Länge = 0
      for (let i = 0; i < 5; i++) {
        expect(buf[i]).toBe(0x00);
      }
    });

    it('String genau so lang wie maxLen: kein Padding, Länge = maxLen', () => {
      const w = new TdsWriter();
      w.writeStringLen('ABCDE', 5);
      const buf = w.toBuffer();
      expect(buf).toHaveLength(6);
      expect(buf[5]).toBe(5);
    });

    it('String länger als maxLen: wird auf maxLen Bytes abgeschnitten', () => {
      const w = new TdsWriter();
      w.writeStringLen('ABCDEFGH', 5);
      const buf = w.toBuffer();
      expect(buf).toHaveLength(6);
      expect(buf[5]).toBe(5); // Länge = maxLen
    });

    it('simuliert Hostname-Feld aus Login-Paket (maxLen=30)', () => {
      const w = new TdsWriter();
      w.writeStringLen('myhost', 30);
      const buf = w.toBuffer();
      expect(buf).toHaveLength(31); // 30 + 1 Längenbyte
      expect(buf.slice(0, 6).toString('latin1')).toBe('myhost');
      expect(buf[6]).toBe(0x00); // Padding
      expect(buf[30]).toBe(6);   // Länge
    });
  });

  describe('byteLength', () => {
    it('gibt die akkumulierte Byte-Länge zurück', () => {
      const w = new TdsWriter();
      w.writeUInt8(0x01);
      w.writeUInt16BE(0x0203);
      w.writeUInt32BE(0x04050607);
      expect(w.byteLength).toBe(7);
    });

    it('ist 0 bei frisch erstelltem Writer', () => {
      expect(new TdsWriter().byteLength).toBe(0);
    });
  });

  describe('Chaining', () => {
    it('erlaubt Methodenketten', () => {
      const buf = new TdsWriter()
        .writeUInt8(0x01)
        .writeUInt16BE(0x0203)
        .writeUInt32BE(0x04050607)
        .writeString('AB')
        .writeZeros(2)
        .toBuffer();
      expect(buf).toHaveLength(1 + 2 + 4 + 2 + 2);
      expect(buf[0]).toBe(0x01);
    });
  });

  describe('toBuffer()', () => {
    it('gibt leeren Buffer zurück wenn nichts geschrieben', () => {
      expect(new TdsWriter().toBuffer()).toHaveLength(0);
    });

    it('konkateniert alle Chunks korrekt', () => {
      const w = new TdsWriter();
      w.writeUInt8(0xAA);
      w.writeUInt8(0xBB);
      w.writeUInt8(0xCC);
      const buf = w.toBuffer();
      expect(buf).toEqual(Buffer.from([0xAA, 0xBB, 0xCC]));
    });
  });
});
