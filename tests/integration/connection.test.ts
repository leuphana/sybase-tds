/**
 * Integrationstests – werden nur ausgeführt wenn SYBASE_TEST_HOST gesetzt ist.
 *
 * Beispiel:
 *   SYBASE_TEST_HOST=myserver SYBASE_TEST_USER=sa SYBASE_TEST_PASS=secret npx jest tests/integration
 */

import { Connection } from '../../src/connection';
import { SybaseError } from '../../src/error';
import { DataFormat } from '../../src/types/data-format';
import { DataType } from '../../src/constants/tds-const';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Connection (benötigt SYBASE_TEST_HOST)', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await Connection.connect({
      host:     HOST!,
      port:     PORT,
      username: USER,
      password: PASS,
    });
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  // -------------------------------------------------------------------------

  it('verbindet sich erfolgreich', () => {
    expect(conn).toBeInstanceOf(Connection);
  });

  it('query("SELECT 1") gibt eine Zeile zurück', async () => {
    const result = await conn.query('SELECT 1');
    expect(result.rows).toHaveLength(1);
  });

  it('query mit ungültigem SQL wirft SybaseError', async () => {
    await expect(conn.query('SELECT FROM')).rejects.toBeInstanceOf(SybaseError);
  });

  it('PreparedStatement: prepare + execute + close', async () => {
    const stmt = await conn.prepare(
      'SELECT @p1 + @p2',
      [
        new DataFormat(DataType.INT4, { name: '@p1' }),
        new DataFormat(DataType.INT4, { name: '@p2' }),
      ],
    );
    const result = await stmt.execute([3, 4]);
    expect(result.rows[0][0]).toBe(7);
    await stmt.close();
  });

  it('Transaction: begin + rollback', async () => {
    const txn = conn.transaction();
    await txn.begin();
    await txn.rollback();
    // Kein Fehler erwartet
  });

  it('ConnectionPool: acquire + release', async () => {
    const { ConnectionPool } = await import('../../src/connection-pool');
    const pool = ConnectionPool.create({
      host: HOST!,
      port: PORT,
      username: USER,
      password: PASS,
    }, { max: 2 });

    const c1 = await pool.acquire();
    const c2 = await pool.acquire();
    pool.release(c1);
    pool.release(c2);
    await pool.end();
  });
});
