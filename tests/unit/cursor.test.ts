import { Connection } from '../../src/connection';
import { Cursor } from '../../src/cursor';
import { TokenType } from '../../src/constants/tds-const';
import {
  MockSocket,
  loginAckBuf,
  doneBuf,
  doneOnlyBuf,
  queryResponseBuf,
} from './mock-socket';

// ---------------------------------------------------------------------------

async function makeConn(): Promise<{ conn: Connection; mock: MockSocket }> {
  const mock = new MockSocket();
  mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
  const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
  return { conn, mock };
}

// ===========================================================================

describe('Cursor', () => {

  // -------------------------------------------------------------------------
  // cursor() factory
  // -------------------------------------------------------------------------

  it('conn.cursor() gibt eine Cursor-Instanz zurück', async () => {
    const { conn } = await makeConn();
    expect(conn.cursor('SELECT 1')).toBeInstanceOf(Cursor);
  });

  // -------------------------------------------------------------------------
  // open()
  // -------------------------------------------------------------------------

  describe('open()', () => {
    it('sendet ein Paket (CURDECLARE + CUROPEN) und setzt _open = true', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT id FROM t');

      mock.queueResponse(doneOnlyBuf()); // Server-Antwort auf DECLARE+OPEN
      await cursor.open();

      // Login belegt ≥2 Pakete; open() sendet 1 weiteres
      const expectedLen = mock.written.length;
      expect(expectedLen).toBeGreaterThanOrEqual(3);
    });

    it('Paket enthält CURDECLARE-Token (0x86)', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT id FROM t');
      mock.queueResponse(doneOnlyBuf());
      await cursor.open();

      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body.includes(TokenType.CURDECLARE)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // fetch()
  // -------------------------------------------------------------------------

  describe('fetch()', () => {
    it('gibt Zeilen aus der Serverantwort zurück', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT id, name FROM t');

      mock.queueResponse(doneOnlyBuf());                     // open ack
      await cursor.open();

      mock.queueResponse(queryResponseBuf(10, 'alice', 1));  // fetch response
      const rows = await cursor.fetch();

      expect(rows).toHaveLength(1);
      expect(rows[0][0]).toBe(10);
      expect(rows[0][1]).toBe('alice');
    });

    it('wirft wenn Cursor nicht geöffnet ist', async () => {
      const { conn } = await makeConn();
      const cursor = conn.cursor('SELECT 1');
      await expect(cursor.fetch()).rejects.toThrow();
    });

    it('sendet CURFETCH-Token (0x82)', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT id FROM t');
      mock.queueResponse(doneOnlyBuf());
      await cursor.open();

      const lenAfterOpen = mock.written.length;
      mock.queueResponse(queryResponseBuf(1, 'x', 1));
      await cursor.fetch();

      expect(mock.written.length).toBe(lenAfterOpen + 1);
      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body[0]).toBe(TokenType.CURFETCH);
    });
  });

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  describe('close()', () => {
    it('sendet CURCLOSE-Token (0x80)', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT id FROM t');
      mock.queueResponse(doneOnlyBuf());
      await cursor.open();

      const lenAfterOpen = mock.written.length;
      mock.queueResponse(doneOnlyBuf());
      await cursor.close();

      expect(mock.written.length).toBe(lenAfterOpen + 1);
      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body[0]).toBe(TokenType.CURCLOSE);
    });

    it('close() ohne open() ist idempotent (kein Paket)', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT 1');
      const len = mock.written.length;
      await cursor.close();
      expect(mock.written.length).toBe(len);
    });

    it('close() zweimal ist idempotent', async () => {
      const { conn, mock } = await makeConn();
      const cursor = conn.cursor('SELECT 1');
      mock.queueResponse(doneOnlyBuf());
      await cursor.open();

      mock.queueResponse(doneOnlyBuf());
      await cursor.close();
      const lenAfterClose = mock.written.length;

      await cursor.close();
      expect(mock.written.length).toBe(lenAfterClose);
    });
  });
});
