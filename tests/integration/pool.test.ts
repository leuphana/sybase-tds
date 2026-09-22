/**
 * Integration – ConnectionPool (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 */

import { ConnectionPool } from '../../src/connection-pool';
import { ConnectOptions } from '../../src/connection';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

const opts: ConnectOptions = { host: HOST!, port: PORT, username: USER, password: PASS };

describeIf('Integration – ConnectionPool', () => {
  it('acquire + query + release + end', async () => {
    const pool = new ConnectionPool(opts, { max: 2 });
    const conn = await pool.acquire();
    const r = await conn.query('SELECT 1');
    expect(r.rows[0][0]).toBe(1);
    pool.release(conn);
    await pool.end();
  });

  it('Verbindung wird nach release wiederverwendet', async () => {
    const pool = new ConnectionPool(opts, { max: 1 });
    const c1 = await pool.acquire();
    pool.release(c1);
    const c2 = await pool.acquire();
    expect(c2).toBe(c1);
    pool.release(c2);
    await pool.end();
  });

  it('Pool wartet bei max=1 bis eine Verbindung frei ist', async () => {
    const pool = new ConnectionPool(opts, { max: 1 });
    const c1 = await pool.acquire();

    let c2Resolved = false;
    const c2Promise = pool.acquire().then(c => { c2Resolved = true; return c; });

    expect(c2Resolved).toBe(false);

    pool.release(c1);
    const c2 = await c2Promise;
    expect(c2Resolved).toBe(true);
    pool.release(c2);
    await pool.end();
  });

  it('acquire() nach end() wirft einen Fehler', async () => {
    const pool = new ConnectionPool(opts, { max: 1 });
    await pool.end();
    await expect(pool.acquire()).rejects.toThrow();
  });

  it('end() lehnt wartende acquires ab', async () => {
    const pool = new ConnectionPool(opts, { max: 1 });
    const c1 = await pool.acquire();
    const pending = pool.acquire();
    await pool.end();
    pool.release(c1);
    await expect(pending).rejects.toThrow();
  });

  it('mehrere parallele acquires bis max=3', async () => {
    const pool = new ConnectionPool(opts, { max: 3 });
    const [c1, c2, c3] = await Promise.all([pool.acquire(), pool.acquire(), pool.acquire()]);
    const r = await c1.query('SELECT 42');
    expect(r.rows[0][0]).toBe(42);
    pool.release(c1);
    pool.release(c2);
    pool.release(c3);
    await pool.end();
  });
});
