import { PduType } from './constants/tds-const';
import { DynamicToken } from './protocol/tokens/dynamic-token';
import { ParamFmtToken } from './protocol/tokens/param-fmt-token';
import { ParamsToken } from './protocol/tokens/params-token';
import { DataFormat } from './types/data-format';
import { JsValue } from './types/type-mapper';
import { Connection, QueryResult } from './connection';

// ---------------------------------------------------------------------------
// PreparedStatement
// ---------------------------------------------------------------------------

export class PreparedStatement {
  private static _counter = 0;

  private _name: string;
  private _conn: Connection;
  private _params: DataFormat[];
  private _closed = false;

  private constructor(conn: Connection, name: string, params: DataFormat[]) {
    this._conn   = conn;
    this._name   = name;
    this._params = params;
  }

  // -------------------------------------------------------------------------
  // Static factory (called by Connection.prepare())
  // -------------------------------------------------------------------------

  static async _create(
    conn: Connection,
    sql: string,
    params: DataFormat[],
  ): Promise<PreparedStatement> {
    const name = `stmt_${++PreparedStatement._counter}`;
    const stmt = new PreparedStatement(conn, name, params);

    const hasParams = params.length > 0;

    // status = 0 for a normal prepare; DynamicToken.prepare expects (name, sql, status, encoding)
    const dynBuf = DynamicToken.prepare(name, sql, hasParams ? 1 : 0);
    const fmtBuf = hasParams ? ParamFmtToken.build(params) : Buffer.alloc(0);

    const payload = Buffer.concat([dynBuf, fmtBuf]);
    await conn._send(PduType.BUF_LANG, payload);
    await conn._collectResult();

    return stmt;
  }

  // -------------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------------

  async execute(values: JsValue[]): Promise<QueryResult> {
    if (this._closed) throw new Error('PreparedStatement bereits geschlossen');

    const hasParams = values.length > 0;

    const dynBuf = DynamicToken.execute(this._name, hasParams);

    let payload: Buffer;
    if (hasParams) {
      const markerBuf = ParamsToken.buildMarker();
      const paramBytes = Buffer.concat(
        this._params.map((df, i) => this._conn._mapper.encodeParam(df, values[i])),
      );
      payload = Buffer.concat([dynBuf, markerBuf, paramBytes]);
    } else {
      payload = dynBuf;
    }

    await this._conn._send(PduType.BUF_LANG, payload);
    return this._conn._collectResult();
  }

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (this._closed) return;

    const deallocBuf = DynamicToken.deallocate(this._name);
    await this._conn._send(PduType.BUF_LANG, deallocBuf);
    await this._conn._collectResult();

    this._closed = true;
  }
}
