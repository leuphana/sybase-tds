/**
 * Binary reader for TDS 5.0 response packets.
 *
 * Reads values from a Node.js Buffer at an internal position marker.
 * The byteswap flag controls endianness for byteswap-aware methods
 * (readUInt16, readUInt32, readInt32, readBigUInt64) – mirroring TdsWriter.
 *
 * Methods with an explicit BE suffix always read big-endian and ignore
 * the byteswap flag.
 */
export class TdsReader {
  private _pos = 0;
  private readonly _byteswap: boolean;

  constructor(
    private readonly _buf: Buffer,
    byteswap = false,
  ) {
    this._byteswap = byteswap;
  }

  // -------------------------------------------------------------------------
  // Single byte
  // -------------------------------------------------------------------------

  readUInt8(): number {
    const val = this._buf.readUInt8(this._pos);
    this._pos += 1;
    return val;
  }

  readInt8(): number {
    const val = this._buf.readInt8(this._pos);
    this._pos += 1;
    return val;
  }

  // -------------------------------------------------------------------------
  // 2-byte values
  // -------------------------------------------------------------------------

  /** Always big-endian */
  readUInt16BE(): number {
    const val = this._buf.readUInt16BE(this._pos);
    this._pos += 2;
    return val;
  }

  /** Always big-endian */
  readInt16BE(): number {
    const val = this._buf.readInt16BE(this._pos);
    this._pos += 2;
    return val;
  }

  /** Endianness follows the byteswap flag */
  readUInt16(): number {
    const val = this._byteswap
      ? this._buf.readUInt16LE(this._pos)
      : this._buf.readUInt16BE(this._pos);
    this._pos += 2;
    return val;
  }

  // -------------------------------------------------------------------------
  // 4-byte values
  // -------------------------------------------------------------------------

  /** Always big-endian */
  readUInt32BE(): number {
    const val = this._buf.readUInt32BE(this._pos);
    this._pos += 4;
    return val;
  }

  /** Always big-endian */
  readInt32BE(): number {
    const val = this._buf.readInt32BE(this._pos);
    this._pos += 4;
    return val;
  }

  /** Endianness follows the byteswap flag */
  readUInt32(): number {
    const val = this._byteswap
      ? this._buf.readUInt32LE(this._pos)
      : this._buf.readUInt32BE(this._pos);
    this._pos += 4;
    return val;
  }

  /** Endianness follows the byteswap flag */
  readInt32(): number {
    const val = this._byteswap
      ? this._buf.readInt32LE(this._pos)
      : this._buf.readInt32BE(this._pos);
    this._pos += 4;
    return val;
  }

  // -------------------------------------------------------------------------
  // 8-byte values
  // -------------------------------------------------------------------------

  /** Endianness follows the byteswap flag */
  readBigUInt64(): bigint {
    const val = this._byteswap
      ? this._buf.readBigUInt64LE(this._pos)
      : this._buf.readBigUInt64BE(this._pos);
    this._pos += 8;
    return val;
  }

  // -------------------------------------------------------------------------
  // Raw bytes / strings
  // -------------------------------------------------------------------------

  /** Returns a copy of the next `length` bytes */
  readBytes(length: number): Buffer {
    const slice = this._buf.slice(this._pos, this._pos + length);
    this._pos += length;
    return Buffer.from(slice);
  }

  /** Decodes the next `length` bytes as a string */
  readString(length: number, encoding: BufferEncoding = 'latin1'): string {
    return this.readBytes(length).toString(encoding);
  }

  /**
   * TDS readStringLen format: reads maxLen+1 bytes.
   * The last byte is the actual string length.
   * Returns only the active portion (without padding) as a string.
   */
  readStringLen(maxLen: number, encoding: BufferEncoding = 'latin1'): string {
    const strBytes = this.readBytes(maxLen);
    const actualLen = this.readUInt8();
    return strBytes.slice(0, actualLen).toString(encoding);
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  /** Reads one byte at position (offset + currentOffset) without advancing */
  peek(offset = 0): number {
    return this._buf.readUInt8(this._pos + offset);
  }

  /** Current read offset */
  get offset(): number {
    return this._pos;
  }

  /** Remaining bytes in the buffer */
  get remaining(): number {
    return this._buf.length - this._pos;
  }

  /** Access to the underlying buffer */
  get buffer(): Buffer {
    return this._buf;
  }
}
