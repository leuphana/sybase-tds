import { Connection } from './connection';

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export class Transaction {
  private _conn: Connection;
  private _active = false;

  constructor(conn: Connection) {
    this._conn = conn;
  }

  async begin(): Promise<void> {
    if (this._active) throw new Error('Transaktion bereits aktiv');
    await this._conn.query('BEGIN TRANSACTION');
    this._active = true;
  }

  async commit(): Promise<void> {
    if (!this._active) throw new Error('Keine aktive Transaktion');
    await this._conn.query('COMMIT');
    this._active = false;
  }

  async rollback(): Promise<void> {
    if (!this._active) throw new Error('Keine aktive Transaktion');
    await this._conn.query('ROLLBACK');
    this._active = false;
  }
}
