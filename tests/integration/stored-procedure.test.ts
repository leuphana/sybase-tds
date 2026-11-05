/**
 * Integration – Stored Procedures (Sybase ASE 15.7)
 * Requires SYBASE_TEST_HOST.
 *
 * Only read-only system procedures – ASE cannot create temporary procedures.
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

  // ASE erlaubt keine temporären Prozeduren (#name). Damit die Tests keine
  // Objekte in einer echten Datenbank anlegen, nutzen sie nur lesende
  // System-Prozeduren.

  it('EXEC einer System-Prozedur liefert Zeilen und Return-Status 0', async () => {
    const r = await conn.query('EXEC sp_server_info');
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.returnStatus).toBe(0);
  });

  it('Return-Status ≠ 0 wird geliefert (sp_helpdb mit unbekannter DB)', async () => {
    let r;
    try {
      r = await conn.query("EXEC sp_helpdb 'gibt_es_nicht_xyz'");
    } catch (e) {
      // manche Versionen melden zusätzlich einen Fehler – dann reicht, dass die Connection nutzbar bleibt
      r = undefined;
    }
    if (r) expect(r.returnStatus).not.toBe(0);
    expect((await conn.query('SELECT 1')).rows[0][0]).toBe(1);
  });

  it('Prozedur mit mehreren Resultsets', async () => {
    const r = await conn.query('EXEC sp_help sysobjects');
    expect(r.resultSets.length).toBeGreaterThan(1);
    expect(r.returnStatus).toBe(0);
  });

  it('Connection bleibt nach mehreren EXEC synchron', async () => {
    for (let i = 0; i < 3; i++) await conn.query('EXEC sp_server_info');
    expect((await conn.query('SELECT 7')).rows[0][0]).toBe(7);
  });
});
