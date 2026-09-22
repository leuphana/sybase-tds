/**
 * Integration – Sybase ASE 15.7-specific features
 * Requires SYBASE_TEST_HOST.
 */

import { Connection } from '../../src/connection';
import { SybaseError } from '../../src/error';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Sybase ASE 15.7 Features', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  // ── @@-Variablen ────────────────────────────────────────────────────────────

  it('@@version enthält "Adaptive"', async () => {
    const r = await conn.query('SELECT @@version');
    expect(r.rows[0][0] as string).toContain('Adaptive');
  });

  it('@@servername ist ein nicht-leerer String', async () => {
    const r = await conn.query('SELECT @@servername');
    expect(typeof r.rows[0][0]).toBe('string');
    expect((r.rows[0][0] as string).length).toBeGreaterThan(0);
  });

  it('@@rowcount nach INSERT ist 1', async () => {
    await conn.query('CREATE TABLE #rc (v INT)');
    await conn.query('INSERT #rc VALUES (1)');
    const r = await conn.query('SELECT @@rowcount');
    await conn.query('DROP TABLE #rc');
    expect(r.rows[0][0]).toBe(1);
  });

  it('@@error nach erfolgreichem Statement ist 0', async () => {
    await conn.query('SELECT 1');
    const r = await conn.query('SELECT @@error');
    expect(r.rows[0][0]).toBe(0);
  });

  // ── SET-Optionen ─────────────────────────────────────────────────────────────

  it('SET ROWCOUNT begrenzt Ergebniszeilen', async () => {
    await conn.query('CREATE TABLE #rowcnt (n INT)');
    for (let i = 1; i <= 5; i++) await conn.query(`INSERT #rowcnt VALUES (${i})`);
    await conn.query('SET ROWCOUNT 2');
    const r = await conn.query('SELECT n FROM #rowcnt ORDER BY n');
    await conn.query('SET ROWCOUNT 0');
    await conn.query('DROP TABLE #rowcnt');
    expect(r.rows).toHaveLength(2);
  });

  it('SET NOCOUNT unterdrückt rowCount-Meldung (kein Fehler)', async () => {
    await conn.query('SET NOCOUNT ON');
    const r = await conn.query('SELECT 1');
    await conn.query('SET NOCOUNT OFF');
    expect(r.rows[0][0]).toBe(1);
  });

  // ── Fehlerbehandlung ─────────────────────────────────────────────────────────

  it('ungültiges SQL wirft SybaseError', async () => {
    await expect(conn.query('THIS IS NOT SQL !!!!')).rejects.toBeInstanceOf(SybaseError);
  });

  it('SybaseError.errorNumber ist > 0', async () => {
    try {
      await conn.query('SELECT * FROM table_does_not_exist_xyz');
    } catch (err) {
      expect(err).toBeInstanceOf(SybaseError);
      expect((err as SybaseError).errorNumber).toBeGreaterThan(0);
      return;
    }
    throw new Error('hätte werfen sollen');
  });

  it('Verbindung bleibt nach SQL-Fehler nutzbar', async () => {
    try { await conn.query('INVALID SQL'); } catch { /* erwartet */ }
    const r = await conn.query('SELECT 1');
    expect(r.rows[0][0]).toBe(1);
  });

  // ── SQL-Funktionen ───────────────────────────────────────────────────────────

  it('CONVERT(VARCHAR, 42) ergibt "42"', async () => {
    const r = await conn.query("SELECT CONVERT(VARCHAR(10), 42)");
    expect(r.rows[0][0]).toBe('42');
  });

  it("String-Konkatenation 'foo' + 'bar'", async () => {
    const r = await conn.query("SELECT 'foo' + 'bar'");
    expect(r.rows[0][0]).toBe('foobar');
  });

  it('SUBSTRING("hello world", 1, 5) ergibt "hello"', async () => {
    const r = await conn.query("SELECT SUBSTRING('hello world', 1, 5)");
    expect(r.rows[0][0]).toBe('hello');
  });

  it('DATEDIFF(day, ...) ergibt 10', async () => {
    const r = await conn.query("SELECT DATEDIFF(day, '2024-01-01', '2024-01-11')");
    expect(r.rows[0][0]).toBe(10);
  });

  it('LEN("hello") ergibt 5', async () => {
    const r = await conn.query("SELECT LEN('hello')");
    expect(r.rows[0][0]).toBe(5);
  });

  it('UPPER("hello") ergibt "HELLO"', async () => {
    const r = await conn.query("SELECT UPPER('hello')");
    expect(r.rows[0][0]).toBe('HELLO');
  });

  // ── Multi-Row / Aggregate ───────────────────────────────────────────────────

  it('ORDER BY sortiert aufsteigend', async () => {
    await conn.query('CREATE TABLE #ord (n INT)');
    await conn.query('INSERT #ord VALUES (3)');
    await conn.query('INSERT #ord VALUES (1)');
    await conn.query('INSERT #ord VALUES (2)');
    const r = await conn.query('SELECT n FROM #ord ORDER BY n');
    await conn.query('DROP TABLE #ord');
    expect(r.rows.map(row => row[0])).toEqual([1, 2, 3]);
  });

  it('TOP 2 begrenzt auf 2 Zeilen', async () => {
    const r = await conn.query('SELECT TOP 2 name FROM master..syslogins ORDER BY name');
    expect(r.rows).toHaveLength(2);
  });

  it('COUNT(*) zählt Zeilen korrekt', async () => {
    await conn.query('CREATE TABLE #cnt (v INT)');
    await conn.query('INSERT #cnt VALUES (1)');
    await conn.query('INSERT #cnt VALUES (2)');
    await conn.query('INSERT #cnt VALUES (3)');
    const r = await conn.query('SELECT COUNT(*) FROM #cnt');
    await conn.query('DROP TABLE #cnt');
    expect(r.rows[0][0]).toBe(3);
  });

  it('GROUP BY + SUM aggregiert korrekt', async () => {
    await conn.query('CREATE TABLE #grp (cat VARCHAR(10), val INT)');
    await conn.query("INSERT #grp VALUES ('a', 10)");
    await conn.query("INSERT #grp VALUES ('a', 20)");
    await conn.query("INSERT #grp VALUES ('b', 5)");
    const r = await conn.query("SELECT cat, SUM(val) FROM #grp GROUP BY cat ORDER BY cat");
    await conn.query('DROP TABLE #grp');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0][1]).toBe(30);
    expect(r.rows[1][1]).toBe(5);
  });

  it('rowCount stimmt mit rows.length überein', async () => {
    const r = await conn.query('SELECT name FROM master..syslogins');
    expect(r.rowCount).toBe(r.rows.length);
  });
});
