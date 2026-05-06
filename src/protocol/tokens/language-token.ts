import { TokenType, LangStatus } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

/**
 * LANGUAGE token (0x21) – simple SQL query without prepared-statement overhead.
 *
 * Byte layout (TDS_QUERY_PROTOKOLL.md):
 *   [0x21][bodyLen(4 BE)][status(1)][SQL text]
 *
 * bodyLen = sqlBytes.length + 1 (the status byte is part of the body).
 */
export class LanguageToken {
  static build(
    sql: string,
    hasArgs = false,
    encoding: BufferEncoding = 'utf8',
  ): Buffer {
    const sqlBytes = Buffer.from(sql, encoding);

    const w = new TdsWriter();
    w.writeUInt8(TokenType.LANGUAGE);
    w.writeUInt32BE(sqlBytes.length + 1); // +1 for status byte
    w.writeUInt8(hasArgs ? LangStatus.HAS_ARGS : 0x00);
    if (sqlBytes.length > 0) w.writeBytes(sqlBytes);

    return w.toBuffer();
  }
}
