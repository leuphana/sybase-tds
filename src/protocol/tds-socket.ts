import * as net from 'net';
import * as tls from 'tls';
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

export interface TdsSocketConnectOptions {
  packetSize?: number;
  /** Abort the TCP/TLS handshake after this many ms (0 = no limit). Default 15000. */
  connectTimeout?: number;
  /** Enable TCP keep-alive (detects dead peers). Default true. */
  keepAlive?: boolean;
  /** Wrap the connection in TLS. `true` = default options with SNI = host. */
  tls?: boolean | tls.ConnectionOptions;
}

/** Thrown when a connect or receive deadline is exceeded. */
export class TdsTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TdsTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
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

  /** Received but not yet framed bytes (kept as chunk list to avoid O(n²) concat). */
  private _chunks: Buffer[] = [];
  private _chunksLen = 0;
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
  private _closeListeners: Array<(err: Error) => void> = [];

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
    options: TdsSocketConnectOptions = {},
  ): Promise<TdsSocket> {
    const timeoutMs = options.connectTimeout ?? 15_000;
    const keepAlive = options.keepAlive ?? true;

    return new Promise((resolve, reject) => {
      let raw: net.Socket;
      const readyEvent = options.tls ? 'secureConnect' : 'connect';

      if (options.tls) {
        const tlsOpts: tls.ConnectionOptions = options.tls === true ? {} : options.tls;
        raw = tls.connect({ servername: net.isIP(host) ? undefined : host, ...tlsOpts, host, port });
      } else {
        raw = net.connect({ host, port });
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = (err: Error) => {
        if (timer) clearTimeout(timer);
        raw.destroy();
        reject(err);
      };
      raw.once('error', fail);

      if (timeoutMs > 0) {
        timer = setTimeout(
          () => fail(new TdsTimeoutError(`Verbindungsaufbau zu ${host}:${port} nach ${timeoutMs} ms abgebrochen`)),
          timeoutMs,
        );
      }

      raw.once(readyEvent, () => {
        if (timer) clearTimeout(timer);
        raw.removeListener('error', fail);
        raw.setNoDelay(true);
        if (keepAlive) raw.setKeepAlive(true, 30_000);
        resolve(new TdsSocket(raw, options));
      });
    });
  }

  /** True once the underlying socket has been closed or has failed. */
  get closed(): boolean {
    return this._closed;
  }

  /** Registers a callback that fires once when the socket closes or fails. */
  onClose(listener: (err: Error) => void): void {
    this._closeListeners.push(listener);
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
  receive(timeoutMs = 0): Promise<TdsMessage> {
    const pending = this._pendingMessages.shift();
    if (pending) return Promise.resolve(pending);

    if (this._closed) {
      return Promise.reject(this._lastError ?? new Error('Socket geschlossen'));
    }

    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter = {
        resolve: (msg: TdsMessage) => { if (timer) clearTimeout(timer); resolve(msg); },
        reject:  (err: Error)      => { if (timer) clearTimeout(timer); reject(err); },
      };
      this._waiters.push(waiter);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = this._waiters.indexOf(waiter);
          if (idx !== -1) this._waiters.splice(idx, 1);
          reject(new TdsTimeoutError(`Keine Serverantwort innerhalb von ${timeoutMs} ms`));
        }, timeoutMs);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Connection close
  // -------------------------------------------------------------------------

  close(): Promise<void> {
    if (!this._closed) this._socket.end();
    return Promise.resolve();
  }

  /** Hard-closes the socket and fails all pending receive() calls. */
  destroy(err: Error = new Error('Socket zerstört')): void {
    if (!this._lastError) this._lastError = err;
    this._socket.destroy();
    this._onClose();
  }

  // -------------------------------------------------------------------------
  // Internal processing of incoming bytes
  // -------------------------------------------------------------------------

  private _onData(chunk: Buffer): void {
    this._chunks.push(chunk);
    this._chunksLen += chunk.length;
    try {
      this._processBuffer();
    } catch (err) {
      this.destroy(err as Error);
    }
  }

  /** Ensures the first chunk holds at least `n` bytes (merges at most one packet's worth). */
  private _coalesce(n: number): Buffer {
    if (this._chunks[0].length < n) {
      const merged = Buffer.concat(this._chunks, this._chunksLen);
      this._chunks = [merged];
    }
    return this._chunks[0];
  }

  private _consume(n: number): Buffer {
    const head = this._coalesce(n);
    const out  = Buffer.from(head.subarray(0, n)); // copy – detach from socket buffer
    if (head.length === n) this._chunks.shift();
    else this._chunks[0] = head.subarray(n);
    this._chunksLen -= n;
    return out;
  }

  private _processBuffer(): void {
    while (this._chunksLen >= TdsPacket.HEADER_SIZE) {
      const header   = this._coalesce(TdsPacket.HEADER_SIZE);
      const totalLen = header.readUInt16BE(2);
      if (totalLen < TdsPacket.HEADER_SIZE) {
        throw new Error(`Ungültige TDS-Paketlänge ${totalLen}`);
      }

      // Not enough bytes for this packet yet – wait
      if (this._chunksLen < totalLen) break;

      const packet  = this._consume(totalLen);
      const pduType = packet[0] as PduType;
      const isLast  = (packet[1] & 0x01) !== 0;
      const body    = packet.subarray(TdsPacket.HEADER_SIZE);

      if (isLast) {
        let fullData: Buffer;
        const msgType = this._assemblyType ?? pduType;

        if (this._assemblyParts.length > 0) {
          this._assemblyParts.push(body);
          fullData = Buffer.concat(this._assemblyParts);
          this._assemblyParts = [];
          this._assemblyType  = null;
        } else {
          fullData = body;
        }

        this._deliver({ pduType: msgType, data: fullData });
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
    if (this._closed) return;
    this._closed = true;
    const err = this._lastError ?? new Error('Socket unerwartet geschlossen');
    this._drainWaiters(err);
    for (const l of this._closeListeners.splice(0)) l(err);
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
