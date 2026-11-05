import { PduType, FetchType, CurInfoCmd } from './constants/tds-const';
import { CursorTokens } from './protocol/tokens/cursor-tokens';
import { ParamFmtToken } from './protocol/tokens/param-fmt-token';
import { ParamsToken } from './protocol/tokens/params-token';
import { DataFormat } from './types/data-format';
import { JsValue, inferFormat } from './types/type-mapper';
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
  private _done = false;
  private _fetchSize = 1;

  constructor(conn: Connection, sql: string, params: DataFormat[]) {
    this._conn   = conn;
    this._sql    = sql;
    this._params = params;
  }

  /** True once a fetch returned fewer rows than requested (end of result set). */
  get isDone(): boolean {
    return this._done;
  }

  // -------------------------------------------------------------------------
  // open()
  // -------------------------------------------------------------------------

  /**
   * Declares and opens the cursor. `values` bind `?` placeholders in the SQL
   * (formats from the constructor or inferred from the values).
   */
  async open(values: JsValue[] = []): Promise<void> {
    if (this._open) throw new Error('Cursor ist bereits geöffnet');
    if (this._params.length > 0 && values.length !== this._params.length) {
      throw new Error(`Cursor erwartet ${this._params.length} Parameter, erhalten: ${values.length}`);
    }

    this._name = `cur_${++Cursor._counter}`;
    const enc     = this._conn.encoding;
    const hasArgs = values.length > 0;

    // cursorId = 0 → server assigns ID; name used for identification
    const parts = [
      CursorTokens.curDeclare(this._name, this._sql, { hasArgs }, enc),
      CursorTokens.curOpen(0, { name: this._name, hasArgs }, enc),
    ];

    if (hasArgs) {
      const formats = this._params.length > 0 ? this._params : values.map(v => inferFormat(v, enc));
      parts.push(
        ParamFmtToken.build(formats),
        ParamsToken.buildMarker(),
        ...formats.map((df, i) => this._conn._mapper.encodeParam(df, values[i])),
      );
    }

    await this._conn._request(PduType.BUF_NORMAL, Buffer.concat(parts));

    this._open = true;
    this._done = false;
    this._fetchSize = 1;
  }

  // -------------------------------------------------------------------------
  // fetch()
  // -------------------------------------------------------------------------

  /** Fetches up to `count` rows. Returns an empty array once the cursor is exhausted. */
  async fetch(count = 1): Promise<JsValue[][]> {
    if (!this._open) throw new Error('Cursor ist nicht geöffnet');
    if (!Number.isInteger(count) || count < 1) throw new RangeError('count muss eine positive Ganzzahl sein');
    if (this._done) return [];

    const enc   = this._conn.encoding;
    const parts: Buffer[] = [];
    if (count !== this._fetchSize) {
      parts.push(CursorTokens.curInfo(0, CurInfoCmd.SETCURROWS, { name: this._name, fetchSize: count }, enc));
    }
    parts.push(CursorTokens.curFetch(0, FetchType.NEXT, { name: this._name }, enc));

    const result = await this._conn._request(PduType.BUF_NORMAL, Buffer.concat(parts));
    this._fetchSize = count;

    const rows = result.resultSets.flatMap(rs => rs.rows);
    if (rows.length < count) this._done = true;
    return rows;
  }

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (!this._open) return;
    this._open = false;

    const closeBuf = CursorTokens.curClose(0, { name: this._name, dealloc: true }, this._conn.encoding);
    await this._conn._request(PduType.BUF_NORMAL, closeBuf);
  }
}
