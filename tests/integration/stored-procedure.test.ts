/**
 * Integration – Stored Procedures (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 *
 * Uses local temp procs (#name) – visible only within the current session.
 */

import { Connection } from '../../src/connection';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Stored Procedures', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('CREATE + EXEC + DROP einer einfachen Prozedur', async () => {
    await conn.query(`
      CREATE PROCEDURE #sp_sum @a INT, @b INT
      AS SELECT @a + @b AS result
    `);
    const r = await conn.query('EXEC #sp_sum 10, 32');
    expect(r.rows[0][0]).toBe(42);
    await conn.query('DROP PROCEDURE #sp_sum');
  });

  it('Prozedur mit VARCHAR-Parameter', async () => {
    await conn.query(`
      CREATE PROCEDURE #sp_greet @name VARCHAR(50)
      AS SELECT 'Hello ' + @name AS greeting
    `);
    const r = await conn.query("EXEC #sp_greet 'World'");
    expect(r.rows[0][0]).toBe('Hello World');
    await conn.query('DROP PROCEDURE #sp_greet');
  });

  it('Prozedur gibt mehrere Zeilen zurück', async () => {
    await conn.query(`
      CREATE PROCEDURE #sp_rows
      AS
        SELECT 1 AS n
        SELECT 2 AS n
        SELECT 3 AS n
    `);
    const r = await conn.query('EXEC #sp_rows');
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    await conn.query('DROP PROCEDURE #sp_rows');
  });

  it('Prozedur mit lokaler Temp-Tabelle', async () => {
    await conn.query(`
      CREATE PROCEDURE #sp_temptbl
      AS
        CREATE TABLE #inner (v INT)
        INSERT #inner VALUES (7)
        SELECT v FROM #inner
        DROP TABLE #inner
    `);
    const r = await conn.query('EXEC #sp_temptbl');
    expect(r.rows[0][0]).toBe(7);
    await conn.query('DROP PROCEDURE #sp_temptbl');
  });
});
