/**
 * Integration – Data types (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 */

import { Connection } from '../../src/connection';

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const describeIf = HOST ? describe : describe.skip;

describeIf('Integration – Datentypen', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = await new Connection({ host: HOST!, port: PORT, username: USER, password: PASS }).connect();

    await conn.query(`
      CREATE TABLE #dt (
        col_tinyint    TINYINT,
        col_smallint   SMALLINT,
        col_int        INT,
        col_bigint     BIGINT         NULL,
        col_float      FLOAT,
        col_real       REAL,
        col_numeric    NUMERIC(18,4),
        col_decimal    DECIMAL(10,2),
        col_money      MONEY,
        col_smallmoney SMALLMONEY,
        col_bit        BIT,
        col_char       CHAR(10),
        col_varchar    VARCHAR(100),
        col_datetime   DATETIME,
        col_smalldt    SMALLDATETIME,
        col_varbinary  VARBINARY(32),
        col_null       INT            NULL
      )
    `);

    await conn.query(`
      INSERT INTO #dt VALUES (
        255, -32768, 2147483647, 9223372036854775807,
        3.14159265358979, 1.234,
        12345.6789, 99.99,
        12345.6789, 214.7483,
        1,
        'hello     ', 'world',
        'Jan  1 2024 12:34:00', 'Jan  1 2024 12:34',
        0x48656C6C6F,
        NULL
      )
    `);
  });

  afterAll(async () => {
    if (conn) {
      await conn.query('DROP TABLE #dt').catch(() => {});
      await conn.end();
    }
  });

  it('TINYINT: Wert 255', async () => {
    const r = await conn.query('SELECT col_tinyint FROM #dt');
    expect(r.rows[0][0]).toBe(255);
  });

  it('SMALLINT: Wert -32768', async () => {
    const r = await conn.query('SELECT col_smallint FROM #dt');
    expect(r.rows[0][0]).toBe(-32768);
  });

  it('INT: Wert 2147483647', async () => {
    const r = await conn.query('SELECT col_int FROM #dt');
    expect(r.rows[0][0]).toBe(2147483647);
  });

  it('BIGINT: als bigint dekodiert', async () => {
    const r = await conn.query('SELECT col_bigint FROM #dt');
    expect(typeof r.rows[0][0]).toBe('bigint');
  });

  it('FLOAT: annähernd Pi', async () => {
    const r = await conn.query('SELECT col_float FROM #dt');
    expect(typeof r.rows[0][0]).toBe('number');
    expect(Math.abs((r.rows[0][0] as number) - 3.14159265)).toBeLessThan(0.0001);
  });

  it('REAL: als number dekodiert', async () => {
    const r = await conn.query('SELECT col_real FROM #dt');
    expect(typeof r.rows[0][0]).toBe('number');
  });

  it('NUMERIC(18,4): als String dekodiert', async () => {
    const r = await conn.query('SELECT col_numeric FROM #dt');
    expect(typeof r.rows[0][0]).toBe('string');
    expect(r.rows[0][0] as string).toMatch(/^12345/);
  });

  it('DECIMAL(10,2): Wert "99.99"', async () => {
    const r = await conn.query('SELECT col_decimal FROM #dt');
    expect(r.rows[0][0]).toBe('99.99');
  });

  it('MONEY: als String dekodiert', async () => {
    const r = await conn.query('SELECT col_money FROM #dt');
    expect(typeof r.rows[0][0]).toBe('string');
    expect(r.rows[0][0] as string).toMatch(/12345/);
  });

  it('SMALLMONEY: als String dekodiert', async () => {
    const r = await conn.query('SELECT col_smallmoney FROM #dt');
    expect(typeof r.rows[0][0]).toBe('string');
  });

  it('BIT: Wert true', async () => {
    const r = await conn.query('SELECT col_bit FROM #dt');
    expect(r.rows[0][0]).toBe(true);
  });

  it('CHAR(10): RTRIM ergibt "hello"', async () => {
    const r = await conn.query('SELECT RTRIM(col_char) FROM #dt');
    expect(r.rows[0][0]).toBe('hello');
  });

  it('VARCHAR: Wert "world"', async () => {
    const r = await conn.query('SELECT col_varchar FROM #dt');
    expect(r.rows[0][0]).toBe('world');
  });

  it('DATETIME: als Date dekodiert', async () => {
    const r = await conn.query('SELECT col_datetime FROM #dt');
    expect(r.rows[0][0]).toBeInstanceOf(Date);
  });

  it('SMALLDATETIME: als Date dekodiert', async () => {
    const r = await conn.query('SELECT col_smalldt FROM #dt');
    expect(r.rows[0][0]).toBeInstanceOf(Date);
  });

  it('VARBINARY: als Buffer dekodiert', async () => {
    const r = await conn.query('SELECT col_varbinary FROM #dt');
    expect(r.rows[0][0]).toBeInstanceOf(Buffer);
  });

  it('NULL-Spalte: ergibt null', async () => {
    const r = await conn.query('SELECT col_null FROM #dt');
    expect(r.rows[0][0]).toBeNull();
  });

  it('SELECT NULL ergibt null', async () => {
    const r = await conn.query('SELECT NULL');
    expect(r.rows[0][0]).toBeNull();
  });

  it('ISNULL(NULL, 99) ergibt 99', async () => {
    const r = await conn.query('SELECT ISNULL(NULL, 99)');
    expect(r.rows[0][0]).toBe(99);
  });

  it('GETDATE() liefert ein Date-Objekt', async () => {
    const r = await conn.query('SELECT GETDATE()');
    expect(r.rows[0][0]).toBeInstanceOf(Date);
  });

  it('columns-Metadaten vorhanden', async () => {
    const r = await conn.query('SELECT col_int, col_varchar FROM #dt');
    expect(r.columns).toHaveLength(2);
  });
});
