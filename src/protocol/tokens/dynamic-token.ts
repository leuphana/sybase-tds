import { TokenType, DynamicOp, DynamicStatus } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

const DYNAMIC_MAX_SIZE = 32767;

/**
 * DYNAMIC / DYNAMIC2 token for prepared statements (TDS_QUERY_PROTOKOLL.md).
 *
 * Three phases: prepare() → execute() → deallocate()
 *
 * DYNAMIC  (0xE7): length fields 2 bytes – up to 32,767 bytes
 * DYNAMIC2 (0x62): length fields 4 bytes – beyond that
 */
export class DynamicToken {
  // -------------------------------------------------------------------------
  // prepare()
  // -------------------------------------------------------------------------

  /**
   * Creates a DYNAMIC(PREPARE) or DYNAMIC2(PREPARE) token.
   *
   * DYNAMIC layout:
   *   [0xE7][totalLen(2)][PREPARE(1)][status(1)][nameLen(1)][name][sqlLen(2)][sql]
   *
   * DYNAMIC2 layout:
   *   [0x62][totalLen(4)][PREPARE(1)][status(1)][nameLen(1)][name][sqlLen(4)][sql]
   */
  static prepare(
    name: string,
    sql: string,
    status = 0,
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = Buffer.from(name, encoding);
    const sqlBytes  = Buffer.from(sql, encoding);

    if (nameBytes.length > DYNAMIC_MAX_SIZE || sqlBytes.length > DYNAMIC_MAX_SIZE) {
      return DynamicToken._buildDynamic2Prepare(nameBytes, sqlBytes, status);
    }

    const totalLen = 3 + nameBytes.length + 2 + sqlBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.DYNAMIC);
    w.writeUInt16BE(totalLen);
    w.writeUInt8(DynamicOp.PREPARE);
    w.writeUInt8(status);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt16BE(sqlBytes.length);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------------

  /**
   * Creates a DYNAMIC(EXEC) token.
   *
   * Layout: [0xE7][totalLen(2)][EXEC(1)][status(1)][nameLen(1)][name][0x00 0x00]
   */
  static execute(
    name: string,
    hasParams: boolean,
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = Buffer.from(name, encoding);
    const totalLen  = 3 + nameBytes.length + 2;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.DYNAMIC);
    w.writeUInt16BE(totalLen);
    w.writeUInt8(DynamicOp.EXEC);
    w.writeUInt8(hasParams ? DynamicStatus.HAS_ARGS : 0x00);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt16BE(0); // no SQL body

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // deallocate()
  // -------------------------------------------------------------------------

  /**
   * Creates a DYNAMIC(DEALLOC) token.
   *
   * Layout: [0xE7][totalLen(2)][DEALLOC(1)][0x00][nameLen(1)][name][0x00 0x00]
   */
  static deallocate(
    name: string,
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const nameBytes = Buffer.from(name, encoding);
    const totalLen  = 3 + nameBytes.length + 2;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.DYNAMIC);
    w.writeUInt16BE(totalLen);
    w.writeUInt8(DynamicOp.DEALLOC);
    w.writeUInt8(0x00);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt16BE(0);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // DYNAMIC2 (> 32 KB)
  // -------------------------------------------------------------------------

  private static _buildDynamic2Prepare(
    nameBytes: Buffer,
    sqlBytes: Buffer,
    status: number,
  ): Buffer {
    // totalLen = op(1) + status(1) + nameLen(1) + name + sqlLen(4) + sql
    const totalLen = 3 + nameBytes.length + 4 + sqlBytes.length;

    const w = new TdsWriter();
    w.writeUInt8(TokenType.DYNAMIC2);
    w.writeUInt32BE(totalLen);
    w.writeUInt8(DynamicOp.PREPARE);
    w.writeUInt8(status);
    w.writeUInt8(nameBytes.length);
    w.writeBytes(nameBytes);
    w.writeUInt32BE(sqlBytes.length);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);

    return w.toBuffer();
  }
}
