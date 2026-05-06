/**
 * MockSocket – injectable fake socket for unit tests.
 * Implements the RawSocket interface from TdsSocket.
 *
 * How it works:
 *   1. Test queues response packets with queueResponse()
 *   2. MockSocket.write() sends simulated data and emits
 *      the next queued packet synchronously as a response
 */

import { RawSocket } from '../../src/protocol/tds-socket';
import { TdsWriter }  from '../../src/protocol/tds-writer';
import { TokenType, LoginAckStatus, DoneStatus } from '../../src/constants/tds-const';

// ---------------------------------------------------------------------------
// MockSocket
// ---------------------------------------------------------------------------

export class MockSocket implements RawSocket {
  readonly written: Buffer[] = [];

  private _dataListeners:  ((chunk: Buffer) => void)[]              = [];
  private _errorListeners: ((err: Error) => void)[]                 = [];
  private _closeListeners: ((hadError: boolean) => void)[]          = [];
  private _responseQueue:  Buffer[][]                               = [];

  write(data: Buffer, callback?: (err?: Error | null) => void): boolean {
    this.written.push(Buffer.from(data));
    callback?.(null);
    // Auto-emit queued response synchronously (still runs before next await)
    const resp = this._responseQueue.shift();
    if (resp) for (const chunk of resp) this._emit('data', chunk);
    return true;
  }

  end(): this  { return this; }
  destroy(_err?: Error): void {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string,  listener: (...args: any[]) => void): this {
    if (event === 'data')  this._dataListeners.push(listener as (c: Buffer) => void);
    if (event === 'error') this._errorListeners.push(listener as (e: Error) => void);
    if (event === 'close') this._closeListeners.push(listener as (h: boolean) => void);
    return this;
  }

  /**
   * Enqueues a TDS response packet.
   * body = raw token bytes (without TDS packet header).
   * The packet is automatically emitted on the next write().
   */
  queueResponse(body: Buffer): void {
    const totalLen = 8 + body.length;
    const pkt      = Buffer.alloc(totalLen);
    pkt[0] = 0x04;  // server response PDU type
    pkt[1] = 0x01;  // EOM
    pkt.writeUInt16BE(totalLen, 2);
    pkt.writeUInt16BE(0, 4);
    pkt[6] = 1;
    pkt[7] = 0;
    body.copy(pkt, 8);
    this._responseQueue.push([pkt]);
  }

  private _emit(event: 'data' | 'error' | 'close', ...args: unknown[]): void {
    if (event === 'data')  this._dataListeners.forEach(l  => l(args[0] as Buffer));
    if (event === 'error') this._errorListeners.forEach(l => l(args[0] as Error));
    if (event === 'close') this._closeListeners.forEach(l => l(args[0] as boolean));
  }
}

// ---------------------------------------------------------------------------
// Token helper functions – build raw token buffers (without TDS packet header)
// ---------------------------------------------------------------------------

export function loginAckBuf(status = LoginAckStatus.SUCCEED): Buffer {
  const name    = Buffer.from('ASE');
  const bodyLen = 1 + 4 + 1 + name.length + 4;
  const w = new TdsWriter();
  w.writeUInt8(TokenType.LOGINACK);
  w.writeUInt16BE(bodyLen);
  w.writeUInt8(status);
  w.writeBytes(Buffer.from([0x05, 0x00, 0x00, 0x00])); // tdsVersion
  w.writeUInt8(name.length);
  w.writeBytes(name);
  w.writeBytes(Buffer.from([0x0F, 0x00, 0x00, 0x00])); // progVersion
  return w.toBuffer();
}

export function doneBuf(status = 0, rowCount = 0): Buffer {
  const w = new TdsWriter();
  w.writeUInt8(TokenType.DONE);
  w.writeUInt16BE(status);
  w.writeUInt16BE(0);
  w.writeUInt32BE(rowCount);
  return w.toBuffer();
}

export function eedBuf(errorNumber = 208, message = 'Fehler', severity = 16): Buffer {
  const msg = Buffer.from(message, 'utf8');
  const srv = Buffer.from('srv', 'ascii');
  const bodyLen = 4 + 1 + 1 + 1 + 0 + 1 + 2 + 2 + msg.length + 1 + srv.length + 1 + 0 + 2;
  const w = new TdsWriter();
  w.writeUInt8(TokenType.EED);
  w.writeUInt16BE(bodyLen);
  w.writeUInt32BE(errorNumber);
  w.writeUInt8(1);          // state
  w.writeUInt8(severity);   // severity
  w.writeUInt8(0);          // sqlStateLen
  w.writeUInt8(0x00);       // status
  w.writeUInt16BE(0);       // tranState
  w.writeUInt16BE(msg.length);
  w.writeBytes(msg);
  w.writeUInt8(srv.length);
  w.writeBytes(srv);
  w.writeUInt8(0);          // procNameLen
  w.writeUInt16BE(1);       // lineNumber
  return w.toBuffer();
}

/** ROWFMT + ROW (INT4=intVal, VARCHAR=strVal) + DONE */
export function queryResponseBuf(intVal: number, strVal: string, rowCount = 1): Buffer {
  const str = Buffer.from(strVal, 'utf8');

  // ROWFMT: 2 columns – INT4 (fixed) + VARCHAR (variable)
  // DataFormat block for INT4: [nameLen=0][status=0][userType=0(4B)][dataType=0x38][localeLen=0]
  const col1 = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x38, 0x00]);
  // DataFormat block for VARCHAR: [0][0][0,0,0,0][0x27][50 maxLen][0]
  const col2 = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x27, 50, 0x00]);

  const rowFmtBody = Buffer.concat([
    Buffer.from([0x00, 0x02]), // colCount = 2
    col1,
    col2,
  ]);
  const rowFmtHeader = Buffer.alloc(3);
  rowFmtHeader[0] = TokenType.ROWFMT;
  rowFmtHeader.writeUInt16BE(rowFmtBody.length, 1);
  const rowFmt = Buffer.concat([rowFmtHeader, rowFmtBody]);

  // ROW token
  const intBuf = Buffer.alloc(4);
  intBuf.writeInt32LE(intVal, 0);
  const row = Buffer.concat([
    Buffer.from([TokenType.ROW]),
    intBuf,
    Buffer.from([str.length]),
    str,
  ]);

  return Buffer.concat([rowFmt, row, doneBuf(DoneStatus.COUNT, rowCount)]);
}

/** DONE only (no result – e.g. INSERT, BEGIN TRANSACTION, DYNAMIC ACK) */
export function doneOnlyBuf(rowCount = 0): Buffer {
  return doneBuf(0, rowCount);
}
