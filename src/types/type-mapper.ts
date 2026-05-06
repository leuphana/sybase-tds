import { DataType } from '../constants/tds-const';
import { DataFormat } from './data-format';

export type JsValue = null | number | bigint | boolean | string | Buffer | Date;

const BASE_DATE_MS = Date.UTC(1900, 0, 1);

export class TypeMapper {
  constructor(private readonly byteswap = false) {}

  decode(df: DataFormat, raw: Buffer | null): JsValue {
    if (raw === null) return null;

    switch (df.dataType) {
      case DataType.INT1:   return raw.readUInt8(0);
      case DataType.BIT:    return raw[0] !== 0;
      case DataType.INT2:   return this.byteswap ? raw.readInt16BE(0)     : raw.readInt16LE(0);
      case DataType.INT4:   return this.byteswap ? raw.readInt32BE(0)     : raw.readInt32LE(0);
      case DataType.INT8:   return this.byteswap ? raw.readBigInt64BE(0)  : raw.readBigInt64LE(0);
      case DataType.UINT2:  return this.byteswap ? raw.readUInt16BE(0)    : raw.readUInt16LE(0);
      case DataType.UINT4:  return this.byteswap ? raw.readUInt32BE(0)    : raw.readUInt32LE(0);
      case DataType.UINT8:  return this.byteswap ? raw.readBigUInt64BE(0) : raw.readBigUInt64LE(0);

      case DataType.INTN:   return this._decodeIntN(raw, true);
      case DataType.UINTN:  return this._decodeIntN(raw, false);

      case DataType.FLT4:   return this.byteswap ? raw.readFloatBE(0)  : raw.readFloatLE(0);
      case DataType.FLT8:   return this.byteswap ? raw.readDoubleBE(0) : raw.readDoubleLE(0);
      case DataType.FLTN:
        return raw.length === 4
          ? (this.byteswap ? raw.readFloatBE(0)  : raw.readFloatLE(0))
          : (this.byteswap ? raw.readDoubleBE(0) : raw.readDoubleLE(0));

      case DataType.DECN:
      case DataType.NUMN:
        return this._decodeDecn(raw, df.scale);

      case DataType.MONEY:      return this._decodeMoney8(raw);
      case DataType.SHORTMONEY: return this._decodeMoney4(raw);
      case DataType.MONEYN:     return raw.length === 4 ? this._decodeMoney4(raw) : this._decodeMoney8(raw);

      case DataType.DATE:
      case DataType.DATEN:
        return this._decodeDate(raw);
      case DataType.TIME:
      case DataType.TIMEN:
        return this._decodeTime(raw);
      case DataType.DATETIME:
        return this._decodeDatetime(raw);
      case DataType.SHORTDATE:
        return this._decodeShortDate(raw);
      case DataType.DATETIMN:
        return raw.length === 8 ? this._decodeDatetime(raw) : this._decodeShortDate(raw);

      case DataType.UNITEXT:
        return raw.toString('utf16le');
      case DataType.VARCHAR:
      case DataType.CHAR:
      case DataType.TEXT:
      case DataType.LONGCHAR:
        return raw.toString('utf8');

      default:
        return raw;
    }
  }

  encodeParam(df: DataFormat, value: JsValue): Buffer {
    return df.isFixedLength()
      ? this._encodeFixed(df, value)
      : this._encodeVariable(df, value);
  }

  // ---------------------------------------------------------------------------
  // decode helpers
  // ---------------------------------------------------------------------------

  private _decodeIntN(raw: Buffer, signed: boolean): number | bigint {
    switch (raw.length) {
      case 1: return raw.readUInt8(0);
      case 2: return signed
        ? (this.byteswap ? raw.readInt16BE(0)  : raw.readInt16LE(0))
        : (this.byteswap ? raw.readUInt16BE(0) : raw.readUInt16LE(0));
      case 4: return signed
        ? (this.byteswap ? raw.readInt32BE(0)  : raw.readInt32LE(0))
        : (this.byteswap ? raw.readUInt32BE(0) : raw.readUInt32LE(0));
      case 8: return signed
        ? (this.byteswap ? raw.readBigInt64BE(0)  : raw.readBigInt64LE(0))
        : (this.byteswap ? raw.readBigUInt64BE(0) : raw.readBigUInt64LE(0));
      default: throw new Error(`Ungültige INTN-Länge: ${raw.length}`);
    }
  }

  private _decodeDecn(raw: Buffer, scale: number): string {
    const negative = raw[0] === 0x01;
    // Magnitude is stored little-endian in raw[1:]
    let mag = 0n;
    for (let i = raw.length - 1; i >= 1; i--) {
      mag = (mag << 8n) | BigInt(raw[i]);
    }
    const str = this._decnToString(mag, scale);
    return negative ? '-' + str : str;
  }

