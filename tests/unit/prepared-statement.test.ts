import { Connection } from '../../src/connection';
import { PreparedStatement } from '../../src/prepared-statement';
import { DataFormat } from '../../src/types/data-format';
import { DataType, TokenType } from '../../src/constants/tds-const';
import {
  MockSocket,
  loginAckBuf,
  doneBuf,
  doneOnlyBuf,
  queryResponseBuf,
} from './mock-socket';

// ---------------------------------------------------------------------------
// Hilfsfunktion: bereits eingeloggte Connection + MockSocket bereitstellen
// ---------------------------------------------------------------------------

async function makeConn(): Promise<{ conn: Connection; mock: MockSocket }> {
  const mock = new MockSocket();
  mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
  const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
  return { conn, mock };
}

// ===========================================================================

describe('PreparedStatement', () => {

  // -------------------------------------------------------------------------
  // prepare (via Connection.prepare)
  // -------------------------------------------------------------------------

  describe('Connection.prepare() – DYNAMIC PREPARE', () => {
    it('gibt eine PreparedStatement-Instanz zurück', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf()); // Server ACK für PREPARE
      const stmt = await conn.prepare('SELECT ?');
      expect(stmt).toBeInstanceOf(PreparedStatement);
    });

    it('sendet nach Login genau ein weiteres Paket (PREPARE)', async () => {
      const { conn, mock } = await makeConn();
      const prevLen = mock.written.length;
      mock.queueResponse(doneOnlyBuf());
      await conn.prepare('SELECT ?');
      expect(mock.written.length).toBe(prevLen + 1);
    });

    it('PREPARE-Paket enthält DYNAMIC-Token (0xE7)', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      await conn.prepare('SELECT ?');
      const pkt = mock.written[mock.written.length - 1];
      // TDS-Body beginnt nach 8-Byte-Header; erster Byte = Token-Typ
      expect(pkt[8]).toBe(TokenType.DYNAMIC);
    });

    it('PREPARE sendet kein PARAMFMT (Typen werden erst bei EXECUTE übermittelt)', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      await conn.prepare('SELECT ?', [new DataFormat(DataType.INT4)]);
      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      // PREPARE darf kein PARAMFMT-Token enthalten
      expect(body.includes(TokenType.PARAMFMT)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------------

  describe('execute() – DYNAMIC EXEC', () => {
    it('gibt QueryResult zurück', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());        // PREPARE ack
      const stmt = await conn.prepare('SELECT ?');

      mock.queueResponse(queryResponseBuf(7, 'test', 1));  // EXEC response
      const result = await stmt.execute([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(7);
    });

    it('execute() mit Params sendet PARAMFMT (0xEC) + PARAMS-Marker (0xD7)', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      const stmt = await conn.prepare('SELECT ?', [new DataFormat(DataType.INT4)]);

      mock.queueResponse(doneOnlyBuf());
      await stmt.execute([42]);
      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body.includes(TokenType.PARAMFMT)).toBe(true);
      expect(body.includes(TokenType.PARAMS)).toBe(true);
    });

    it('wirft bei execute() nach close()', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      const stmt = await conn.prepare('SELECT ?');

      mock.queueResponse(doneOnlyBuf()); // close ack
      await stmt.close();

      await expect(stmt.execute([])).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  describe('close() – DYNAMIC DEALLOC', () => {
    it('sendet DYNAMIC-Token nach close()', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      const stmt = await conn.prepare('SELECT ?');

      const prevLen = mock.written.length;
      mock.queueResponse(doneOnlyBuf());
      await stmt.close();

      expect(mock.written.length).toBe(prevLen + 1);
      const pkt = mock.written[mock.written.length - 1];
      expect(pkt[8]).toBe(TokenType.DYNAMIC);
    });

    it('close() zweimal ist idempotent', async () => {
      const { conn, mock } = await makeConn();
      mock.queueResponse(doneOnlyBuf());
      const stmt = await conn.prepare('SELECT ?');

      mock.queueResponse(doneOnlyBuf());
      await stmt.close();

      const lenAfterFirst = mock.written.length;
      await stmt.close(); // keine weiteren Pakete
      expect(mock.written.length).toBe(lenAfterFirst);
    });
  });
});
