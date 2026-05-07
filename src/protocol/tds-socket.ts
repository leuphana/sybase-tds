import * as net from 'net';
import { PduType, DEFAULT_PACKET_SIZE } from '../constants/tds-const';
import { TdsPacket } from './tds-packet';

const DEBUG = process.env['TDS_DEBUG'] === '1';

function hexDump(label: string, buf: Buffer): void {
  const lines: string[] = [`\n=== ${label} (${buf.length} bytes) ===`];
  for (let i = 0; i < buf.length; i += 16) {
    const slice  = buf.slice(i, i + 16);
    const hex    = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii  = Array.from(slice).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
    lines.push(`  ${i.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  console.error(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Complete TDS message (possibly assembled from multiple packets) */
export interface TdsMessage {
  pduType: PduType;
  data: Buffer;
}

/**
 * Minimal socket interface for dependency injection in tests.
 * net.Socket satisfies this interface implicitly.
 */
export interface RawSocket {
  write(data: Buffer, callback?: (err?: Error | null) => void): boolean;
  end(): this;
  destroy(err?: Error): void;
  on(event: 'data',  listener: (chunk: Buffer) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: (hadError: boolean) => void): this;
  on(event: string,  listener: (...args: unknown[]) => void): this;
}

// ---------------------------------------------------------------------------
// TdsSocket
// ---------------------------------------------------------------------------

/**
 * Manages the TDS packet layer over a TCP socket.
 *
 * Responsibilities:
 *  - Splitting large messages into TDS packets when sending
 *  - Buffering and assembling incoming packets into complete messages
 *  - Promise-based send/receive API
 *
 * For tests a RawSocket is injected; for production
 * TdsSocket.connect() is used as a factory method.
 */
export class TdsSocket {
  /** Maximum packet size including 8-byte header; adjustable after ENVCHANGE */
  packetSize: number;

  private _inBuffer: Buffer = Buffer.alloc(0);
  private _assemblyParts: Buffer[] = [];
  private _assemblyType: PduType | null = null;

  /** Already assembled messages for which no receive() is waiting yet */
  private _pendingMessages: TdsMessage[] = [];

  /** Pending receive() promises */
  private _waiters: Array<{
    resolve: (msg: TdsMessage) => void;
    reject: (err: Error) => void;
  }> = [];

  private _lastError: Error | null = null;
  private _closed = false;

  constructor(
    private readonly _socket: RawSocket,
    options?: { packetSize?: number },
  ) {
    this.packetSize = options?.packetSize ?? DEFAULT_PACKET_SIZE;
    this._socket.on('data',  (chunk) => this._onData(chunk));
    this._socket.on('error', (err)   => this._onError(err));
    this._socket.on('close', ()      => this._onClose());
  }

  // -------------------------------------------------------------------------
  // Factory: real TCP connection
  // -------------------------------------------------------------------------

  static connect(
    host: string,
    port: number,
    options?: { packetSize?: number },
  ): Promise<TdsSocket> {
    return new Promise((resolve, reject) => {
      const raw = new net.Socket();
      const tds = new TdsSocket(raw, options);
      raw.once('connect', () => resolve(tds));
      raw.once('error', reject);
      raw.connect(port, host);
    });
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /**
   * Sends `data` as one or more TDS packets of type `pduType`.
   * Large messages are split according to `packetSize`.
   */
  async send(pduType: PduType, data: Buffer): Promise<void> {
    const maxBody = this.packetSize - TdsPacket.HEADER_SIZE;
    let offset = 0;
    let seqNum = 0;

    do {
      const end    = Math.min(offset + maxBody, data.length);
      const body   = data.slice(offset, end);
      const isLast = end >= data.length;
      const packet = new TdsPacket(pduType, body, seqNum, isLast);

      const raw = packet.toBuffer();
      if (DEBUG) hexDump(`TX packet seq=${seqNum} pdu=0x${pduType.toString(16)} eom=${isLast}`, raw);
      await this._writeRaw(raw);

      offset = end;
      seqNum++;
    } while (offset < data.length);
  }

  // -------------------------------------------------------------------------
  // Receiving
  // -------------------------------------------------------------------------

  /**
   * Returns the next complete TDS message.
   * Blocks (as a Promise) until a message is available.
   */
  receive(): Promise<TdsMessage> {
    if (this._closed && this._pendingMessages.length === 0) {
      return Promise.reject(
        this._lastError ?? new Error('Socket geschlossen'),
      );
    }

    const pending = this._pendingMessages.shift();
    if (pending) return Promise.resolve(pending);

    return new Promise((resolve, reject) => {
      this._waiters.push({ resolve, reject });
    });
  }

  // -------------------------------------------------------------------------
  // Connection close
  // -------------------------------------------------------------------------

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._socket.end();
      resolve();
    });
  }

  // -------------------------------------------------------------------------
  // Internal processing of incoming bytes
  // -------------------------------------------------------------------------

  private _onData(chunk: Buffer): void {
    this._inBuffer = Buffer.concat([this._inBuffer, chunk]);
    this._processBuffer();
  }

  private _processBuffer(): void {
    while (this._inBuffer.length >= TdsPacket.HEADER_SIZE) {
      const totalLen = this._inBuffer.readUInt16BE(2);

      // Not enough bytes for this packet yet – wait
      if (this._inBuffer.length < totalLen) break;

      const pduType = this._inBuffer[0] as PduType;
      const status  = this._inBuffer[1];
      const isLast  = (status & 0x01) !== 0;
      const body    = Buffer.from(
        this._inBuffer.slice(TdsPacket.HEADER_SIZE, totalLen),
      );

      this._inBuffer = this._inBuffer.slice(totalLen);

      if (isLast) {
        let fullData: Buffer;

        if (this._assemblyParts.length > 0) {
          this._assemblyParts.push(body);
          fullData = Buffer.concat(this._assemblyParts);
          this._assemblyParts = [];
          this._assemblyType  = null;
        } else {
          fullData = body;
        }

        this._deliver({ pduType, data: fullData });
      } else {
        if (this._assemblyParts.length === 0) {
          this._assemblyType = pduType;
        }
        this._assemblyParts.push(body);
      }
    }
  }

  private _deliver(msg: TdsMessage): void {
    if (DEBUG) hexDump(`RX message pdu=0x${msg.pduType.toString(16)}`, msg.data);
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter.resolve(msg);
    } else {
      this._pendingMessages.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // Socket events
  // -------------------------------------------------------------------------

  private _onError(err: Error): void {
    this._lastError = err;
    this._drainWaiters(err);
  }

  private _onClose(): void {
    this._closed = true;
    const err = this._lastError ?? new Error('Socket unerwartet geschlossen');
    this._drainWaiters(err);
  }

  private _drainWaiters(err: Error): void {
    const waiters = this._waiters.splice(0);
    for (const w of waiters) {
      w.reject(err);
    }
  }

  // -------------------------------------------------------------------------
  // Raw write
  // -------------------------------------------------------------------------

  private _writeRaw(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
