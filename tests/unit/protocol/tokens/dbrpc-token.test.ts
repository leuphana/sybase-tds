import { DbrpcToken } from '../../../../src/protocol/tokens/dbrpc-token';
import { TokenType } from '../../../../src/constants/tds-const';

describe('DbrpcToken', () => {
  const PROC = 'sp_myprocedure';

  describe('build() – Grundstruktur', () => {
    it('erstes Byte = 0xE6 (DBRPC)', () => {
      expect(DbrpcToken.build(PROC)[0]).toBe(TokenType.DBRPC);
    });

    it('Name-Längen-Byte (Byte 3) korrekt', () => {
      const buf = DbrpcToken.build(PROC);
      expect(buf[3]).toBe(PROC.length);
    });

    it('Prozedurname ab Byte 4 korrekt', () => {
      const buf = DbrpcToken.build(PROC);
      expect(buf.slice(4, 4 + PROC.length).toString('utf8')).toBe(PROC);
    });

    it('Längenfeld (Bytes 1-2) = 3 + nameLen', () => {
      const buf = DbrpcToken.build(PROC);
      expect(buf.readUInt16BE(1)).toBe(3 + PROC.length);
    });

    it('Gesamtpufferlänge = 6 + nameLen', () => {
      const buf = DbrpcToken.build(PROC);
      expect(buf).toHaveLength(6 + PROC.length);
    });
  });

  describe('build() – Optionen', () => {
    it('Optionen = 0x0000 wenn hasParams=false (Standard)', () => {
      const buf = DbrpcToken.build(PROC);
      const optOffset = 4 + PROC.length;
      expect(buf.readUInt16BE(optOffset)).toBe(0x0000);
    });

    it('Optionen = 0x0002 wenn hasParams=true', () => {
      const buf = DbrpcToken.build(PROC, true);
      const optOffset = 4 + PROC.length;
      expect(buf.readUInt16BE(optOffset)).toBe(0x0002);
    });
  });

  describe('build() – kurzer Prozedurname', () => {
    it('funktioniert korrekt für einbuchstabigen Namen', () => {
      const buf = DbrpcToken.build('x');
      expect(buf[0]).toBe(TokenType.DBRPC);
      expect(buf[3]).toBe(1);
      expect(buf[4]).toBe(0x78); // 'x'
      expect(buf).toHaveLength(7);
    });
  });
});
