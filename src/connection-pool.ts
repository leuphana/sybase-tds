import { Connection, ConnectOptions } from './connection';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PoolOptions {
  min?: number;
  max?: number;
  idleTimeout?: number;
}

// ---------------------------------------------------------------------------
// ConnectionPool
// ---------------------------------------------------------------------------

export class ConnectionPool {
  private _options: ConnectOptions;
  private _poolOptions: Required<PoolOptions>;

  private _idle: Connection[] = [];
  private _active = 0;
  private _waiting: Array<{
    resolve: (conn: Connection) => void;
    reject: (err: Error) => void;
  }> = [];
  private _closed = false;
  private _idleTimers: Map<Connection, ReturnType<typeof setTimeout>> = new Map();

  private constructor(options: ConnectOptions, poolOptions: PoolOptions = {}) {
    this._options     = options;
    this._poolOptions = {
      min:         poolOptions.min         ?? 0,
      max:         poolOptions.max         ?? 10,
      idleTimeout: poolOptions.idleTimeout ?? 60_000,
    };
  }

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------

  static create(options: ConnectOptions, poolOptions: PoolOptions = {}): ConnectionPool {
    return new ConnectionPool(options, poolOptions);
  }

  // -------------------------------------------------------------------------
  // acquire()
  // -------------------------------------------------------------------------

  async acquire(): Promise<Connection> {
    if (this._closed) throw new Error('Pool geschlossen');

    // Re-use an idle connection
    if (this._idle.length > 0) {
      const conn = this._idle.pop()!;
      this._cancelIdleTimer(conn);
      this._active++;
      return conn;
    }

    const total = this._idle.length + this._active;
    const max   = this._poolOptions.max;

    // Create a new connection if below max (max=0 means unlimited)
    if (max === 0 || total < max) {
      const conn = await Connection.connect(this._options);
      this._active++;
      return conn;
    }

    // Wait until a connection is released
    return new Promise<Connection>((resolve, reject) => {
      this._waiting.push({ resolve, reject });
    });
  }

  // -------------------------------------------------------------------------
  // release()
  // -------------------------------------------------------------------------

  release(conn: Connection): void {
    this._active = Math.max(0, this._active - 1);

    if (this._waiting.length > 0) {
      const waiter = this._waiting.shift()!;
      this._active++;
      waiter.resolve(conn);
      return;
    }

    if (this._closed) {
      conn.end().catch(() => { /* ignore */ });
      return;
    }

    // Put back into idle pool and start a timer
    this._idle.push(conn);

    const timer = setTimeout(() => {
      const idx = this._idle.indexOf(conn);
      if (idx !== -1) this._idle.splice(idx, 1);
      this._idleTimers.delete(conn);
      conn.end().catch(() => { /* ignore */ });
    }, this._poolOptions.idleTimeout);

    // Allow the process to exit even if the timer is still pending
    if (typeof timer === 'object' && 'unref' in timer) {
      (timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }

    this._idleTimers.set(conn, timer);
  }

  // -------------------------------------------------------------------------
  // end()
  // -------------------------------------------------------------------------

  async end(): Promise<void> {
    this._closed = true;

    // Cancel all idle timers and close idle connections
    for (const [conn, timer] of this._idleTimers) {
      clearTimeout(timer);
      conn.end().catch(() => { /* ignore */ });
    }
    this._idleTimers.clear();
    this._idle = [];

    // Reject all waiting acquirers
    for (const waiter of this._waiting) {
      waiter.reject(new Error('Pool geschlossen'));
    }
    this._waiting = [];
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _cancelIdleTimer(conn: Connection): void {
    const timer = this._idleTimers.get(conn);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._idleTimers.delete(conn);
    }
  }
}
