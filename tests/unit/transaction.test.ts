import { Connection } from '../../src/connection';
import { Transaction } from '../../src/transaction';
import { TokenType } from '../../src/constants/tds-const';
import {
  MockSocket,
  loginAckBuf,
  doneBuf,
  doneOnlyBuf,
} from './mock-socket';

// ---------------------------------------------------------------------------

async function makeConn(): Promise<{ conn: Connection; mock: MockSocket }> {
  const mock = new MockSocket();
  mock.queueResponse(Buffer.concat([loginAckBuf(), doneBuf()]));
  const conn = await Connection.connect({ host: 'localhost', username: 'sa' }, mock);
  return { conn, mock };
}

// ===========================================================================

describe('Transaction', () => {

  it('conn.transaction() gibt eine Transaction-Instanz zurück', async () => {
    const { conn } = await makeConn();
    expect(conn.transaction()).toBeInstanceOf(Transaction);
  });

  // -------------------------------------------------------------------------
  // begin()
  // -------------------------------------------------------------------------

  describe('begin()', () => {
    it('sendet LANGUAGE-Token mit "BEGIN TRANSACTION"', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();

      mock.queueResponse(doneOnlyBuf());
      await txn.begin();

      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body[0]).toBe(TokenType.LANGUAGE);
      const sqlText = body.slice(6).toString('utf8'); // skip token+len+status
      expect(sqlText).toMatch(/BEGIN TRANSACTION/i);
    });

    it('begin() zweimal wirft', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();
      mock.queueResponse(doneOnlyBuf());
      await txn.begin();
      await expect(txn.begin()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // commit()
  // -------------------------------------------------------------------------

  describe('commit()', () => {
    it('sendet LANGUAGE-Token mit "COMMIT"', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();
      mock.queueResponse(doneOnlyBuf());
      await txn.begin();

      mock.queueResponse(doneOnlyBuf());
      await txn.commit();

      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body[0]).toBe(TokenType.LANGUAGE);
      expect(body.slice(6).toString('utf8')).toMatch(/COMMIT/i);
    });

    it('commit() ohne begin() wirft', async () => {
      const { conn } = await makeConn();
      const txn = conn.transaction();
      await expect(txn.commit()).rejects.toThrow();
    });

    it('setzt Transaktion zurück (erneutes begin() möglich)', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();
      mock.queueResponse(doneOnlyBuf());
      await txn.begin();
      mock.queueResponse(doneOnlyBuf());
      await txn.commit();
      // Zweites begin() darf nicht werfen
      mock.queueResponse(doneOnlyBuf());
      await expect(txn.begin()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // rollback()
  // -------------------------------------------------------------------------

  describe('rollback()', () => {
    it('sendet LANGUAGE-Token mit "ROLLBACK"', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();
      mock.queueResponse(doneOnlyBuf());
      await txn.begin();

      mock.queueResponse(doneOnlyBuf());
      await txn.rollback();

      const pkt  = mock.written[mock.written.length - 1];
      const body = pkt.slice(8);
      expect(body[0]).toBe(TokenType.LANGUAGE);
      expect(body.slice(6).toString('utf8')).toMatch(/ROLLBACK/i);
    });

    it('rollback() ohne begin() wirft', async () => {
      const { conn } = await makeConn();
      const txn = conn.transaction();
      await expect(txn.rollback()).rejects.toThrow();
    });

    it('setzt Transaktion zurück (erneutes begin() möglich)', async () => {
      const { conn, mock } = await makeConn();
      const txn = conn.transaction();
      mock.queueResponse(doneOnlyBuf());
      await txn.begin();
      mock.queueResponse(doneOnlyBuf());
      await txn.rollback();
      mock.queueResponse(doneOnlyBuf());
      await expect(txn.begin()).resolves.toBeUndefined();
    });
  });
});
