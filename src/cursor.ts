import { PduType, FetchType } from './constants/tds-const';
import { CursorTokens } from './protocol/tokens/cursor-tokens';
import { DataFormat } from './types/data-format';
import { JsValue } from './types/type-mapper';
import { Connection } from './connection';

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export class Cursor {
  private static _counter = 0;

  private _conn: Connection;
  private _sql: string;
  private _params: DataFormat[];
  private _name = '';
  private _open = false;

  constructor(conn: Connection, sql: string, params: DataFormat[]) {
    this._conn   = conn;
    this._sql    = sql;
    this._params = params;
  }

  // -------------------------------------------------------------------------
  // open()
  // -------------------------------------------------------------------------

  async open(): Promise<void> {
    this._name = `cur_${++Cursor._counter}`;

    // cursorId = 0 → server assigns ID; name used for identification
    const declareBuf = CursorTokens.curDeclare(this._name, this._sql);
    const openBuf    = CursorTokens.curOpen(0, { name: this._name });

    const payload = Buffer.concat([declareBuf, openBuf]);
    await this._conn._send(PduType.BUF_LANG, payload);
    await this._conn._collectResult();

    this._open = true;
  }

  // -------------------------------------------------------------------------
  // fetch()
  // -------------------------------------------------------------------------

  async fetch(_count = 1): Promise<JsValue[][]> {
    if (!this._open) throw new Error('Cursor ist nicht geöffnet');

    const fetchBuf = CursorTokens.curFetch(0, FetchType.NEXT, { name: this._name });
    await this._conn._send(PduType.BUF_LANG, fetchBuf);

    const result = await this._conn._collectResult();
    return result.rows;
  }

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (!this._open) return;

    const closeBuf = CursorTokens.curClose(0, { name: this._name, dealloc: true });
    await this._conn._send(PduType.BUF_LANG, closeBuf);
    await this._conn._collectResult();

    this._open = false;
  }
}
