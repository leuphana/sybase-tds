/**
 * Binary writer for TDS 5.0 packets.
 *
 * Accumulates bytes in an internal chunk array and returns a concatenated
 * buffer at the end. The byteswap flag controls whether byteswap-aware
 * methods (writeUInt16, writeUInt32, writeInt32, writeBigUInt64) write in
 * little-endian; without the flag, big-endian is used (TDS default).
 *
 * Methods with an explicit BE suffix always write big-endian and ignore
 * the byteswap flag – they are used for protocol header fields.
 */
export class TdsWriter {
  private readonly _chunks: Buffer[] = [];
  private readonly _byteswap: boolean;

  constructor(byteswap = false) {
    this._byteswap = byteswap;
  }

  // -------------------------------------------------------------------------
  // Single byte
  // -------------------------------------------------------------------------

  writeUInt8(value: number): this {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value, 0);
    this._chunks.push(buf);
    return this;
  }

  writeInt8(value: number): this {
    const buf = Buffer.alloc(1);
    buf.writeInt8(value, 0);
    this._chunks.push(buf);
    return this;
  }

  // -------------------------------------------------------------------------
  // 2-byte values
  // -------------------------------------------------------------------------

  /** Always big-endian – for protocol header fields (token lengths, etc.) */
  writeUInt16BE(value: number): this {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(value, 0);
    this._chunks.push(buf);
    return this;
  }

  /** Always big-endian */
  writeInt16BE(value: number): this {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(value, 0);
    this._chunks.push(buf);
    return this;
  }

  /** Endianness follows the byteswap flag (for data values) */
  writeUInt16(value: number): this {
    const buf = Buffer.alloc(2);
    if (this._byteswap) {
      buf.writeUInt16LE(value, 0);
    } else {
      buf.writeUInt16BE(value, 0);
    }
    this._chunks.push(buf);
    return this;
  }

  // -------------------------------------------------------------------------
  // 4-byte values
  // -------------------------------------------------------------------------

  /** Always big-endian – for protocol header fields */
  writeUInt32BE(value: number): this {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    this._chunks.push(buf);
    return this;
  }

  /** Always big-endian */
  writeInt32BE(value: number): this {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value, 0);
    this._chunks.push(buf);
    return this;
  }

  /** Endianness follows the byteswap flag */
  writeUInt32(value: number): this {
    const buf = Buffer.alloc(4);
    if (this._byteswap) {
      buf.writeUInt32LE(value, 0);
    } else {
      buf.writeUInt32BE(value, 0);
    }
    this._chunks.push(buf);
    return this;
  }

  /** Endianness follows the byteswap flag */
  writeInt32(value: number): this {
    const buf = Buffer.alloc(4);
    if (this._byteswap) {
      buf.writeInt32LE(value, 0);
    } else {
      buf.writeInt32BE(value, 0);
    }
    this._chunks.push(buf);
    return this;
  }

  // -------------------------------------------------------------------------
  // 8-byte values
  // -------------------------------------------------------------------------

  /** Endianness follows the byteswap flag */
  writeBigUInt64(value: bigint): this {
    const buf = Buffer.alloc(8);
    if (this._byteswap) {
      buf.writeBigUInt64LE(value, 0);
    } else {
      buf.writeBigUInt64BE(value, 0);
    }
    this._chunks.push(buf);
    return this;
  }

  // -------------------------------------------------------------------------
  // Raw bytes / strings
  // -------------------------------------------------------------------------

  /** Copies the buffer (isolated from external mutations) */
  writeBytes(data: Buffer): this {
    this._chunks.push(Buffer.from(data));
    return this;
  }

  /** Writes n null bytes */
  writeZeros(count: number): this {
    if (count > 0) {
      this._chunks.push(Buffer.alloc(count));
    }
    return this;
  }

  /** Encodes the string and appends the bytes */
  writeString(str: string, encoding: BufferEncoding = 'latin1'): this {
    if (str.length > 0) {
      this._chunks.push(Buffer.from(str, encoding));
    }
    return this;
  }

  /**
   * TDS writeStringLen format: writes exactly maxLen + 1 bytes.
   *
   *   [String bytes (0..actualLen)][Null padding (actualLen..maxLen)][1 byte: actualLen]
   *
   * String is truncated to maxLen bytes if too long.
   */
  writeStringLen(
    str: string,
    maxLen: number,
    encoding: BufferEncoding = 'latin1',
  ): this {
    const strBytes = Buffer.from(str, encoding);
    const actualLen = Math.min(strBytes.length, maxLen);

    if (actualLen > 0) {
      this._chunks.push(strBytes.slice(0, actualLen));
    }
    if (actualLen < maxLen) {
      this._chunks.push(Buffer.alloc(maxLen - actualLen));
    }

    const lenBuf = Buffer.alloc(1);
    lenBuf[0] = actualLen;
    this._chunks.push(lenBuf);

    return this;
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  get byteLength(): number {
    return this._chunks.reduce((sum, buf) => sum + buf.length, 0);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this._chunks);
  }
}
