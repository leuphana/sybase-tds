/**
 * Regressionstests für Code-Review 2026-11-05, Punkte K1–K3 (SYBASE_TODO.md).
 */
import { TypeMapper } from '../../../src/types/type-mapper';
import { DataFormat } from '../../../src/types/data-format';
import { DataType, TokenType } from '../../../src/constants/tds-const';
import { TokenParser } from '../../../src/protocol/response/token-parser';
import { TdsWriter } from '../../../src/protocol/tds-writer';

const m = new TypeMapper(false);

/** Liest einen encodierten Parameter (mit Längenpräfix) zurück. */
function decodeEncoded(df: DataFormat, encoded: Buffer) {
  if (df.isFixedLength()) return m.decode(df, encoded);
  const long = [DataType.TEXT, DataType.IMAGE, DataType.UNITEXT, DataType.LONGCHAR, DataType.LONGBINARY]
    .includes(df.dataType);
  const len  = long ? encoded.readUInt32BE(0) : encoded[0];
  const off  = long ? 4 : 1;
  return len === 0 ? null : m.decode(df, encoded.slice(off, off + len));
}

describe('K1 – lange variable Parameter', () => {
  it('VARCHAR > 255 Byte wirft statt still zu korrumpieren', () => {
    const df = new DataFormat(DataType.VARCHAR);
    expect(() => m.encodeParam(df, 'x'.repeat(300))).toThrow(RangeError);
  });

  it('VARBINARY > 255 Byte wirft', () => {
    const df = new DataFormat(DataType.VARBINARY);
    expect(() => m.encodeParam(df, Buffer.alloc(256))).toThrow(RangeError);
  });

  it('VARCHAR mit genau 255 Byte ist erlaubt', () => {
    const df = new DataFormat(DataType.VARCHAR);
    const enc = m.encodeParam(df, 'a'.repeat(255));
    expect(enc[0]).toBe(255);
    expect(enc).toHaveLength(256);
  });

  it('LONGCHAR nutzt 4-Byte-Längenpräfix (BE)', () => {
    const df  = new DataFormat(DataType.LONGCHAR);
    const str = 'ä'.repeat(1000); // 2000 Byte UTF-8
    const enc = m.encodeParam(df, str);
    expect(enc.readUInt32BE(0)).toBe(2000);
    expect(enc).toHaveLength(2004);
    expect(decodeEncoded(df, enc)).toBe(str);
  });

  it('LONGBINARY nutzt 4-Byte-Längenpräfix', () => {
    const df  = new DataFormat(DataType.LONGBINARY);
    const buf = Buffer.alloc(70_000, 0x5A);
    const enc = m.encodeParam(df, buf);
    expect(enc.readUInt32BE(0)).toBe(70_000);
    expect(decodeEncoded(df, enc)).toEqual(buf);
  });

  it('NULL für LONGCHAR = 4 Null-Bytes', () => {
    expect(m.encodeParam(new DataFormat(DataType.LONGCHAR), null)).toEqual(Buffer.alloc(4));
  });
});

describe('K2 – Nullable Datums-/Geldtypen sind Big-Endian (wie decode)', () => {
  const d = new Date(Date.UTC(2026, 10, 5, 13, 37, 42, 500));

  it('DATETIMN(8) Round-Trip', () => {
    const df = new DataFormat(DataType.DATETIMN, { maxLength: 8 });
    expect((decodeEncoded(df, m.encodeParam(df, d)) as Date).getTime()).toBe(d.getTime());
  });

  it('DATETIMN(8) schreibt Tage Big-Endian', () => {
    const df  = new DataFormat(DataType.DATETIMN, { maxLength: 8 });
    const enc = m.encodeParam(df, d);
    const days = Math.floor((d.getTime() - Date.UTC(1900, 0, 1)) / 86_400_000);
    expect(enc.readInt32BE(1)).toBe(days);
  });

  it('DATETIMN(4) Round-Trip (Minutengenau)', () => {
    const df = new DataFormat(DataType.DATETIMN, { maxLength: 4 });
    const exp = new Date(Date.UTC(2026, 10, 5, 13, 37));
    expect((decodeEncoded(df, m.encodeParam(df, d)) as Date).getTime()).toBe(exp.getTime());
  });

  it('DATEN Round-Trip', () => {
    const df = new DataFormat(DataType.DATEN);
    const exp = new Date(Date.UTC(2026, 10, 5));
    expect((decodeEncoded(df, m.encodeParam(df, d)) as Date).getTime()).toBe(exp.getTime());
  });

  it('TIMEN Round-Trip', () => {
    const df = new DataFormat(DataType.TIMEN);
    const got = decodeEncoded(df, m.encodeParam(df, d)) as Date;
    expect(got.getUTCHours()).toBe(13);
    expect(got.getUTCMinutes()).toBe(37);
    expect(got.getUTCSeconds()).toBe(42);
  });

  it('MONEYN(8) Round-Trip', () => {
    const df = new DataFormat(DataType.MONEYN, { maxLength: 8 });
    expect(decodeEncoded(df, m.encodeParam(df, '-1234.5678'))).toBe('-1234.5678');
  });

  it('MONEYN(4) Round-Trip', () => {
    const df = new DataFormat(DataType.MONEYN, { maxLength: 4 });
    expect(decodeEncoded(df, m.encodeParam(df, 12.34))).toBe('12.3400');
  });
});

describe('K3 – RETURNSTATUS / PARAMS vom Server', () => {
  function returnStatusBuf(status: number): Buffer {
    const b = Buffer.alloc(5);
    b[0] = TokenType.RETURNSTATUS;
    b.writeInt32BE(status, 1);
    return b;
  }
  function doneProc(): Buffer {
    const w = new TdsWriter();
    w.writeUInt8(TokenType.DONEPROC); w.writeUInt16BE(0); w.writeUInt16BE(0); w.writeUInt32BE(0);
    return w.toBuffer();
  }

  it('RETURNSTATUS = Token + fester INT4 (Status 0)', () => {
    const tokens = new TokenParser().parse(Buffer.concat([returnStatusBuf(0), doneProc()]));
    expect(tokens.map(t => t.type)).toEqual(['returnStatus', 'done']);
  });

  it('RETURNSTATUS liefert negativen Status korrekt', () => {
    const tokens = new TokenParser().parse(Buffer.concat([returnStatusBuf(-6), doneProc()]));
    const rs = tokens[0];
    expect(rs.type === 'returnStatus' && rs.data.status).toBe(-6);
  });

  it('PARAMFMT + PARAMS (Output-Parameter) werden geparst', () => {
    const fmt = [new DataFormat(DataType.INTN, { name: '@out', maxLength: 4 })];
    const blocks = fmt.map(f => f.build());
    const w = new TdsWriter();
    w.writeUInt8(TokenType.PARAMFMT);
    w.writeUInt16BE(2 + blocks.reduce((s, b) => s + b.length, 0));
    w.writeUInt16BE(fmt.length);
    blocks.forEach(b => w.writeBytes(b));
    w.writeUInt8(TokenType.PARAMS);
    w.writeUInt8(4); w.writeInt32BE(4711);
    const tokens = new TokenParser().parse(Buffer.concat([w.toBuffer(), returnStatusBuf(0), doneProc()]));
    expect(tokens.map(t => t.type)).toEqual(['paramFmt', 'params', 'returnStatus', 'done']);
    const p = tokens[1];
    expect(p.type === 'params' && p.data.values[0]).toEqual(Buffer.from([0x00, 0x00, 0x12, 0x67]));
  });
});
