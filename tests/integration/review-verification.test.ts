/**
 * Integration – Verifikation der Härtung aus dem Code-Review 2026-11-05
 * (SYBASE_TODO.md, "Umsetzungsstand"). Requires SYBASE_TEST_HOST.
 *
 * Schreibt ausschließlich in sitzungslokale #-Temp-Tabellen.
 */

import { Connection } from '../../src/connection';
import { ConnectionPool } from '../../src/connection-pool';
import { SybaseError } from '../../src/error';
import { TdsTimeoutError } from '../../src/protocol/tds-socket';
import { DataFormat } from '../../src/types/data-format';
import { DataType } from '../../src/constants/tds-const';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);
const opts = { host: HOST!, port: PORT, username: USER, password: PASS };

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Review-Verifikation', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection(opts).connect();
    // Diagnose für SYBASE_TODO.md (H9 / M14)
    // eslint-disable-next-line no-console
    console.log(`[verify] encoding=${conn.encoding} database=${conn.database}`);
    await conn.query(`
      CREATE TABLE #rv (
        id   INT IDENTITY,
        dt   DATETIME       NULL,
        sdt  SMALLDATETIME  NULL,
        m    MONEY          NULL,
        sm   SMALLMONEY     NULL,
        big  BIGINT         NULL,
        txt  VARCHAR(1500)  NULL,
        bin  VARBINARY(1000) NULL
      )
    `);
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  beforeEach(async () => {
    await conn.query('DELETE FROM #rv');
  });

  // ── K2: Byte-Reihenfolge Datum/Geld-Parameter ───────────────────────────────

  it('K2: DATETIME-Parameter landet mit korrekten Datumsteilen in der DB', async () => {
    const d = new Date(Date.UTC(2026, 10, 5, 13, 37, 42, 500));
    await conn.query('INSERT INTO #rv (dt) VALUES (?)', [d]);
    const r = await conn.query(`
      SELECT datepart(yy, dt), datepart(mm, dt), datepart(dd, dt),
             datepart(hh, dt), datepart(mi, dt), datepart(ss, dt), datepart(ms, dt), dt
      FROM #rv`);
    expect(r.rows[0].slice(0, 7)).toEqual([2026, 11, 5, 13, 37, 42, 500]);
    expect((r.rows[0][7] as Date).getTime()).toBe(d.getTime());
  });

  it('K2: SMALLDATETIME über DATETIMN(4)', async () => {
    const d = new Date(Date.UTC(2026, 0, 31, 8, 15));
    await conn.query('INSERT INTO #rv (sdt) VALUES (?)', [d]); // wird serverseitig konvertiert
    const stmt = await conn.prepare('INSERT INTO #rv (sdt) VALUES (?)', [new DataFormat(DataType.DATETIMN, { maxLength: 4 })]);
    await stmt.execute([d]);
    await stmt.close();
    const r = await conn.query('SELECT sdt FROM #rv ORDER BY id');
    expect(r.rows.map(x => (x[0] as Date).getTime())).toEqual([d.getTime(), d.getTime()]);
  });

  it('K2: MONEY/SMALLMONEY über MONEYN-Parameter', async () => {
    const stmt = await conn.prepare('INSERT INTO #rv (m, sm) VALUES (?, ?)', [
      new DataFormat(DataType.MONEYN, { maxLength: 8 }),
      new DataFormat(DataType.MONEYN, { maxLength: 4 }),
    ]);
    await stmt.execute(['-1234567.8912', '12.34']);
    await stmt.close();
    const r = await conn.query('SELECT m, sm, CONVERT(VARCHAR(30), m) FROM #rv');
    expect(r.rows[0][0]).toBe('-1234567.8912');
    expect(r.rows[0][1]).toBe('12.3400');
  });

  // ── K1 / M11: lange Werte und große Ganzzahlen ─────────────────────────────

  it('K1: String > 255 Byte (LONGCHAR) wird vollständig gespeichert', async () => {
    const s = 'abcdefghij'.repeat(120); // 1200 Byte
    await conn.query('INSERT INTO #rv (txt) VALUES (?)', [s]);
    const r = await conn.query('SELECT datalength(txt), txt FROM #rv');
    expect(r.rows[0][0]).toBe(1200);
    expect(r.rows[0][1]).toBe(s);
  });

  it('K1: Buffer > 255 Byte (LONGBINARY) wird vollständig gespeichert', async () => {
    const b = Buffer.alloc(600, 0xAB);
    await conn.query('INSERT INTO #rv (bin) VALUES (?)', [b]);
    const r = await conn.query('SELECT datalength(bin) FROM #rv');
    expect(r.rows[0][0]).toBe(600);
  });

  it('M11: Ganzzahl > 2³¹ und bigint als INTN(8)', async () => {
    await conn.query('INSERT INTO #rv (big) VALUES (?)', [2 ** 40]);
    await conn.query('INSERT INTO #rv (big) VALUES (?)', [9007199254740993n]);
    const r = await conn.query('SELECT big FROM #rv ORDER BY id');
    expect(r.rows.map(x => BigInt(x[0] as number | bigint))).toEqual([BigInt(2 ** 40), 9007199254740993n]);
  });

  // ── M12: Datum/Zeit-Decode ──────────────────────────────────────────────────

  it('M12: DATE vor 1900 und TIME mit Millisekunden', async () => {
    const r = await conn.query("SELECT CONVERT(DATE, '1850-06-15'), CONVERT(TIME, '10:20:30.500')");
    expect((r.rows[0][0] as Date).toISOString()).toBe('1850-06-15T00:00:00.000Z');
    expect((r.rows[0][1] as Date).toISOString()).toBe('1900-01-01T10:20:30.500Z');
  });

  // ── H9: Zeichensatz ─────────────────────────────────────────────────────────

  it('H9: Umlaute als Literal und als Parameter', async () => {
    const lit = await conn.query("SELECT 'Müller Größe ä'");
    expect(lit.rows[0][0]).toBe('Müller Größe ä');
    await conn.query('INSERT INTO #rv (txt) VALUES (?)', ['Ölförderung']);
    const r = await conn.query('SELECT txt FROM #rv WHERE txt = ?', ['Ölförderung']);
    expect(r.rows[0][0]).toBe('Ölförderung');
  });

  // ── H10: Fehler, Meldungen, Resultsets ──────────────────────────────────────

  it('H10: nach SQL-Fehler bleibt die Connection synchron', async () => {
    await expect(conn.query('SELECT * FROM gibt_es_nicht_xyz')).rejects.toBeInstanceOf(SybaseError);
    expect((await conn.query('SELECT 2')).rows[0][0]).toBe(2);
  });

  it('H10: Fehler im zweiten Statement eines Batches', async () => {
    await expect(conn.query('SELECT 1 SELECT * FROM gibt_es_nicht_xyz')).rejects.toBeInstanceOf(SybaseError);
    expect((await conn.query('SELECT 3')).rows[0][0]).toBe(3);
  });

  it('H10: PRINT landet in messages, mehrere Resultsets getrennt', async () => {
    const r = await conn.query("PRINT 'hallo' SELECT 1 AS a SELECT 'x' AS b, 2 AS c");
    expect(r.messages.map(m => m.message)).toContain('hallo');
    expect(r.resultSets).toHaveLength(2);
    expect(r.rows).toEqual([[1]]);
    expect(r.resultSets[1].rows).toEqual([['x', 2]]);
  });

  it('H10: rowCount für UPDATE', async () => {
    await conn.query("INSERT INTO #rv (txt) VALUES ('a') INSERT INTO #rv (txt) VALUES ('b')");
    const r = await conn.query("UPDATE #rv SET txt = 'z'");
    expect(r.rowCount).toBe(2);
  });

  // ── K4: Parallelität auf einer Connection ───────────────────────────────────

  it('K4: 20 parallele Queries auf einer Connection', async () => {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => conn.query(`SELECT ${i}`)));
    expect(rs.map(r => r.rows[0][0])).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  // ── H7: Transaktionsstatus ─────────────────────────────────────────────────

  it('H7: DONE_INXACT → inTransaction', async () => {
    await conn.query('BEGIN TRANSACTION');
    expect(conn.inTransaction).toBe(true);
    await conn.query('ROLLBACK TRANSACTION');
    expect(conn.inTransaction).toBe(false);
  });

  it('H7: Pool rollt offene Transaktion bei release() zurück', async () => {
    const pool = new ConnectionPool(opts, { max: 1 });
    try {
      const c1 = await pool.acquire();
      await c1.query('BEGIN TRANSACTION');
      await pool.release(c1);
      const c2 = await pool.acquire();
      expect(c2).toBe(c1);
      expect((await c2.query('SELECT @@trancount')).rows[0][0]).toBe(0);
      await pool.release(c2);
    } finally {
      await pool.end();
    }
  });

  // ── M14: große Requests/Responses ──────────────────────────────────────────

  it('M14: großer Request (> Paketgröße) und große Antwort', async () => {
    const big = 'x'.repeat(8000);
    const r = await conn.query(`SELECT datalength('${big.slice(0, 1000)}') /* ${big} */`);
    expect(r.rows[0][0]).toBe(1000);
    const many = await conn.query('SELECT TOP 2000 a.id FROM sysobjects a, sysobjects b');
    expect(many.rows.length).toBeGreaterThan(100);
  });

  // ── M13: Cursor ────────────────────────────────────────────────────────────

  it('M13: Cursor fetch(n) und isDone', async () => {
    for (let i = 0; i < 5; i++) await conn.query(`INSERT INTO #rv (big) VALUES (${i})`);
    const cur = conn.cursor('SELECT big FROM #rv ORDER BY big');
    await cur.open();
    const first = await cur.fetch(3);
    const rest  = await cur.fetch(3);
    expect(first).toHaveLength(3);
    expect(rest).toHaveLength(2);
    expect(cur.isDone).toBe(true);
    await cur.close();
  });

  // ── H6: Timeout + ATTENTION ────────────────────────────────────────────────

  it('H6: requestTimeout bricht ab, Connection bleibt nutzbar', async () => {
    const c = await new Connection({ ...opts, requestTimeout: 1000 }).connect();
    try {
      const t0 = Date.now();
      await expect(c.query("WAITFOR DELAY '00:00:10'")).rejects.toBeInstanceOf(TdsTimeoutError);
      expect(Date.now() - t0).toBeLessThan(7000);
      expect(c.isClosed).toBe(false);
      expect((await c.query('SELECT 5')).rows[0][0]).toBe(5);
    } finally {
      await c.end();
    }
  }, 20_000);
});
