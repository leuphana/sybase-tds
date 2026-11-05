import { Connection } from '../../src/connection';
import { ConnectionPool } from '../../src/connection-pool';

// ---------------------------------------------------------------------------
// Mock-Verbindungsobjekt
// ---------------------------------------------------------------------------

function mockConn(): Connection {
  return {
    end: jest.fn().mockResolvedValue(undefined),
    query:       jest.fn(),
    prepare:     jest.fn(),
    cursor:      jest.fn(),
    transaction: jest.fn(),
    _send:       jest.fn(),
    _collectResult: jest.fn(),
    _mapper:     {} as any,
  } as unknown as Connection;
}

// ---------------------------------------------------------------------------
// Vor jedem Test: Connection.connect durch eine Factory ersetzen,
// die sofort eine Mock-Connection zurückgibt
// ---------------------------------------------------------------------------

let connectSpy: jest.SpyInstance;
let connections: Connection[];

beforeEach(() => {
  connections = [];
  connectSpy = jest
    .spyOn(Connection.prototype, 'connect')
    .mockImplementation(async function(this: Connection) {
      connections.push(this);
      Object.assign(this, mockConn());
      // Zustand der Mock-Connection steuerbar machen (echte Getter überschreiben)
      Object.defineProperty(this, 'isClosed',      { value: false, writable: true, configurable: true });
      Object.defineProperty(this, 'inTransaction', { value: false, writable: true, configurable: true });
      return this;
    });
});

afterEach(() => {
  connectSpy.mockRestore();
  jest.useRealTimers();
});

// ===========================================================================

