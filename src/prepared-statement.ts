import { PduType } from './constants/tds-const';
import { DynamicToken } from './protocol/tokens/dynamic-token';
import { ParamFmtToken } from './protocol/tokens/param-fmt-token';
import { ParamsToken } from './protocol/tokens/params-token';
import { DataFormat } from './types/data-format';
import { JsValue, inferFormat } from './types/type-mapper';
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
    const proc      = 'create proc ' + name + ' as ' + sql;

    const dynBuf = DynamicToken.prepare(name, proc, hasParams ? 1 : 0, conn.encoding);
    const fmtBuf = hasParams ? ParamFmtToken.build(params) : Buffer.alloc(0);

    await conn._request(PduType.BUF_NORMAL, Buffer.concat([dynBuf, fmtBuf]));
    return stmt;
  }

  // -------------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------------

  async execute(values: JsValue[] = []): Promise<QueryResult> {
    if (this._closed) throw new Error('PreparedStatement bereits geschlossen');

    if (this._params.length > 0 && values.length !== this._params.length) {
      throw new Error(
        `PreparedStatement erwartet ${this._params.length} Parameter, erhalten: ${values.length}`,
      );
    }

    const hasParams = values.length > 0;
    const dynBuf    = DynamicToken.execute(this._name, hasParams, this._conn.encoding);

    let payload: Buffer;
    if (hasParams) {
      // Use user-supplied DataFormats if available, otherwise infer from values.
      const params = this._params.length > 0
        ? this._params
        : values.map(v => inferFormat(v, this._conn.encoding));

      payload = Buffer.concat([
        dynBuf,
        ParamFmtToken.build(params),
        ParamsToken.buildMarker(),
        ...params.map((df, i) => this._conn._mapper.encodeParam(df, values[i])),
      ]);
    } else {
      payload = dynBuf;
    }

    return this._conn._request(PduType.BUF_NORMAL, payload);
  }

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    await this._conn._request(PduType.BUF_NORMAL, DynamicToken.deallocate(this._name, this._conn.encoding));
  }
}
