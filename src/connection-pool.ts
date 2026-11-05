import { Connection, ConnectOptions } from './connection';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PoolOptions {
  /** Connections kept open even when idle. Default 0. */
  min?: number;
  /** Maximum number of connections (idle + in use + being created). 0 = unlimited. Default 10. */
  max?: number;
  /** Close idle connections (above `min`) after this many ms. Default 60000. */
  idleTimeout?: number;
  /** Reject acquire() if no connection becomes available within this many ms. 0 = wait forever. Default 30000. */
  acquireTimeout?: number;
}

interface Waiter {
  resolve: (conn: Connection) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// ConnectionPool
// ---------------------------------------------------------------------------

export class ConnectionPool {
  private _options: ConnectOptions;
  private _poolOptions: Required<PoolOptions>;

  private _idle: Connection[] = [];
  private _active = new Set<Connection>();
  private _pending = 0;
  private _waiting: Waiter[] = [];
  private _closed = false;
  private _idleTimers: Map<Connection, ReturnType<typeof setTimeout>> = new Map();

  public constructor(options: ConnectOptions, poolOptions: PoolOptions = {}) {
    this._options     = options;
    this._poolOptions = {
      min:            poolOptions.min            ?? 0,
      max:            poolOptions.max            ?? 10,
      idleTimeout:    poolOptions.idleTimeout    ?? 60_000,
      acquireTimeout: poolOptions.acquireTimeout ?? 30_000,
    };
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  get size(): number         { return this._idle.length + this._active.size + this._pending; }
  get idleCount(): number    { return this._idle.length; }
  get activeCount(): number  { return this._active.size; }
  get waitingCount(): number { return this._waiting.length; }

  // -------------------------------------------------------------------------
  // acquire()
  // -------------------------------------------------------------------------

  async acquire(): Promise<Connection> {
    if (this._closed) throw new Error('Pool geschlossen');

    // Re-use an idle connection (skip ones that died while idle)
    while (this._idle.length > 0) {
      const conn = this._idle.pop()!;
      this._cancelIdleTimer(conn);
      if (conn.isClosed) continue;
      this._active.add(conn);
      return conn;
    }

    if (this._hasCapacity()) {
      const conn = await this._create();
      this._active.add(conn);
      return conn;
    }

    // Wait until a connection is released
    return new Promise<Connection>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };
      const ms = this._poolOptions.acquireTimeout;
      if (ms > 0) {
        waiter.timer = setTimeout(() => {
          const idx = this._waiting.indexOf(waiter);
          if (idx !== -1) this._waiting.splice(idx, 1);
          reject(new Error(`Keine Connection innerhalb von ${ms} ms verfügbar (max=${this._poolOptions.max})`));
        }, ms);
      }
      this._waiting.push(waiter);
    });
  }

  // -------------------------------------------------------------------------
  // release()
  // -------------------------------------------------------------------------

  /**
   * Returns a connection to the pool. Broken connections are discarded, an
   * open transaction is rolled back first. Never rejects.
   */
  release(conn: Connection): Promise<void> {
    if (!this._active.delete(conn)) return Promise.resolve(); // unknown or double release

    if (conn.isClosed) {
      this._serveWaiterWithNewConnection();
      return Promise.resolve();
    }

    if (conn.inTransaction) {
      return conn
        .query('IF @@trancount > 0 ROLLBACK TRANSACTION')
        .then(() => {
          conn._transactionActive = false;
          this._checkIn(conn);
        })
        .catch(() => {
          conn.destroy();
          this._serveWaiterWithNewConnection();
        });
    }

    this._checkIn(conn);
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // end()
  // -------------------------------------------------------------------------

  /** Closes idle connections and rejects waiters. Connections in use are closed when released. */
  async end(): Promise<void> {
    this._closed = true;

    for (const timer of this._idleTimers.values()) clearTimeout(timer);
    this._idleTimers.clear();

    const idle = this._idle.splice(0);
    await Promise.all(idle.map(c => c.end().catch(() => { /* ignore */ })));

    for (const waiter of this._waiting.splice(0)) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(new Error('Pool geschlossen'));
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _hasCapacity(): boolean {
    const max = this._poolOptions.max;
    return max === 0 || this.size < max;
  }

  private async _create(): Promise<Connection> {
    this._pending++;
    try {
      const conn = await new Connection(this._options).connect();
      if (this._closed) {
        conn.end().catch(() => { /* ignore */ });
        throw new Error('Pool geschlossen');
      }
      return conn;
    } finally {
      this._pending--;
    }
  }

  private _checkIn(conn: Connection): void {
    if (this._closed) {
      conn.end().catch(() => { /* ignore */ });
      return;
    }

    const waiter = this._waiting.shift();
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer);
      this._active.add(conn);
      waiter.resolve(conn);
      return;
    }

    this._idle.push(conn);
    this._startIdleTimer(conn);
  }

  /** A slot became free (connection discarded): open a fresh one for the next waiter. */
  private _serveWaiterWithNewConnection(): void {
    if (this._closed || this._waiting.length === 0 || !this._hasCapacity()) return;
    const waiter = this._waiting.shift()!;
    if (waiter.timer) clearTimeout(waiter.timer);
    this._create().then(
      (conn) => { this._active.add(conn); waiter.resolve(conn); },
      (err: Error) => waiter.reject(err),
    );
  }

  private _startIdleTimer(conn: Connection): void {
    const timer = setTimeout(() => {
      this._idleTimers.delete(conn);
      // Keep at least `min` connections open
      if (this._idle.length + this._active.size <= this._poolOptions.min) {
        this._startIdleTimer(conn);
        return;
      }
      const idx = this._idle.indexOf(conn);
      if (idx !== -1) this._idle.splice(idx, 1);
      conn.end().catch(() => { /* ignore */ });
    }, this._poolOptions.idleTimeout);

    // Allow the process to exit even if the timer is still pending
    timer.unref?.();
    this._idleTimers.set(conn, timer);
  }

  private _cancelIdleTimer(conn: Connection): void {
    const timer = this._idleTimers.get(conn);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._idleTimers.delete(conn);
    }
  }
}
