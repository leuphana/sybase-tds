/**
 * Regressionstests für Code-Review 2026-11-05: M11–M13 (SYBASE_TODO.md).
 */
import { TypeMapper, inferFormat } from '../../../src/types/type-mapper';
import { DataFormat } from '../../../src/types/data-format';
import { DataType, TokenType, CurInfoCmd } from '../../../src/constants/tds-const';
import { Connection } from '../../../src/connection';
import { MockSocket, loginAckBuf, doneBuf, doneOnlyBuf, queryResponseBuf } from '../mock-socket';

const m = new TypeMapper(false);

describe('M11 – inferFormat', () => {
  it.each([
    ['kurzer String',      'abc',                    DataType.VARCHAR],
    ['langer String',      'x'.repeat(256),          DataType.LONGCHAR],
    ['int32',              42,                       DataType.INT4],
    ['> int32',            2 ** 40,                  DataType.INTN],
    ['Bruch',              1.5,                      DataType.FLT8],
    ['bigint',             123n,                     DataType.INTN],
    ['boolean',            true,                     DataType.BIT],
    ['Date',               new Date(),               DataType.DATETIMN],
    ['kurzer Buffer',      Buffer.alloc(10),         DataType.VARBINARY],
    ['langer Buffer',      Buffer.alloc(300),        DataType.LONGBINARY],
    ['null',               null,                     DataType.VARCHAR],
  ])('%s', (_label, value, expected) => {
    expect(inferFormat(value as never).dataType).toBe(expected);
  });

  it('Umlaute zählen in Bytes (UTF-8): 200 × "ä" = 400 Byte → LONGCHAR', () => {
    expect(inferFormat('ä'.repeat(200), 'utf8').dataType).toBe(DataType.LONGCHAR);
    expect(inferFormat('ä'.repeat(200), 'latin1').dataType).toBe(DataType.VARCHAR);
  });

  it('> int32 wird als INTN(8) korrekt encodiert', () => {
    const v  = 2 ** 40;
    const df = inferFormat(v);
    const enc = m.encodeParam(df, v);
    expect(enc[0]).toBe(8);
    expect(enc.readBigInt64BE(1)).toBe(BigInt(v));
  });

  it('NULL für festen Typ wird abgelehnt statt 0 zu senden', () => {
    expect(() => m.encodeParam(new DataFormat(DataType.INT4), null)).toThrow(TypeError);
  });
});

describe('M12 – Datum / Geld', () => {
  it('TIME behält Millisekunden (1/300 s Auflösung)', () => {
    const df  = new DataFormat(DataType.TIME);
    const d   = new Date(Date.UTC(1900, 0, 1, 10, 20, 30, 500));
    const got = m.decode(df, m.encodeParam(df, d)) as Date;
    expect(got.getTime()).toBe(d.getTime());
  });

  it('DATE vor 1900 (negativer Tagesoffset)', () => {
    const df = new DataFormat(DataType.DATE);
    const d  = new Date(Date.UTC(1850, 5, 15));
    expect((m.decode(df, m.encodeParam(df, d)) as Date).getTime()).toBe(d.getTime());
  });

  it('MONEY aus String ohne Float-Rundungsfehler', () => {
    const df = new DataFormat(DataType.MONEY);
    expect(m.decode(df, m.encodeParam(df, '922337203685477.5807'))).toBe('922337203685477.5807');
  });

  it('MONEY rundet die 5. Nachkommastelle kaufmännisch', () => {
    const df = new DataFormat(DataType.MONEY);
    expect(m.decode(df, m.encodeParam(df, '1.00005'))).toBe('1.0001');
  });

  it('ungültiger Geldbetrag wirft', () => {
    expect(() => m.encodeParam(new DataFormat(DataType.MONEY), 'abc')).toThrow(TypeError);
  });
});

describe('M13 – Cursor', () => {
  async function makeConn(mock: MockSocket) {
    mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
    mock.queueResponse(doneOnlyBuf());
    return new Connection({ host: 'x', username: 'sa' }, mock).connect();
  }

  it('fetch(n) sendet CURINFO SETCURROWS vor CURFETCH', async () => {
    const mock = new MockSocket();
    const conn = await makeConn(mock);
    const cur  = conn.cursor('select id, name from t');
    mock.queueResponse(doneOnlyBuf());
    await cur.open();

    mock.queueResponse(queryResponseBuf(1, 'a'));
    await cur.fetch(50);
    const pkt = mock.written[mock.written.length - 1];
    expect(pkt[8]).toBe(TokenType.CURINFO);
    expect(pkt.includes(Buffer.from([CurInfoCmd.SETCURROWS]))).toBe(true);
    const idx = pkt.indexOf(TokenType.CURFETCH, 9);
    expect(idx).toBeGreaterThan(8);
  });

  it('weniger Zeilen als angefordert → isDone, weitere fetch() liefern []', async () => {
    const mock = new MockSocket();
    const conn = await makeConn(mock);
    const cur  = conn.cursor('select id, name from t');
    mock.queueResponse(doneOnlyBuf());
    await cur.open();

    mock.queueResponse(queryResponseBuf(1, 'a'));
    const rows = await cur.fetch(10);
    expect(rows).toHaveLength(1);
    expect(cur.isDone).toBe(true);
    const writes = mock.written.length;
    expect(await cur.fetch(10)).toEqual([]);
    expect(mock.written.length).toBe(writes); // kein Roundtrip mehr
  });

  it('open(values) sendet PARAMFMT + PARAMS', async () => {
    const mock = new MockSocket();
    const conn = await makeConn(mock);
    const cur  = conn.cursor('select * from t where id = ?');
    mock.queueResponse(doneOnlyBuf());
    await cur.open([42]);
    const pkt = mock.written[mock.written.length - 1];
    expect(pkt.includes(Buffer.from([TokenType.PARAMFMT]))).toBe(true);
    expect(pkt.includes(Buffer.from([TokenType.PARAMS]))).toBe(true);
  });
});
