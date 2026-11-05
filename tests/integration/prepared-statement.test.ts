/**
 * Integration – Prepared Statements (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 *
 */

import { Connection } from '../../src/connection';
import { DataFormat } from '../../src/types/data-format';
import { DataType } from '../../src/constants/tds-const';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Prepared Statements', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  // ASE erlaubt untypisierte `?` nur in WHERE, SET und VALUES – daher laufen die
  // Parameter-Tests über eine sitzungslokale Temp-Tabelle.
  beforeAll(async () => {
    await conn.query(`
      CREATE TABLE #ps (
        i  INT          NULL,
        v  VARCHAR(50)  NULL,
        f  FLOAT        NULL,
        b  BIT          DEFAULT 0 NOT NULL,
        d  DATETIME     NULL
      )
    `);
  });

  beforeEach(async () => {
    await conn.query('DELETE FROM #ps');
  });

  // ── Explizite DataFormat-Angabe ─────────────────────────────────────────────

  it('prepare + execute ohne Parameter', async () => {
    const stmt = await conn.prepare('SELECT 42');
    const r = await stmt.execute([]);
    expect(r.rows[0][0]).toBe(42);
    await stmt.close();
  });

  it('prepare + execute mit INT4-Parameter (?)', async () => {
    const stmt = await conn.prepare('INSERT INTO #ps (i) VALUES (?)', [new DataFormat(DataType.INT4)]);
    await stmt.execute([10]);
    await stmt.close();
    expect((await conn.query('SELECT i + 1 FROM #ps')).rows[0][0]).toBe(11);
  });

  it('prepare + execute mit VARCHAR-Parameter (?)', async () => {
    const stmt = await conn.prepare(
      'INSERT INTO #ps (v) VALUES (?)',
      [new DataFormat(DataType.VARCHAR, { maxLength: 50 })],
    );
    await stmt.execute(['hello']);
    await stmt.close();
    expect((await conn.query('SELECT v FROM #ps')).rows[0][0]).toBe('hello');
  });

  it('prepare + execute mit FLT8-Parameter (?)', async () => {
    const stmt = await conn.prepare('INSERT INTO #ps (f) VALUES (?)', [new DataFormat(DataType.FLT8)]);
    await stmt.execute([3.14]);
    await stmt.close();
    const v = (await conn.query('SELECT f FROM #ps')).rows[0][0] as number;
    expect(Math.abs(v - 3.14)).toBeLessThan(0.001);
  });

  it('prepare + execute mit zwei INT-Parametern (?, ?) im WHERE', async () => {
    await conn.query('INSERT INTO #ps (i) VALUES (3) INSERT INTO #ps (i) VALUES (7) INSERT INTO #ps (i) VALUES (9)');
    const stmt = await conn.prepare(
      'SELECT i FROM #ps WHERE i >= ? AND i <= ? ORDER BY i',
      [new DataFormat(DataType.INT4), new DataFormat(DataType.INT4)],
    );
    const r = await stmt.execute([3, 7]);
    expect(r.rows).toEqual([[3], [7]]);
    await stmt.close();
  });

  it('Statement mehrfach mit unterschiedlichen Werten ausführen', async () => {
    await conn.query('INSERT INTO #ps (i) VALUES (9) INSERT INTO #ps (i) VALUES (49)');
    const stmt = await conn.prepare('SELECT i FROM #ps WHERE i = ?', [new DataFormat(DataType.INT4)]);
    const r1 = await stmt.execute([9]);
    const r2 = await stmt.execute([49]);
    expect(r1.rows[0][0]).toBe(9);
    expect(r2.rows[0][0]).toBe(49);
    await stmt.close();
  });

  // ── Automatische Typ-Erkennung (kein DataFormat angegeben) ─────────────────

  it('auto-inference: string → VARCHAR', async () => {
    await conn.query('INSERT INTO #ps (v) VALUES (?)', ['world']);
    expect((await conn.query('SELECT v FROM #ps WHERE v = ?', ['world'])).rows[0][0]).toBe('world');
  });

  it('auto-inference: ganzzahlige number → INT4', async () => {
    await conn.query('INSERT INTO #ps (i) VALUES (?)', [99]);
    expect((await conn.query('SELECT i FROM #ps')).rows[0][0]).toBe(99);
  });

  it('auto-inference: Dezimalzahl → FLT8', async () => {
    await conn.query('INSERT INTO #ps (f) VALUES (?)', [2.718]);
    const v = (await conn.query('SELECT f FROM #ps')).rows[0][0] as number;
    expect(Math.abs(v - 2.718)).toBeLessThan(0.001);
  });

  it('auto-inference: boolean → BIT', async () => {
    await conn.query('INSERT INTO #ps (b) VALUES (?)', [true]);
    expect((await conn.query('SELECT b FROM #ps')).rows[0][0]).toBe(true);
  });

  it('auto-inference: Date → DATETIMN', async () => {
    const d = new Date('2024-06-15T13:45:30.500Z');
    await conn.query('INSERT INTO #ps (d) VALUES (?)', [d]);
    const r = await conn.query('SELECT d FROM #ps');
    expect(r.rows[0][0]).toBeInstanceOf(Date);
    expect((r.rows[0][0] as Date).getTime()).toBe(d.getTime());
  });

  it('auto-inference: gemischte Typen (string + number)', async () => {
    await conn.query('INSERT INTO #ps (v, i) VALUES (?, ?)', ['Wert', 42]);
    const r = await conn.query("SELECT v + ' = ' + CONVERT(VARCHAR(10), i) FROM #ps");
    expect(r.rows[0][0]).toBe('Wert = 42');
  });

  // ── Fehlerverhalten ─────────────────────────────────────────────────────────

  it('execute nach close() wirft einen Fehler', async () => {
    const stmt = await conn.prepare('SELECT 1');
    await stmt.close();
    await expect(stmt.execute([])).rejects.toThrow();
  });

  it('doppeltes close() wirft keinen Fehler', async () => {
    const stmt = await conn.prepare('SELECT 1');
    await stmt.close();
    await expect(stmt.close()).resolves.toBeUndefined();
  });
});