  private _decnToString(unscaled: bigint, scale: number): string {
    const str = unscaled.toString();
    if (scale === 0) return str;
    if (str.length <= scale) return '0.' + str.padStart(scale, '0');
    return str.slice(0, str.length - scale) + '.' + str.slice(str.length - scale);
  }

  private _decodeMoney8(raw: Buffer): string {
    const hi = raw.readInt32LE(0);
    const lo = raw.readUInt32LE(4);
    const cents = (BigInt(hi) << 32n) | BigInt(lo);
    return this._moneyToString(cents);
  }

  private _decodeMoney4(raw: Buffer): string {
    return this._moneyToString(BigInt(raw.readInt32LE(0)));
  }

  private _moneyToString(cents: bigint): string {
    const negative = cents < 0n;
    const abs = negative ? -cents : cents;
    const result = (abs / 10000n).toString() + '.' + (abs % 10000n).toString().padStart(4, '0');
    return negative ? '-' + result : result;
  }

  private _decodeDate(raw: Buffer): Date {
    return new Date(BASE_DATE_MS + raw.readUInt32LE(0) * 86_400_000);
  }

  private _decodeTime(raw: Buffer): Date {
    const ms = Math.round(raw.readUInt32LE(0) / 300 * 1000);
    return new Date(BASE_DATE_MS + ms);
  }

  private _decodeDatetime(raw: Buffer): Date {
    const dayMs  = raw.readInt32LE(0) * 86_400_000;
    const timeMs = Math.round(raw.readUInt32LE(4) / 300 * 1000);
    return new Date(BASE_DATE_MS + dayMs + timeMs);
  }

  private _decodeShortDate(raw: Buffer): Date {
    const dayMs = raw.readUInt16LE(0) * 86_400_000;
    const minMs = raw.readUInt16LE(2) * 60_000;
    return new Date(BASE_DATE_MS + dayMs + minMs);
  }

  // ---------------------------------------------------------------------------
  // encode helpers
  // ---------------------------------------------------------------------------

