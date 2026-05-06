import { LanguageToken } from '../../../../src/protocol/tokens/language-token';
import { TokenType, LangStatus } from '../../../../src/constants/tds-const';

describe('LanguageToken', () => {
  describe('build() – Grundstruktur', () => {
    it('erstes Byte = 0x21 (LANGUAGE Token-Typ)', () => {
      expect(LanguageToken.build('SELECT 1')[0]).toBe(TokenType.LANGUAGE);
    });

    it('Bytes 1-4 = Body-Länge (SQL-Bytes + 1 Status-Byte) BE', () => {
      const sql = 'SELECT 1'; // 8 Bytes
      const buf = LanguageToken.build(sql);
      expect(buf.readUInt32BE(1)).toBe(9); // 8 + 1 Status-Byte
    });

    it('Byte 5 = Status-Flags = 0x00 (keine Parameter)', () => {
      const buf = LanguageToken.build('SELECT 1');
      expect(buf[5]).toBe(0x00);
    });

    it('SQL-Text folgt ab Byte 6', () => {
      const buf = LanguageToken.build('AB');
      expect(buf[6]).toBe(0x41); // 'A'
      expect(buf[7]).toBe(0x42); // 'B'
    });

    it('Gesamtlänge = 1 (Typ) + 4 (len) + 1 (status) + sqlLen', () => {
      const sql = 'SELECT * FROM t';
      const buf = LanguageToken.build(sql);
      expect(buf).toHaveLength(6 + sql.length);
    });
  });

  describe('build() – hasArgs-Flag', () => {
    it('Status-Byte = 0x01 (LANG_HASARGS) wenn hasArgs=true', () => {
      const buf = LanguageToken.build('SELECT ?', true);
      expect(buf[5]).toBe(LangStatus.HAS_ARGS);
    });

    it('Status-Byte = 0x00 wenn hasArgs=false (Standard)', () => {
      const buf = LanguageToken.build('SELECT 1', false);
      expect(buf[5]).toBe(0x00);
    });
  });

  describe('build() – Encoding', () => {
    it('kodiert SQL als UTF-8 per Standard', () => {
      const sql = 'SELECT 1';
      const buf = LanguageToken.build(sql);
      const sqlPart = buf.slice(6);
      expect(sqlPart).toEqual(Buffer.from(sql, 'utf8'));
    });

    it('Body-Länge entspricht tatsächlichen UTF-8-Bytes', () => {
      // ASCII SQL → 1 Byte pro Zeichen
      const sql = 'SELECT id FROM users WHERE id = 1';
      const buf = LanguageToken.build(sql);
      const bodyLen = buf.readUInt32BE(1);
      expect(bodyLen).toBe(sql.length + 1);
    });
  });

  describe('build() – Leere Query', () => {
    it('leere SQL → Body-Länge = 1 (nur Status-Byte)', () => {
      const buf = LanguageToken.build('');
      expect(buf.readUInt32BE(1)).toBe(1);
      expect(buf).toHaveLength(6);
    });
  });
});
