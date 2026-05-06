import { DynamicToken } from '../../../../src/protocol/tokens/dynamic-token';
import { TokenType, DynamicOp, DynamicStatus } from '../../../../src/constants/tds-const';

describe('DynamicToken', () => {
  const NAME = 'stmt_1';
  const SQL  = 'SELECT * FROM users WHERE id = ?';

  // -----------------------------------------------------------------------
  // prepare()
  // -----------------------------------------------------------------------

  describe('prepare()', () => {
    it('erstes Byte = 0xE7 (DYNAMIC)', () => {
      expect(DynamicToken.prepare(NAME, SQL)[0]).toBe(TokenType.DYNAMIC);
    });

    it('Operationstyp (Byte 3) = 0x01 (PREPARE)', () => {
      expect(DynamicToken.prepare(NAME, SQL)[3]).toBe(DynamicOp.PREPARE);
    });

    it('Status-Byte (Byte 4) = 0x00 per Standard', () => {
      expect(DynamicToken.prepare(NAME, SQL)[4]).toBe(0x00);
    });

    it('Name-Länge (Byte 5) korrekt', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      expect(buf[5]).toBe(NAME.length);
    });

    it('Name-Bytes korrekt ab Byte 6', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      expect(buf.slice(6, 6 + NAME.length).toString('utf8')).toBe(NAME);
    });

    it('SQL-Länge (2 Bytes BE) nach dem Namen', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      const sqlLenOffset = 6 + NAME.length;
      expect(buf.readUInt16BE(sqlLenOffset)).toBe(SQL.length);
    });

    it('SQL-Text folgt nach der SQL-Länge', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      const sqlStart = 6 + NAME.length + 2;
      expect(buf.slice(sqlStart, sqlStart + SQL.length).toString('utf8')).toBe(SQL);
    });

    it('Gesamtlänge (Bytes 1-2) = 3 + nameLen + 2 + sqlLen', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      const expected = 3 + NAME.length + 2 + SQL.length;
      expect(buf.readUInt16BE(1)).toBe(expected);
    });

    it('Buffer-Gesamtlänge = 1 (typ) + 2 (len) + Gesamtlänge', () => {
      const buf = DynamicToken.prepare(NAME, SQL);
      const bodyLen = buf.readUInt16BE(1);
      expect(buf).toHaveLength(3 + bodyLen);
    });

    it('Status-Flags übergebbar', () => {
      const buf = DynamicToken.prepare(NAME, SQL, DynamicStatus.HAS_ARGS);
      expect(buf[4]).toBe(DynamicStatus.HAS_ARGS);
    });
  });

  // -----------------------------------------------------------------------
  // execute()
  // -----------------------------------------------------------------------

  describe('execute()', () => {
    it('erstes Byte = 0xE7 (DYNAMIC)', () => {
      expect(DynamicToken.execute(NAME, false)[0]).toBe(TokenType.DYNAMIC);
    });

    it('Operationstyp (Byte 3) = 0x02 (EXEC)', () => {
      expect(DynamicToken.execute(NAME, false)[3]).toBe(DynamicOp.EXEC);
    });

    it('Status-Byte = 0x01 wenn hasParams=true', () => {
      expect(DynamicToken.execute(NAME, true)[4]).toBe(DynamicStatus.HAS_ARGS);
    });

    it('Status-Byte = 0x00 wenn hasParams=false', () => {
      expect(DynamicToken.execute(NAME, false)[4]).toBe(0x00);
    });

    it('SQL-Länge (2 Bytes) = 0x0000 (kein SQL-Body)', () => {
      const buf = DynamicToken.execute(NAME, false);
      const sqlLenOffset = 6 + NAME.length;
      expect(buf.readUInt16BE(sqlLenOffset)).toBe(0);
    });

    it('Gesamtlänge = 3 + nameLen + 2', () => {
      const buf = DynamicToken.execute(NAME, false);
      expect(buf.readUInt16BE(1)).toBe(3 + NAME.length + 2);
    });

    it('Statement-Name identisch zu PREPARE-Phase', () => {
      const buf = DynamicToken.execute(NAME, false);
      expect(buf.slice(6, 6 + NAME.length).toString('utf8')).toBe(NAME);
    });
  });

  // -----------------------------------------------------------------------
  // deallocate()
  // -----------------------------------------------------------------------

  describe('deallocate()', () => {
    it('erstes Byte = 0xE7 (DYNAMIC)', () => {
      expect(DynamicToken.deallocate(NAME)[0]).toBe(TokenType.DYNAMIC);
    });

    it('Operationstyp (Byte 3) = 0x04 (DEALLOC)', () => {
      expect(DynamicToken.deallocate(NAME)[3]).toBe(DynamicOp.DEALLOC);
    });

    it('Status-Byte = 0x00 (keine Parameter)', () => {
      expect(DynamicToken.deallocate(NAME)[4]).toBe(0x00);
    });

    it('Gesamtlänge = 3 + nameLen + 2', () => {
      const buf = DynamicToken.deallocate(NAME);
      expect(buf.readUInt16BE(1)).toBe(3 + NAME.length + 2);
    });
  });

  // -----------------------------------------------------------------------
  // DYNAMIC2 (große Statements > 32 KB)
  // -----------------------------------------------------------------------

  describe('prepare() – DYNAMIC2 für große Statements', () => {
    it('verwendet DYNAMIC2 (0x62) wenn SQL > 32767 Bytes', () => {
      const bigSql = 'A'.repeat(32768);
      const buf = DynamicToken.prepare(NAME, bigSql);
      expect(buf[0]).toBe(TokenType.DYNAMIC2);
    });

    it('DYNAMIC2 hat 4-Byte-Gesamtlänge', () => {
      const bigSql = 'A'.repeat(32768);
      const buf = DynamicToken.prepare(NAME, bigSql);
      const len = buf.readUInt32BE(1);
      // 3 (op+status+namelen) + nameLen + 4 (sqlLen field) + sqlLen
      expect(len).toBe(3 + NAME.length + 4 + bigSql.length);
    });

    it('DYNAMIC2 Operationstyp (Byte 5) = 0x01 (PREPARE)', () => {
      const bigSql = 'A'.repeat(32768);
      const buf = DynamicToken.prepare(NAME, bigSql);
      expect(buf[5]).toBe(DynamicOp.PREPARE);
    });
  });
});