  private _encodeFixed(df: DataFormat, value: JsValue): Buffer {
    const b = Buffer.alloc(df.fixedByteLen());
    switch (df.dataType) {
      case DataType.INT1:
        b.writeUInt8(Number(value) & 0xFF, 0);
        break;
      case DataType.BIT:
        b.writeUInt8(value ? 1 : 0, 0);
        break;
      case DataType.INT2:
        this.byteswap ? b.writeInt16BE(Number(value), 0) : b.writeInt16LE(Number(value), 0);
        break;
      case DataType.INT4:
        this.byteswap ? b.writeInt32BE(Number(value), 0) : b.writeInt32LE(Number(value), 0);
        break;
      case DataType.INT8: {
        const v = typeof value === 'bigint' ? value : BigInt(value as number);
        this.byteswap ? b.writeBigInt64BE(v, 0) : b.writeBigInt64LE(v, 0);
        break;
      }
      case DataType.UINT2:
        this.byteswap ? b.writeUInt16BE(Number(value), 0) : b.writeUInt16LE(Number(value), 0);
        break;
      case DataType.UINT4:
        this.byteswap ? b.writeUInt32BE(Number(value), 0) : b.writeUInt32LE(Number(value), 0);
        break;
      case DataType.UINT8: {
        const v = typeof value === 'bigint' ? value : BigInt(value as number);
        this.byteswap ? b.writeBigUInt64BE(v, 0) : b.writeBigUInt64LE(v, 0);
        break;
      }
      case DataType.FLT4:
        this.byteswap ? b.writeFloatBE(Number(value), 0) : b.writeFloatLE(Number(value), 0);
        break;
      case DataType.FLT8:
        this.byteswap ? b.writeDoubleBE(Number(value), 0) : b.writeDoubleLE(Number(value), 0);
        break;
      case DataType.SHORTMONEY:
        b.writeInt32LE(Math.round(Number(value) * 10000), 0);
        break;
      case DataType.MONEY: {
        const cents = BigInt(Math.round(Number(value) * 10000));
        b.writeInt32LE(Number(cents >> 32n) | 0, 0);
        b.writeUInt32LE(Number(cents & 0xFFFF_FFFFn) >>> 0, 4);
        break;
      }
      case DataType.DATE: {
        const d = value as Date;
        b.writeUInt32LE(Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000), 0);
        break;
      }
      case DataType.TIME: {
        const d = value as Date;
        const ticks = (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 300;
        b.writeUInt32LE(ticks, 0);
        break;
      }
      case DataType.DATETIME: {
        const d = value as Date;
        const days  = Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000);
        const ms    = d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const ticks = Math.round(ms / 1000 * 300);
        b.writeInt32LE(days, 0);
        b.writeUInt32LE(ticks, 4);
        break;
      }
      case DataType.SHORTDATE: {
        const d = value as Date;
        b.writeUInt16LE(Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000), 0);
        b.writeUInt16LE(d.getUTCHours() * 60 + d.getUTCMinutes(), 2);
        break;
      }
    }
    return b;
  }

  private _encodeVariable(df: DataFormat, value: JsValue): Buffer {
    if (value === null) return Buffer.from([0x00]);

    switch (df.dataType) {
      case DataType.UNITEXT: {
        const bytes = Buffer.from(String(value), 'utf16le');
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
      }
      case DataType.VARCHAR:
      case DataType.CHAR:
      case DataType.TEXT:
      case DataType.LONGCHAR: {
        const bytes = Buffer.from(String(value), 'utf8');
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
      }
      case DataType.BINARY:
      case DataType.VARBINARY:
      case DataType.IMAGE:
      case DataType.LONGBINARY: {
        const bytes = value as Buffer;
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
      }
      case DataType.INTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 1)      b.writeUInt8(Number(value), 0);
        else if (n === 2) this.byteswap ? b.writeInt16BE(Number(value), 0) : b.writeInt16LE(Number(value), 0);
        else if (n === 4) this.byteswap ? b.writeInt32BE(Number(value), 0) : b.writeInt32LE(Number(value), 0);
        else {
          const v = typeof value === 'bigint' ? value : BigInt(value as number);
          this.byteswap ? b.writeBigInt64BE(v, 0) : b.writeBigInt64LE(v, 0);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.UINTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 1)      b.writeUInt8(Number(value), 0);
        else if (n === 2) this.byteswap ? b.writeUInt16BE(Number(value), 0) : b.writeUInt16LE(Number(value), 0);
        else if (n === 4) this.byteswap ? b.writeUInt32BE(Number(value), 0) : b.writeUInt32LE(Number(value), 0);
        else {
          const v = typeof value === 'bigint' ? value : BigInt(value as number);
          this.byteswap ? b.writeBigUInt64BE(v, 0) : b.writeBigUInt64LE(v, 0);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.FLTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 4) this.byteswap ? b.writeFloatBE(Number(value), 0)  : b.writeFloatLE(Number(value), 0);
        else         this.byteswap ? b.writeDoubleBE(Number(value), 0) : b.writeDoubleLE(Number(value), 0);
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.MONEYN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 4) {
          b.writeInt32LE(Math.round(Number(value) * 10000), 0);
        } else {
          const cents = BigInt(Math.round(Number(value) * 10000));
          b.writeInt32LE(Number(cents >> 32n) | 0, 0);
          b.writeUInt32LE(Number(cents & 0xFFFF_FFFFn) >>> 0, 4);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.DECN:
      case DataType.NUMN:
        return this._encodeDecn(df, String(value));
      case DataType.DATETIMN: {
        const n = df.maxLength;
        const d = value as Date;
        const b = Buffer.alloc(n);
        if (n === 4) {
          b.writeUInt16LE(Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000), 0);
          b.writeUInt16LE(d.getUTCHours() * 60 + d.getUTCMinutes(), 2);
        } else {
          const days  = Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000);
          const ms    = d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          const ticks = Math.round(ms / 1000 * 300);
          b.writeInt32LE(days, 0);
          b.writeUInt32LE(ticks, 4);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.DATEN: {
        const d = value as Date;
        const b = Buffer.alloc(4);
        b.writeUInt32LE(Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000), 0);
        return Buffer.concat([Buffer.from([4]), b]);
      }
      case DataType.TIMEN: {
        const d = value as Date;
        const b = Buffer.alloc(4);
        b.writeUInt32LE((d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 300, 0);
        return Buffer.concat([Buffer.from([4]), b]);
      }
      default: {
        const bytes = value instanceof Buffer ? value : Buffer.from(String(value), 'utf8');
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
      }
    }
  }

  private _encodeDecn(df: DataFormat, str: string): Buffer {
    const negative = str.startsWith('-');
    const absStr   = negative ? str.slice(1) : str;
    const dotIndex = absStr.indexOf('.');

    let unscaled: bigint;
    if (dotIndex === -1) {
      unscaled = BigInt(absStr) * (10n ** BigInt(df.scale));
    } else {
      const intPart  = absStr.slice(0, dotIndex);
      const fracPart = absStr.slice(dotIndex + 1).padEnd(df.scale, '0').slice(0, df.scale);
      unscaled = BigInt(intPart || '0') * (10n ** BigInt(df.scale)) + BigInt(fracPart || '0');
    }

    // precision 1-9 → 4 magnitude bytes, 10-18 → 8, 19-27 → 12, 28-38 → 16
    const magBytes = Math.ceil(df.precision / 9) * 4;
    const mag = Buffer.alloc(magBytes);
    let v = unscaled;
    for (let i = 0; i < magBytes && v > 0n; i++) {
      mag[i] = Number(v & 0xFFn);
      v >>= 8n;
    }

    return Buffer.concat([Buffer.from([1 + magBytes, negative ? 0x01 : 0x00]), mag]);
  }
}
