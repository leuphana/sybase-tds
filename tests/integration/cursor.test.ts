/**
 * Integration – Cursor (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 */

import { Connection } from '../../src/connection';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Cursor', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();
    await conn.query('CREATE TABLE #cur_data (n INT)');
    await conn.query('INSERT #cur_data VALUES (10)');
    await conn.query('INSERT #cur_data VALUES (20)');
    await conn.query('INSERT #cur_data VALUES (30)');
  });

  afterAll(async () => {
    if (conn) {
      await conn.query('DROP TABLE #cur_data').catch(() => {});
      await conn.end();
    }
  });

  it('open + fetch + close liefert Zeilen', async () => {
    const cur = conn.cursor('SELECT n FROM #cur_data ORDER BY n');
    await cur.open();
    const rows = await cur.fetch();
    await cur.close();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('fetch liefert erste Zeile (n = 10)', async () => {
    const cur = conn.cursor('SELECT n FROM #cur_data ORDER BY n');
    await cur.open();
    const rows = await cur.fetch();
    await cur.close();
    expect(rows[0][0]).toBe(10);
  });

  it('leere Tabelle – fetch ergibt leeres Array', async () => {
    await conn.query('CREATE TABLE #cur_empty (n INT)');
    const cur = conn.cursor('SELECT n FROM #cur_empty');
    await cur.open();
    const rows = await cur.fetch();
    await cur.close();
    await conn.query('DROP TABLE #cur_empty');
    expect(rows).toHaveLength(0);
  });

  it('fetch() ohne open() wirft einen Fehler', async () => {
    const cur = conn.cursor('SELECT 1');
    await expect(cur.fetch()).rejects.toThrow();
  });

  it('doppeltes close() wirft keinen Fehler', async () => {
    const cur = conn.cursor('SELECT n FROM #cur_data');
    await cur.open();
    await cur.close();
    await expect(cur.close()).resolves.toBeUndefined();
  });

  it('zwei Cursor auf derselben Tabelle gleichzeitig', async () => {
    const c1 = conn.cursor('SELECT n FROM #cur_data ORDER BY n');
    const c2 = conn.cursor('SELECT n FROM #cur_data ORDER BY n DESC');
    await c1.open();
    await c2.open();
    const r1 = await c1.fetch();
    const r2 = await c2.fetch();
    await c1.close();
    await c2.close();
    expect(r1[0][0]).toBe(10);
    expect(r2[0][0]).toBe(30);
  });
});