describe('ConnectionPool', () => {

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  it('create() gibt einen Pool zurück', () => {
    const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
    expect(pool).toBeInstanceOf(ConnectionPool);
  });

  // -------------------------------------------------------------------------
  // acquire()
  // -------------------------------------------------------------------------

  describe('acquire()', () => {
    it('erstellt eine neue Connection beim ersten acquire()', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      const conn = await pool.acquire();
      expect(conn).toBeDefined();
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('zweites acquire() erstellt eine weitere Connection (beide aktiv)', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' }, { max: 5 });
      await pool.acquire();
      await pool.acquire();
      expect(connectSpy).toHaveBeenCalledTimes(2);
    });

    it('acquire() nach release() nutzt idle Connection wieder (kein neues connect)', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      const conn = await pool.acquire();
      pool.release(conn);

      const conn2 = await pool.acquire();
      expect(conn2).toBe(conn);            // identisches Objekt
      expect(connectSpy).toHaveBeenCalledTimes(1); // kein zweites connect
    });

    it('acquire() bei max=1 wartet bis release()', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' }, { max: 1 });
      const conn1 = await pool.acquire();

      let resolved = false;
      const p = pool.acquire().then(c => { resolved = true; return c; });

      // Noch nicht aufgelöst (max erreicht)
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Release → Waiter bekommt conn1
      pool.release(conn1);
      const conn2 = await p;

      expect(resolved).toBe(true);
      expect(conn2).toBe(conn1);
    });

    it('acquire() nach end() wirft', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      await pool.end();
      await expect(pool.acquire()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // release()
  // -------------------------------------------------------------------------

  describe('release()', () => {
    it('release() fügt Connection zum Idle-Pool hinzu', async () => {
      jest.useFakeTimers(); // Idle-Timer soll nicht ablaufen
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      const conn = await pool.acquire();
      pool.release(conn);

      // Direkt danach wieder acquire → sollte idle conn zurückgeben
      const conn2 = await pool.acquire();
      expect(conn2).toBe(conn);
    });

    it('release() an wartenden Waiter weiterleiten', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' }, { max: 1 });
      const conn = await pool.acquire();

      // Zweites acquire() wartet (max=1 voll)
      const acquireP = pool.acquire();
      pool.release(conn);
      const conn2 = await acquireP;

      expect(conn2).toBe(conn);
    });
  });

  // -------------------------------------------------------------------------
  // end()
  // -------------------------------------------------------------------------

  describe('end()', () => {
    it('schließt alle idle Connections', async () => {
      jest.useFakeTimers();
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      const conn = await pool.acquire();
      pool.release(conn);

      await pool.end();

      expect((conn.end as jest.Mock)).toHaveBeenCalled();
    });

    it('reject() wartende Acquirer mit Fehler', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' }, { max: 0 });
      // max=0 → kein Limit → direkt erstellen. Mache max=1 voll
      const pool2 = new ConnectionPool({ host: 'localhost', username: 'sa' }, { max: 1 });
      const conn = await pool2.acquire();

      const p = pool2.acquire();
      await pool2.end();
      await expect(p).rejects.toThrow();

      // conn.end wurde nicht aufgerufen (aktive conn)
      void conn; // suppress unused warning
    });

    it('end() zweimal ist sicher (kein doppelter Fehler)', async () => {
      const pool = new ConnectionPool({ host: 'localhost', username: 'sa' });
      await pool.end();
      await expect(pool.end()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Idle-Timeout
  // -------------------------------------------------------------------------

  describe('Idle-Timeout', () => {
    it('idle Connection wird nach Timeout geschlossen', async () => {
      jest.useFakeTimers();
      const pool = new ConnectionPool(
        { host: 'localhost', username: 'sa' },
        { idleTimeout: 1000 },
      );
      const conn = await pool.acquire();
      pool.release(conn);

      jest.advanceTimersByTime(1001);
      expect((conn.end as jest.Mock)).toHaveBeenCalled();
    });

    it('Timer wird abgebrochen wenn Connection re-acquired wird', async () => {
      jest.useFakeTimers();
      const pool = new ConnectionPool(
        { host: 'localhost', username: 'sa' },
        { idleTimeout: 1000 },
      );
      const conn = await pool.acquire();
      pool.release(conn);

      // Sofort wieder acquire – Timer soll abgebrochen werden
      const conn2 = await pool.acquire();
      jest.advanceTimersByTime(1001);

      // conn.end sollte NICHT aufgerufen worden sein (Timer abgebrochen)
      expect((conn.end as jest.Mock)).not.toHaveBeenCalled();
      expect(conn2).toBe(conn);
    });
  });

  // -------------------------------------------------------------------------
  // Robustheit (H7, Code-Review 2026-11-05)
  // -------------------------------------------------------------------------

  describe('Robustheit', () => {
    const opts = { host: 'localhost', username: 'sa' };
    const setState = (c: Connection, key: 'isClosed' | 'inTransaction', v: boolean) =>
      Object.defineProperty(c, key, { value: v, writable: true, configurable: true });

    it('parallele acquire() überschreiten max nicht', async () => {
      let release!: () => void;
      const gate = new Promise<void>(r => { release = r; });
      connectSpy.mockImplementation(async function(this: Connection) {
        await gate;
        Object.assign(this, mockConn());
        setState(this, 'isClosed', false);
        setState(this, 'inTransaction', false);
        return this;
      });
      const pool = new ConnectionPool(opts, { max: 2, acquireTimeout: 0 });
      const ps = [pool.acquire(), pool.acquire(), pool.acquire()];
      await Promise.resolve();
      expect(connectSpy).toHaveBeenCalledTimes(2);
      release();
      const [a, b] = await Promise.all(ps.slice(0, 2));
      expect(pool.size).toBe(2);
      pool.release(a);
      expect(await ps[2]).toBe(a);
      void b;
    });

    it('tote idle Connection wird verworfen, neue wird erstellt', async () => {
      const pool = new ConnectionPool(opts);
      const conn = await pool.acquire();
      await pool.release(conn);
      setState(conn, 'isClosed', true);
      const conn2 = await pool.acquire();
      expect(conn2).not.toBe(conn);
      expect(connectSpy).toHaveBeenCalledTimes(2);
    });

    it('release() einer toten Connection gibt den Slot für Wartende frei', async () => {
      const pool = new ConnectionPool(opts, { max: 1 });
      const conn = await pool.acquire();
      const waiting = pool.acquire();
      setState(conn, 'isClosed', true);
      await pool.release(conn);
      const conn2 = await waiting;
      expect(conn2).not.toBe(conn);
    });

    it('offene Transaktion wird bei release() zurückgerollt', async () => {
      const pool = new ConnectionPool(opts);
      const conn = await pool.acquire();
      setState(conn, 'inTransaction', true);
      (conn.query as jest.Mock).mockResolvedValue({});
      await pool.release(conn);
      expect(conn.query).toHaveBeenCalledWith('IF @@trancount > 0 ROLLBACK TRANSACTION');
      expect(pool.idleCount).toBe(1);
    });

    it('scheitert der Rollback, wird die Connection zerstört statt wiederverwendet', async () => {
      const pool = new ConnectionPool(opts);
      const conn = await pool.acquire();
      setState(conn, 'inTransaction', true);
      (conn.query as jest.Mock).mockRejectedValue(new Error('kaputt'));
      (conn as unknown as { destroy: jest.Mock }).destroy = jest.fn();
      await pool.release(conn);
      expect((conn as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
      expect(pool.idleCount).toBe(0);
    });

    it('doppeltes release() ist harmlos', async () => {
      const pool = new ConnectionPool(opts);
      const conn = await pool.acquire();
      await pool.release(conn);
      await pool.release(conn);
      expect(pool.idleCount).toBe(1);
    });

    it('acquireTimeout lehnt nach Ablauf ab', async () => {
      jest.useFakeTimers();
      const pool = new ConnectionPool(opts, { max: 1, acquireTimeout: 500 });
      await pool.acquire();
      const p = pool.acquire();
      jest.advanceTimersByTime(501);
      await expect(p).rejects.toThrow(/500 ms/);
      expect(pool.waitingCount).toBe(0);
    });

    it('Idle-Timeout schließt nicht unter min', async () => {
      jest.useFakeTimers();
      const pool = new ConnectionPool(opts, { min: 1, idleTimeout: 1000 });
      const conn = await pool.acquire();
      await pool.release(conn);
      jest.advanceTimersByTime(5000);
      expect(conn.end as jest.Mock).not.toHaveBeenCalled();
      expect(pool.idleCount).toBe(1);
    });
  });
});
