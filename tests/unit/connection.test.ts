import { Connection } from '../../src/connection';
import { SybaseError } from '../../src/error';
import { LoginAckStatus } from '../../src/constants/tds-const';
import { TdsSocket } from '../../src/protocol/tds-socket';
import {
  MockSocket,
  loginAckBuf,
  doneBuf,
  eedBuf,
  doneOnlyBuf,
  queryResponseBuf,
} from './mock-socket';

// ---------------------------------------------------------------------------
// Hilfsfunktion: MockSocket → TdsSocket → Connection (ohne Login-Handshake)
// ---------------------------------------------------------------------------

function makeConnectedSocket(mock: MockSocket): TdsSocket {
  return new TdsSocket(mock);
}

/** Erstellt eine Connection mit bereits eingeloggtem MockSocket. */
async function makeConnection(mock: MockSocket): Promise<Connection> {
  // Queue login response
  mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
  return new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
}

// ===========================================================================

describe('Connection', () => {

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe('connect() – Login-Handshake', () => {
    it('gibt eine Connection zurück bei erfolgreichem Login', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
      expect(conn).toBeInstanceOf(Connection);
    });

    it('schreibt Login + Capability in TDS-Pakete (Login-Body > maxBody → 2 Pakete)', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
      // Login-Body (568 B) + CapabilityToken (~31 B) > 504 B maxBody → 2 Pakete
      expect(mock.written.length).toBeGreaterThanOrEqual(2);
    });

    it('wirft SybaseError bei EED-Antwort', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([eedBuf(4002, 'Login failed'), doneBuf()]));
      await expect(
        new Connection({ host: 'localhost', username: 'sa' }, mock).connect(),
      ).rejects.toBeInstanceOf(SybaseError);
    });

    it('wirft Error bei fehlgeschlagenem LoginAck (status ≠ SUCCEED)', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([
        loginAckBuf(LoginAckStatus.FAIL),
        doneBuf(),
      ]));
      await expect(
        new Connection({ host: 'localhost', username: 'sa' }, mock).connect(),
      ).rejects.toThrow('Login fehlgeschlagen');
    });

    it('EED-Fehler enthält errorNumber', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([eedBuf(4002, 'Login failed'), doneBuf()]));
      let err: SybaseError | null = null;
      try {
        await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
      } catch (e) {
        err = e as SybaseError;
      }
      expect(err?.errorNumber).toBe(4002);
    });
  });

  // -------------------------------------------------------------------------
  // query()
  // -------------------------------------------------------------------------

  describe('query() – einfache SQL-Query', () => {
    it('gibt QueryResult mit rows zurück', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa', byteswap: true }, mock).connect();

      mock.queueResponse(queryResponseBuf(42, 'alice'));
      const result = await conn.query('SELECT id, name FROM users');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(42);
      expect(result.rows[0][1]).toBe('alice');
    });

    it('gibt rowCount aus DONE-Token zurück', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();

      mock.queueResponse(queryResponseBuf(1, 'x', 3));
      const result = await conn.query('SELECT ...');
      expect(result.rowCount).toBe(3);
    });

    it('gibt leeres rows-Array bei INSERT/UPDATE zurück', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();

      mock.queueResponse(doneOnlyBuf(5));
      const result = await conn.query('INSERT INTO ...');
      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(5);
    });

    it('wirft SybaseError bei EED-Antwort', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();

      mock.queueResponse(Buffer.concat([eedBuf(208, 'Object not found'), doneBuf()]));
      await expect(conn.query('SELECT ...')).rejects.toBeInstanceOf(SybaseError);
    });

    it('SybaseError.message enthält Fehlertext', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();

      mock.queueResponse(Buffer.concat([eedBuf(208, 'Object not found'), doneBuf()]));
      let err: SybaseError | null = null;
      try { await conn.query('...'); } catch (e) { err = e as SybaseError; }
      expect(err?.message).toBe('Object not found');
    });
  });

  // -------------------------------------------------------------------------
  // end()
  // -------------------------------------------------------------------------

  describe('end() – Verbindungsende', () => {
    it('sendet LOGOUT-Paket (zweites geschriebenes Paket)', async () => {
      const mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      const conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();

      await conn.end();
      // letztes geschriebenes Paket = LOGOUT
      const logoutPkt = mock.written[mock.written.length - 1];
      expect(logoutPkt[8]).toBe(0x71); // Token-Byte nach 8-Byte-Header
    });
  });

  // -------------------------------------------------------------------------
  // prepare() / cursor() / transaction() – gibt korrekte Instanz zurück
  // -------------------------------------------------------------------------

  describe('Fabrik-Methoden', () => {
    let conn: Connection;
    let mock: MockSocket;

    beforeEach(async () => {
      mock = new MockSocket();
      mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
      conn = await new Connection({ host: 'localhost', username: 'sa' }, mock).connect();
    });

    it('cursor() gibt eine Cursor-Instanz zurück', () => {
      const { Cursor } = require('../../src/cursor');
      expect(conn.cursor('SELECT 1')).toBeInstanceOf(Cursor);
    });

    it('transaction() gibt eine Transaction-Instanz zurück', () => {
      const { Transaction } = require('../../src/transaction');
      expect(conn.transaction()).toBeInstanceOf(Transaction);
    });
  });
});
