import { CursorTokens } from '../../../../src/protocol/tokens/cursor-tokens';
import { TokenType, CursorType, FetchType, CurInfoCmd } from '../../../../src/constants/tds-const';

describe('CursorTokens', () => {
  const NAME = 'cur1';
  const SQL  = 'SELECT * FROM t';
  const ID   = 42;

  // -------------------------------------------------------------------------
  // CURDECLARE
  // -------------------------------------------------------------------------

  describe('curDeclare()', () => {
    it('erstes Byte = 0x86 (CURDECLARE)', () => {
      expect(CursorTokens.curDeclare(NAME, SQL)[0]).toBe(TokenType.CURDECLARE);
    });

    it('Cursor-Name-Länge korrekt (Byte 3)', () => {
      expect(CursorTokens.curDeclare(NAME, SQL)[3]).toBe(NAME.length);
    });

    it('Cursor-Name folgt ab Byte 4', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      expect(buf.slice(4, 4 + NAME.length).toString('utf8')).toBe(NAME);
    });

    it('Cursor-Typ-Byte nach dem Namen (Standard = RDONLY=1)', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      expect(buf[4 + NAME.length]).toBe(CursorType.RDONLY);
    });

    it('hasArgs-Byte = 0x00 per Standard', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      expect(buf[5 + NAME.length]).toBe(0x00);
    });

    it('SQL-Länge (2 Bytes BE) nach hasArgs', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      const sqlLenOffset = 6 + NAME.length;
      expect(buf.readUInt16BE(sqlLenOffset)).toBe(SQL.length);
    });

    it('SQL-Text folgt nach SQL-Länge', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      const sqlStart = 8 + NAME.length;
      expect(buf.slice(sqlStart, sqlStart + SQL.length).toString('utf8')).toBe(SQL);
    });

    it('Spaltenanzahl = 0 wenn keine Spalten', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      const colCountOffset = 8 + NAME.length + SQL.length;
      expect(buf[colCountOffset]).toBe(0);
    });

    it('Längenfeld = 1 + nameLen + 1 + 1 + 2 + sqlLen + 1', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      const expected = 1 + NAME.length + 1 + 1 + 2 + SQL.length + 1;
      expect(buf.readUInt16BE(1)).toBe(expected);
    });

    it('Gesamtgröße = 3 (token+len) + Längenfeld', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL);
      const len = buf.readUInt16BE(1);
      expect(buf).toHaveLength(3 + len);
    });

    it('cursorType-Flag wird korrekt übertragen', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL, { cursorType: CursorType.UPDATABLE });
      expect(buf[4 + NAME.length]).toBe(CursorType.UPDATABLE);
    });

    it('hasArgs=true setzt Byte korrekt', () => {
      const buf = CursorTokens.curDeclare(NAME, SQL, { hasArgs: true });
      expect(buf[5 + NAME.length]).toBe(0x01);
    });

    it('Spalten werden korrekt eingebettet', () => {
      const cols = ['id', 'name'];
      const buf = CursorTokens.curDeclare(NAME, SQL, { columns: cols });
      const base = 8 + NAME.length + SQL.length;
      expect(buf[base]).toBe(2); // colCount
      expect(buf[base + 1]).toBe(2); // 'id' length
      expect(buf.slice(base + 2, base + 4).toString('utf8')).toBe('id');
      expect(buf[base + 4]).toBe(4); // 'name' length
      expect(buf.slice(base + 5, base + 9).toString('utf8')).toBe('name');
    });
  });

  // -------------------------------------------------------------------------
  // CURDECLARE2
  // -------------------------------------------------------------------------

  describe('curDeclare2()', () => {
    it('erstes Byte = 0x23 (CURDECLARE2)', () => {
      expect(CursorTokens.curDeclare2(NAME, SQL)[0]).toBe(TokenType.CURDECLARE2);
    });

    it('4-Byte-Längenfeld korrekt', () => {
      const buf = CursorTokens.curDeclare2(NAME, SQL);
      const expected = 1 + NAME.length + 1 + 1 + 4 + SQL.length + 2;
      expect(buf.readUInt32BE(1)).toBe(expected);
    });

    it('SQL-Länge (4 Bytes BE) korrekt', () => {
      const buf = CursorTokens.curDeclare2(NAME, SQL);
      // token(1) + length(4) + nameLen(1) + name + cursorType(1) + hasArgs(1) = 8 + NAME.length
      const sqlLenOffset = 8 + NAME.length;
      expect(buf.readUInt32BE(sqlLenOffset)).toBe(SQL.length);
    });

    it('Spaltenanzahl (2 Bytes) = 0 ohne Spalten', () => {
      const buf = CursorTokens.curDeclare2(NAME, SQL);
      // after: token(1)+length(4)+nameLen(1)+name+cursorType(1)+hasArgs(1)+sqlLen(4)+sql
      const colCountOffset = 12 + NAME.length + SQL.length;
      expect(buf.readUInt16BE(colCountOffset)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // CURDECLARE3
  // -------------------------------------------------------------------------

  describe('curDeclare3()', () => {
    it('erstes Byte = 0x10 (CURDECLARE3)', () => {
      expect(CursorTokens.curDeclare3(NAME, SQL)[0]).toBe(TokenType.CURDECLARE3);
    });

    it('Cursor-Typ (4 Bytes) korrekt', () => {
      const buf = CursorTokens.curDeclare3(NAME, SQL, { cursorType: CursorType.SCROLLABLE });
      // token(1) + length(4) + nameLen(1) + name = 6 + NAME.length
      const typeOffset = 6 + NAME.length;
      expect(buf.readUInt32BE(typeOffset)).toBe(CursorType.SCROLLABLE);
    });
  });

  // -------------------------------------------------------------------------
  // CUROPEN
  // -------------------------------------------------------------------------

  describe('curOpen()', () => {
    it('erstes Byte = 0x84 (CUROPEN)', () => {
      expect(CursorTokens.curOpen(ID)[0]).toBe(TokenType.CUROPEN);
    });

    it('Cursor-ID (4 Bytes BE) ab Byte 3', () => {
      const buf = CursorTokens.curOpen(ID);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('hasArgs = 0x00 per Standard (nach ID)', () => {
      const buf = CursorTokens.curOpen(ID);
      expect(buf[7]).toBe(0x00);
    });

    it('Längenfeld = 5 bei bekannter ID', () => {
      expect(CursorTokens.curOpen(ID).readUInt16BE(1)).toBe(5);
    });

    it('Gesamtgröße = 8 bei bekannter ID', () => {
      expect(CursorTokens.curOpen(ID)).toHaveLength(8);
    });

    it('Name eingebettet wenn ID = 0', () => {
      const buf = CursorTokens.curOpen(0, { name: NAME });
      expect(buf.readUInt32BE(3)).toBe(0);
      expect(buf[7]).toBe(NAME.length);
      expect(buf.slice(8, 8 + NAME.length).toString('utf8')).toBe(NAME);
      expect(buf[8 + NAME.length]).toBe(0x00); // hasArgs
    });

    it('hasArgs=true wird korrekt gesetzt', () => {
      const buf = CursorTokens.curOpen(ID, { hasArgs: true });
      expect(buf[7]).toBe(0x01);
    });
  });

  // -------------------------------------------------------------------------
  // CURFETCH
  // -------------------------------------------------------------------------

  describe('curFetch()', () => {
    it('erstes Byte = 0x82 (CURFETCH)', () => {
      expect(CursorTokens.curFetch(ID, FetchType.NEXT)[0]).toBe(TokenType.CURFETCH);
    });

    it('Cursor-ID korrekt', () => {
      const buf = CursorTokens.curFetch(ID, FetchType.NEXT);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('Fetch-Typ = NEXT nach der ID', () => {
      const buf = CursorTokens.curFetch(ID, FetchType.NEXT);
      expect(buf[7]).toBe(FetchType.NEXT);
    });

    it('Längenfeld = 5 für NEXT (keine Zeilennummer)', () => {
      expect(CursorTokens.curFetch(ID, FetchType.NEXT).readUInt16BE(1)).toBe(5);
    });

    it('Längenfeld = 9 für ABS (mit 4-Byte Zeilennummer)', () => {
      expect(CursorTokens.curFetch(ID, FetchType.ABS, { rowNumber: 10 }).readUInt16BE(1)).toBe(9);
    });

    it('Zeilennummer (4 Bytes BE) nach Fetch-Typ bei ABS', () => {
      const buf = CursorTokens.curFetch(ID, FetchType.ABS, { rowNumber: 99 });
      expect(buf.readUInt32BE(8)).toBe(99);
    });

    it('Längenfeld = 9 für REL (mit Offset, auch negativ)', () => {
      expect(CursorTokens.curFetch(ID, FetchType.REL, { rowNumber: -2 }).readUInt16BE(1)).toBe(9);
    });

    it('Relativer Offset (4 Bytes signed BE) korrekt für negative Werte', () => {
      const buf = CursorTokens.curFetch(ID, FetchType.REL, { rowNumber: -2 });
      expect(buf.readInt32BE(8)).toBe(-2);
    });
  });

  // -------------------------------------------------------------------------
  // CURCLOSE
  // -------------------------------------------------------------------------

  describe('curClose()', () => {
    it('erstes Byte = 0x80 (CURCLOSE)', () => {
      expect(CursorTokens.curClose(ID)[0]).toBe(TokenType.CURCLOSE);
    });

    it('Cursor-ID korrekt', () => {
      const buf = CursorTokens.curClose(ID);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('Dealloc-Flag = 0x00 per Standard', () => {
      const buf = CursorTokens.curClose(ID);
      expect(buf[7]).toBe(0x00);
    });

    it('Dealloc-Flag = 0x01 wenn dealloc=true', () => {
      const buf = CursorTokens.curClose(ID, { dealloc: true });
      expect(buf[7]).toBe(0x01);
    });

    it('Längenfeld = 5', () => {
      expect(CursorTokens.curClose(ID).readUInt16BE(1)).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // CURDELETE
  // -------------------------------------------------------------------------

  describe('curDelete()', () => {
    it('erstes Byte = 0x81 (CURDELETE)', () => {
      expect(CursorTokens.curDelete(ID)[0]).toBe(TokenType.CURDELETE);
    });

    it('Cursor-ID korrekt', () => {
      const buf = CursorTokens.curDelete(ID);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('Reserviert-Byte = 0x00 nach ID', () => {
      const buf = CursorTokens.curDelete(ID);
      expect(buf[7]).toBe(0x00);
    });

    it('Tabellen-Name-Länge = 0 wenn kein Tabellenname', () => {
      const buf = CursorTokens.curDelete(ID);
      expect(buf[8]).toBe(0x00);
    });

    it('Tabellenname wird eingebettet', () => {
      const buf = CursorTokens.curDelete(ID, { tableName: 'users' });
      expect(buf[8]).toBe(5);
      expect(buf.slice(9, 14).toString('utf8')).toBe('users');
    });
  });

  // -------------------------------------------------------------------------
  // CURUPDATE
  // -------------------------------------------------------------------------

  describe('curUpdate()', () => {
    const SET = 'col1=@p1';

    it('erstes Byte = 0x85 (CURUPDATE)', () => {
      expect(CursorTokens.curUpdate(ID, SET)[0]).toBe(TokenType.CURUPDATE);
    });

    it('Cursor-ID korrekt', () => {
      const buf = CursorTokens.curUpdate(ID, SET);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('Status = 0x00 per Standard (keine Parameter)', () => {
      const buf = CursorTokens.curUpdate(ID, SET);
      expect(buf[7]).toBe(0x00);
    });

    it('Status = 0x01 wenn hasParams=true', () => {
      const buf = CursorTokens.curUpdate(ID, SET, { hasParams: true });
      expect(buf[7]).toBe(0x01);
    });

    it('SET-Klausel-Länge korrekt (ohne Tabellenname)', () => {
      const buf = CursorTokens.curUpdate(ID, SET);
      // tableNameLen(1=0) + setLen(2) at offset 8
      const setLenOffset = 9; // 8 (tableNameLen=0) + 1 = 9? No: byte 8 = tableNameLen=0, bytes 9-10 = setLen
      expect(buf.readUInt16BE(9)).toBe(SET.length);
    });

    it('SET-Text folgt nach SET-Länge', () => {
      const buf = CursorTokens.curUpdate(ID, SET);
      expect(buf.slice(11, 11 + SET.length).toString('utf8')).toBe(SET);
    });

    it('Tabellenname wird korrekt eingebettet', () => {
      const buf = CursorTokens.curUpdate(ID, SET, { tableName: 'users' });
      expect(buf[8]).toBe(5); // tableNameLen
      expect(buf.slice(9, 14).toString('utf8')).toBe('users');
    });

    it('Längenfeld = 8 + tableLen + setLen', () => {
      const buf = CursorTokens.curUpdate(ID, SET);
      expect(buf.readUInt16BE(1)).toBe(8 + 0 + SET.length);
    });
  });

  // -------------------------------------------------------------------------
  // CURINFO
  // -------------------------------------------------------------------------

  describe('curInfo()', () => {
    it('erstes Byte = 0x83 (CURINFO)', () => {
      expect(CursorTokens.curInfo(ID, CurInfoCmd.INQUIRE)[0]).toBe(TokenType.CURINFO);
    });

    it('Cursor-ID korrekt', () => {
      const buf = CursorTokens.curInfo(ID, CurInfoCmd.INQUIRE);
      expect(buf.readUInt32BE(3)).toBe(ID);
    });

    it('Command-Byte = INQUIRE', () => {
      const buf = CursorTokens.curInfo(ID, CurInfoCmd.INQUIRE);
      expect(buf[7]).toBe(CurInfoCmd.INQUIRE);
    });

    it('Status (2 Bytes) = 0 beim Senden', () => {
      const buf = CursorTokens.curInfo(ID, CurInfoCmd.INQUIRE);
      expect(buf.readUInt16BE(8)).toBe(0);
    });

    it('Längenfeld = 7 für INQUIRE (4 ID + 1 cmd + 2 status)', () => {
      expect(CursorTokens.curInfo(ID, CurInfoCmd.INQUIRE).readUInt16BE(1)).toBe(7);
    });

    it('Längenfeld = 11 für SETCURROWS (+ 4 Byte Fetch-Größe)', () => {
      expect(CursorTokens.curInfo(ID, CurInfoCmd.SETCURROWS, { fetchSize: 20 }).readUInt16BE(1)).toBe(11);
    });

    it('Fetch-Größe (4 Bytes BE) nach Status bei SETCURROWS', () => {
      const buf = CursorTokens.curInfo(ID, CurInfoCmd.SETCURROWS, { fetchSize: 20 });
      expect(buf.readUInt32BE(10)).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // CURINFO3
  // -------------------------------------------------------------------------

  describe('curInfo3()', () => {
    it('erstes Byte = 0x88 (CURINFO3)', () => {
      expect(CursorTokens.curInfo3(ID, CurInfoCmd.INQUIRE)[0]).toBe(TokenType.CURINFO3);
    });

    it('Status (4 Bytes) = 0 beim Senden', () => {
      const buf = CursorTokens.curInfo3(ID, CurInfoCmd.INQUIRE);
      expect(buf.readUInt32BE(8)).toBe(0);
    });

    it('Längenfeld = 9 für INQUIRE (4 ID + 1 cmd + 4 status)', () => {
      expect(CursorTokens.curInfo3(ID, CurInfoCmd.INQUIRE).readUInt16BE(1)).toBe(9);
    });

    it('Längenfeld = 13 für SETCURROWS (+ 4 Byte Fetch-Größe)', () => {
      expect(CursorTokens.curInfo3(ID, CurInfoCmd.SETCURROWS, { fetchSize: 5 }).readUInt16BE(1)).toBe(13);
    });
  });

  // -------------------------------------------------------------------------
  // KEY
  // -------------------------------------------------------------------------

  describe('key()', () => {
    it('erstes Byte = 0xCA (KEY)', () => {
      expect(CursorTokens.key(Buffer.alloc(0))[0]).toBe(TokenType.KEY);
    });

    it('DataFormat-Blöcke folgen direkt nach dem Token-Byte', () => {
      const data = Buffer.from([0x01, 0x02, 0x03]);
      const buf = CursorTokens.key(data);
      expect(buf.slice(1)).toEqual(data);
    });

    it('Gesamtlänge = 1 + Datenlänge', () => {
      const data = Buffer.from([0xAA, 0xBB]);
      expect(CursorTokens.key(data)).toHaveLength(3);
    });
  });
});
