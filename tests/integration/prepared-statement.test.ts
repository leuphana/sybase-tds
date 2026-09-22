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

  // ── Explizite DataFormat-Angabe ─────────────────────────────────────────────

  it('prepare + execute ohne Parameter', async () => {
    const stmt = await conn.prepare('SELECT 42');
    const r = await stmt.execute([]);
    expect(r.rows[0][0]).toBe(42);
    await stmt.close();
  });

  it('prepare + execute mit INT4-Parameter (?)', async () => {
    const stmt = await conn.prepare(
      'SELECT CONVERT(INT, ?) + 1',
      [new DataFormat(DataType.INT4)],
    );
    const r = await stmt.execute([10]);
    expect(r.rows[0][0]).toBe(11);
    await stmt.close();
  });

  it('prepare + execute mit VARCHAR-Parameter (?)', async () => {
    const stmt = await conn.prepare(
      'SELECT CONVERT(VARCHAR(50), ?)',
      [new DataFormat(DataType.VARCHAR, { maxLength: 50 })],
    );
    const r = await stmt.execute(['hello']);
    expect(r.rows[0][0]).toBe('hello');
    await stmt.close();
  });

  it('prepare + execute mit FLT8-Parameter (?)', async () => {
    const stmt = await conn.prepare(
      'SELECT CONVERT(FLOAT, ?)',
      [new DataFormat(DataType.FLT8)],
    );
    const r = await stmt.execute([3.14]);
    expect(typeof r.rows[0][0]).toBe('number');
    expect(Math.abs((r.rows[0][0] as number) - 3.14)).toBeLessThan(0.001);
    await stmt.close();
  });

  it('prepare + execute mit zwei INT-Parametern (?, ?)', async () => {
    const stmt = await conn.prepare(
      'SELECT CONVERT(INT, ?) + CONVERT(INT, ?)',
      [new DataFormat(DataType.INT4), new DataFormat(DataType.INT4)],
    );
    const r = await stmt.execute([3, 7]);
    expect(r.rows[0][0]).toBe(10);
    await stmt.close();
  });

  it('Statement mehrfach mit unterschiedlichen Werten ausführen', async () => {
    const stmt = await conn.prepare(
      'SELECT CONVERT(INT, ?) * CONVERT(INT, ?)',
      [new DataFormat(DataType.INT4), new DataFormat(DataType.INT4)],
    );
    const r1 = await stmt.execute([3, 3]);
    const r2 = await stmt.execute([7, 7]);
    expect(r1.rows[0][0]).toBe(9);
    expect(r2.rows[0][0]).toBe(49);
    await stmt.close();
  });

  // ── Automatische Typ-Erkennung (kein DataFormat angegeben) ─────────────────

  it('auto-inference: string → VARCHAR', async () => {
    const stmt = await conn.prepare('SELECT CONVERT(VARCHAR(50), ?)');
    const r = await stmt.execute(['world']);
    expect(r.rows[0][0]).toBe('world');
    await stmt.close();
  });

  it('auto-inference: ganzzahlige number → INT4', async () => {
    const stmt = await conn.prepare('SELECT CONVERT(INT, ?) + 0');
    const r = await stmt.execute([99]);
    expect(r.rows[0][0]).toBe(99);
    await stmt.close();
  });

  it('auto-inference: Dezimalzahl → FLT8', async () => {
    const stmt = await conn.prepare('SELECT CONVERT(FLOAT, ?)');
    const r = await stmt.execute([2.718]);
    expect(typeof r.rows[0][0]).toBe('number');
    expect(Math.abs((r.rows[0][0] as number) - 2.718)).toBeLessThan(0.001);
    await stmt.close();
  });

  it('auto-inference: boolean → BIT', async () => {
    const stmt = await conn.prepare('SELECT CONVERT(BIT, ?)');
    const r = await stmt.execute([true]);
    expect(r.rows[0][0]).toBe(true);
    await stmt.close();
  });

  it('auto-inference: Date → DATETIMN', async () => {
    const stmt = await conn.prepare('SELECT CONVERT(DATETIME, ?)');
    const r = await stmt.execute([new Date('2024-06-15T00:00:00Z')]);
    expect(r.rows[0][0]).toBeInstanceOf(Date);
    await stmt.close();
  });

  it('auto-inference: gemischte Typen (string + number)', async () => {
    const stmt = await conn.prepare(
      "SELECT CONVERT(VARCHAR(10), ?) + ' = ' + CONVERT(VARCHAR(10), CONVERT(INT, ?))",
    );
    const r = await stmt.execute(['Wert', 42]);
    expect(r.rows[0][0]).toBe('Wert = 42');
    await stmt.close();
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
