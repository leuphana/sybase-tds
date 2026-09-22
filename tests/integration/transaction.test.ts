/**
 * Integration – Transactions (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 */

import { Connection } from '../../src/connection';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Transaktionen', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('BEGIN + COMMIT: Daten bleiben erhalten', async () => {
    await conn.query('CREATE TABLE #trx_commit (v INT)');
    const tx = conn.transaction();
    await tx.begin();
    await conn.query('INSERT INTO #trx_commit VALUES (99)');
    await tx.commit();
    const r = await conn.query('SELECT v FROM #trx_commit');
    expect(r.rows[0][0]).toBe(99);
    await conn.query('DROP TABLE #trx_commit');
  });

  it('BEGIN + ROLLBACK: Daten werden verworfen', async () => {
    await conn.query('CREATE TABLE #trx_rollback (v INT)');
    const tx = conn.transaction();
    await tx.begin();
    await conn.query('INSERT INTO #trx_rollback VALUES (42)');
    await tx.rollback();
    const r = await conn.query('SELECT COUNT(*) FROM #trx_rollback');
    expect(r.rows[0][0]).toBe(0);
    await conn.query('DROP TABLE #trx_rollback');
  });

  it('@@trancount ist 0 außerhalb einer Transaktion', async () => {
    const r = await conn.query('SELECT @@trancount');
    expect(r.rows[0][0]).toBe(0);
  });

  it('@@trancount ist 1 innerhalb einer Transaktion', async () => {
    const tx = conn.transaction();
    await tx.begin();
    const r = await conn.query('SELECT @@trancount');
    await tx.rollback();
    expect(r.rows[0][0]).toBe(1);
  });

  it('begin() zweimal hintereinander wirft einen Fehler', async () => {
    const tx = conn.transaction();
    await tx.begin();
    await expect(tx.begin()).rejects.toThrow();
    await tx.rollback();
  });

  it('commit() ohne begin() wirft einen Fehler', async () => {
    const tx = conn.transaction();
    await expect(tx.commit()).rejects.toThrow();
  });

  it('rollback() ohne begin() wirft einen Fehler', async () => {
    const tx = conn.transaction();
    await expect(tx.rollback()).rejects.toThrow();
  });

  it('ROLLBACK macht mehrere INSERTs rückgängig', async () => {
    await conn.query('CREATE TABLE #trx_multi (v INT)');
    const tx = conn.transaction();
    await tx.begin();
    await conn.query('INSERT INTO #trx_multi VALUES (1)');
    await conn.query('INSERT INTO #trx_multi VALUES (2)');
    await conn.query('INSERT INTO #trx_multi VALUES (3)');
    await tx.rollback();
    const r = await conn.query('SELECT COUNT(*) FROM #trx_multi');
    expect(r.rows[0][0]).toBe(0);
    await conn.query('DROP TABLE #trx_multi');
  });
});
