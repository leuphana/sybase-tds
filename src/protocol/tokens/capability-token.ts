import { TokenType } from '../../constants/tds-const';
import { TdsWriter } from '../tds-writer';

// Standard mask lengths for TDS >= 7.0 (corresponding to Sybase TDS 5.0)
const REQ_MASK_LEN = 14;
const RES_MASK_LEN = 10;

/**
 * Builds the CAPABILITY token (0xE2) with request and response capability masks.
 *
 * Bit encoding (from TDS_RESTLICHE_TOKENS.md):
 *   Bit n → byte index = (maskLen - 1) - floor(n / 8)
 *            bit position = n % 8
 *
 * Default capabilities are set in the constructor.
 */
export class CapabilityToken {
  private readonly _reqMask: Buffer;
  private readonly _resMask: Buffer;

  constructor() {
    this._reqMask = Buffer.alloc(REQ_MASK_LEN);
    this._resMask = Buffer.alloc(RES_MASK_LEN);
    this._setDefaults();
  }

  // -------------------------------------------------------------------------
  // Request capabilities
  // -------------------------------------------------------------------------

  setReqBit(bit: number): this {
    this._setBit(this._reqMask, bit);
    return this;
  }

  clearReqBit(bit: number): this {
    this._clearBit(this._reqMask, bit);
    return this;
  }

  hasReqBit(bit: number): boolean {
    return this._hasBit(this._reqMask, bit);
  }

  // -------------------------------------------------------------------------
  // Response capabilities
  // -------------------------------------------------------------------------

  setResBit(bit: number): this {
    this._setBit(this._resMask, bit);
    return this;
  }

  clearResBit(bit: number): this {
    this._clearBit(this._resMask, bit);
    return this;
  }

  hasResBit(bit: number): boolean {
    return this._hasBit(this._resMask, bit);
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  /**
   * Returns the complete CAPABILITY token buffer.
   *
   * Byte layout:
   *   [0xE2][totalLen(2)][0x01][reqMaskLen(1)][reqMask(14)][0x02][resMaskLen(1)][resMask(10)]
   */
  build(): Buffer {
    const totalLen = REQ_MASK_LEN + RES_MASK_LEN + 4; // 2×(type+len) = 4

    const w = new TdsWriter();
    w.writeUInt8(TokenType.CAPABILITY);
    w.writeUInt16BE(totalLen);

    // Request capability block
    w.writeUInt8(0x01);
    w.writeUInt8(REQ_MASK_LEN);
    w.writeBytes(this._reqMask);

    // Response capability block
    w.writeUInt8(0x02);
    w.writeUInt8(RES_MASK_LEN);
    w.writeBytes(this._resMask);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // Default capabilities
  // -------------------------------------------------------------------------

  private _setDefaults(): void {
    // Request capabilities (client announces what it supports)
    this.setReqBit(1);   // REQ_LANG       – LANGUAGE token
    this.setReqBit(2);   // REQ_RPC        – RPC execution
    this.setReqBit(5);   // REQ_BCP        – Bulk Copy
    this.setReqBit(6);   // REQ_CURSOR     – server cursor
    this.setReqBit(7);   // REQ_DYNF       – prepared statements
    this.setReqBit(8);   // REQ_MSG        – MSG token
    this.setReqBit(47);  // PROTO_DYNAMIC  – DYNAMIC protocol
    this.setReqBit(51);  // DATA_INT8      – 64-bit integer
    this.setReqBit(79);  // REQ_SRVPKTSIZE – negotiate server packet size
    this.setReqBit(80);  // DATA_UNITEXT   – Unicode text

    // Response capabilities (client rejects what it does not want)
    this.setResBit(27);  // CON_NOOOB      – no out-of-band
    this.setResBit(30);  // PROTO_NOBULK   – no bulk protocol
  }

  // -------------------------------------------------------------------------
  // Bit manipulation
  // -------------------------------------------------------------------------

  private _byteIdx(mask: Buffer, bit: number): number {
    return (mask.length - 1) - Math.floor(bit / 8);
  }

  private _setBit(mask: Buffer, bit: number): void {
    const idx = this._byteIdx(mask, bit);
    if (idx >= 0 && idx < mask.length) {
      mask[idx] |= (1 << (bit % 8));
    }
  }

  private _clearBit(mask: Buffer, bit: number): void {
    const idx = this._byteIdx(mask, bit);
    if (idx >= 0 && idx < mask.length) {
      mask[idx] &= ~(1 << (bit % 8));
    }
  }

  private _hasBit(mask: Buffer, bit: number): boolean {
    const idx = this._byteIdx(mask, bit);
    if (idx < 0 || idx >= mask.length) return false;
    return (mask[idx] & (1 << (bit % 8))) !== 0;
  }
}
