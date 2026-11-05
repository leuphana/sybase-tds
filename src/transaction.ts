import { Connection } from './connection';

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

/**
 * Simple (non-nested) transaction. ASE/TDS 5.0 savepoints are not supported
 * by this class – do not nest transactions on one connection.
 */
export class Transaction {
  private _conn: Connection;
  private _active = false;

  constructor(conn: Connection) {
    this._conn = conn;
  }

  get isActive(): boolean {
    return this._active;
  }

  async begin(): Promise<void> {
    if (this._active) throw new Error('Transaktion bereits aktiv');
    if (this._conn._transactionActive) throw new Error('Auf dieser Connection ist bereits eine Transaktion aktiv');
    await this._conn.query('BEGIN TRANSACTION');
    this._active = true;
    this._conn._transactionActive = true;
  }

  async commit(): Promise<void> {
    if (!this._active) throw new Error('Keine aktive Transaktion');
    try {
      await this._conn.query('COMMIT TRANSACTION');
    } finally {
      this._active = false;
      this._conn._transactionActive = false;
    }
  }

  async rollback(): Promise<void> {
    if (!this._active) throw new Error('Keine aktive Transaktion');
    try {
      await this._conn.query('ROLLBACK TRANSACTION');
    } finally {
      this._active = false;
      this._conn._transactionActive = false;
    }
  }
}
