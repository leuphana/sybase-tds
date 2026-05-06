import { TokenType, CursorType, FetchType, CurInfoCmd } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

// ---------------------------------------------------------------------------
// CURDECLARE options
// ---------------------------------------------------------------------------

export interface CurDeclareOptions {
  cursorType?: number;
  hasArgs?: boolean;
  columns?: string[];
}

// ---------------------------------------------------------------------------
// Helper: write cursor ID + optional name (shared by CUROPEN, CURFETCH, etc.)
// ---------------------------------------------------------------------------

function writeCursorIdOrName(
  w: TdsWriter,
  id: number,
  name?: string,
  encoding: BufferEncoding = 'utf8',
): number {
  w.writeUInt32BE(id);
  let extra = 0;
  if (id === 0 && name !== undefined) {
    const nameBytes = Buffer.from(name, encoding);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    extra = 1 + nameBytes.length;
  }
  return extra; // bytes added beyond the 4-byte ID
}

// ---------------------------------------------------------------------------
// CursorTokens
// ---------------------------------------------------------------------------

export class CursorTokens {

  // -------------------------------------------------------------------------
  // CURDECLARE (0x86) – 2-byte lengths, 1-byte cursor type, 1-byte colCount
  // -------------------------------------------------------------------------

  static curDeclare(
    name: string,
    sql: string,
    options: CurDeclareOptions = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const cursorType = options.cursorType ?? CursorType.RDONLY;
    const hasArgs    = options.hasArgs ?? false;
    const columns    = options.columns ?? [];
    const nameBytes  = Buffer.from(name, encoding);
    const sqlBytes   = Buffer.from(sql, encoding);

    const colBlocks = columns.map(c => Buffer.from(c, encoding));
    const colLen    = colBlocks.reduce((s, b) => s + 1 + b.length, 0);

    // length = nameLen(1) + name + cursorType(1) + hasArgs(1) + sqlLen(2) + sql + colCount(1) + colLen
    const length = 1 + nameBytes.length + 1 + 1 + 2 + sqlBytes.length + 1 + colLen;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURDECLARE);
    w.writeUInt16BE(length);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt8(cursorType);
    w.writeUInt8(hasArgs ? 0x01 : 0x00);
    w.writeUInt16BE(sqlBytes.length);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);
    w.writeUInt8(columns.length);
    for (const b of colBlocks) {
      w.writeUInt8(b.length);
      w.writeBytes(b);
    }

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURDECLARE2 (0x23) – 4-byte lengths, 1-byte cursor type, 2-byte colCount
  // -------------------------------------------------------------------------

  static curDeclare2(
    name: string,
    sql: string,
    options: CurDeclareOptions = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const cursorType = options.cursorType ?? CursorType.RDONLY;
    const hasArgs    = options.hasArgs ?? false;
    const columns    = options.columns ?? [];
    const nameBytes  = Buffer.from(name, encoding);
    const sqlBytes   = Buffer.from(sql, encoding);

    const colBlocks = columns.map(c => Buffer.from(c, encoding));
    const colLen    = colBlocks.reduce((s, b) => s + 1 + b.length, 0);

    // length = nameLen(1) + name + cursorType(1) + hasArgs(1) + sqlLen(4) + sql + colCount(2) + colLen
    const length = 1 + nameBytes.length + 1 + 1 + 4 + sqlBytes.length + 2 + colLen;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURDECLARE2);
    w.writeUInt32BE(length);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt8(cursorType);
    w.writeUInt8(hasArgs ? 0x01 : 0x00);
    w.writeUInt32BE(sqlBytes.length);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);
    w.writeUInt16BE(columns.length);
    for (const b of colBlocks) {
      w.writeUInt8(b.length);
      w.writeBytes(b);
    }

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURDECLARE3 (0x10) – like CURDECLARE2 but 4-byte cursor type
  // -------------------------------------------------------------------------

  static curDeclare3(
    name: string,
    sql: string,
    options: CurDeclareOptions = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const cursorType = options.cursorType ?? CursorType.RDONLY;
    const hasArgs    = options.hasArgs ?? false;
    const columns    = options.columns ?? [];
    const nameBytes  = Buffer.from(name, encoding);
    const sqlBytes   = Buffer.from(sql, encoding);

    const colBlocks = columns.map(c => Buffer.from(c, encoding));
    const colLen    = colBlocks.reduce((s, b) => s + 1 + b.length, 0);

    // length = nameLen(1) + name + cursorType(4) + hasArgs(1) + sqlLen(4) + sql + colCount(2) + colLen
    const length = 1 + nameBytes.length + 4 + 1 + 4 + sqlBytes.length + 2 + colLen;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURDECLARE3);
    w.writeUInt32BE(length);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt32BE(cursorType);
    w.writeUInt8(hasArgs ? 0x01 : 0x00);
    w.writeUInt32BE(sqlBytes.length);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);
    w.writeUInt16BE(columns.length);
    for (const b of colBlocks) {
      w.writeUInt8(b.length);
      w.writeBytes(b);
    }

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CUROPEN (0x84)
  // -------------------------------------------------------------------------

  static curOpen(
    cursorId: number,
    options: { name?: string; hasArgs?: boolean } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const hasArgs   = options.hasArgs ?? false;
    const nameBytes = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (hasArgs)
    let length = 4 + 1;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CUROPEN);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(hasArgs ? 0x01 : 0x00);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURFETCH (0x82)
  // -------------------------------------------------------------------------

  static curFetch(
    cursorId: number,
    fetchType: FetchType,
    options: { name?: string; rowNumber?: number } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;
    const hasRowNum = fetchType === FetchType.ABS || fetchType === FetchType.REL;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (fetchType) + [if ABS|REL: 4]
    let length = 4 + 1;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;
    if (hasRowNum) length += 4;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURFETCH);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(fetchType);
    if (hasRowNum) w.writeInt32BE(options.rowNumber ?? 0);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURCLOSE (0x80)
  // -------------------------------------------------------------------------

  static curClose(
    cursorId: number,
    options: { name?: string; dealloc?: boolean } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;
    const dealloc   = options.dealloc ?? false;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (dealloc)
    let length = 4 + 1;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURCLOSE);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(dealloc ? 0x01 : 0x00);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURDELETE (0x81)
  // -------------------------------------------------------------------------

  static curDelete(
    cursorId: number,
    options: { name?: string; tableName?: string } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes  = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;
    const tableBytes = options.tableName !== undefined ? Buffer.from(options.tableName, encoding) : undefined;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (reserved) + 1 (tableNameLen) + tableLen
    let length = 4 + 1 + 1;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;
    if (tableBytes) length += tableBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURDELETE);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(0x00); // reserved
    w.writeUInt8(tableBytes ? tableBytes.length : 0);
    if (tableBytes) w.writeBytes(tableBytes);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURUPDATE (0x85)
  // -------------------------------------------------------------------------

  static curUpdate(
    cursorId: number,
    setClause: string,
    options: { tableName?: string; hasParams?: boolean } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const tableBytes = options.tableName !== undefined ? Buffer.from(options.tableName, encoding) : undefined;
    const setBytes   = Buffer.from(setClause, encoding);
    const hasParams  = options.hasParams ?? false;

    const tableLen = tableBytes ? tableBytes.length : 0;
    // length = 4 (ID) + 1 (status) + 1 (tableNameLen) + tableLen + 2 (setLen) + setLen
    const length = 4 + 1 + 1 + tableLen + 2 + setBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURUPDATE);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    w.writeUInt8(hasParams ? 0x01 : 0x00);
    w.writeUInt8(tableLen);
    if (tableBytes) w.writeBytes(tableBytes);
    w.writeUInt16BE(setBytes.length);
    if (setBytes.length > 0) w.writeBytes(setBytes);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURINFO (0x83) – 2-byte status field
  // -------------------------------------------------------------------------

  static curInfo(
    cursorId: number,
    command: CurInfoCmd,
    options: { name?: string; fetchSize?: number } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;
    const hasSize   = command === CurInfoCmd.SETCURROWS;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (cmd) + 2 (status) + [if SETCURROWS: 4]
    let length = 4 + 1 + 2;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;
    if (hasSize) length += 4;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURINFO);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(command);
    w.writeUInt16BE(0); // status = 0 when sending
    if (hasSize) w.writeUInt32BE(options.fetchSize ?? 0);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // CURINFO3 (0x88) – 4-byte status field
  // -------------------------------------------------------------------------

  static curInfo3(
    cursorId: number,
    command: CurInfoCmd,
    options: { name?: string; fetchSize?: number } = {},
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = options.name !== undefined ? Buffer.from(options.name, encoding) : undefined;
    const hasSize   = command === CurInfoCmd.SETCURROWS;

    // length = 4 (ID) + [if ID=0: 1 + nameLen] + 1 (cmd) + 4 (status) + [if SETCURROWS: 4]
    let length = 4 + 1 + 4;
    if (cursorId === 0 && nameBytes) length += 1 + nameBytes.length;
    if (hasSize) length += 4;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CURINFO3);
    w.writeUInt16BE(length);
    w.writeUInt32BE(cursorId);
    if (cursorId === 0 && nameBytes) {
      w.writeUInt8(nameBytes.length);
      w.writeBytes(nameBytes);
    }
    w.writeUInt8(command);
    w.writeUInt32BE(0); // status = 0 when sending
    if (hasSize) w.writeUInt32BE(options.fetchSize ?? 0);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // KEY (0xCA) – no length field, just raw DataFormat blocks
  // -------------------------------------------------------------------------

  static key(dataFormatBlocks: Buffer): Buffer {
    return Buffer.concat([Buffer.from([TokenType.KEY]), dataFormatBlocks]);
  }
}
