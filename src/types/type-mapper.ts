import { DataType } from '../constants/tds-const';
import { DataFormat } from './data-format';

export type JsValue = null | number | bigint | boolean | string | Buffer | Date;

const BASE_DATE_MS = Date.UTC(1900, 0, 1);

/** Types whose value is prefixed by a 4-byte length (TDS_QUERY_PROTOKOLL.md, Längenfeld-Tabelle). */
const LONG_TYPES = new Set<DataType>([
  DataType.TEXT, DataType.IMAGE, DataType.UNITEXT, DataType.LONGCHAR, DataType.LONGBINARY,
]);

/** Prefixes `bytes` with a 1- or 4-byte (BE) length; rejects values that do not fit. */
function lenPrefixed(bytes: Buffer, long: boolean, df: DataFormat): Buffer {
  if (long) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  }
  const max = Math.min(255, df.maxLength || 255);
  if (bytes.length > max) {
    throw new RangeError(
      `Parameterwert zu lang für ${DataType[df.dataType]}(${max}): ${bytes.length} Bytes – ` +
      `für längere Werte LONGCHAR bzw. LONGBINARY verwenden`,
    );
  }
  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function toDate(value: JsValue): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  throw new TypeError(`Datumswert erwartet, erhalten: ${typeof value}`);
}

function daysSince1900(d: Date): number {
  return Math.floor((d.getTime() - BASE_DATE_MS) / 86_400_000);
}

/** Time of day in 1/300 s ticks (DATETIME / TIME resolution). */
function datetimeTicks(d: Date): number {
  const ms = d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round(ms * 300 / 1000);
}

/**
 * Converts a money value to integer units of 1/10000 without going through
 * floating point when the value is given as a string or bigint.
 */
function toMoneyUnits(value: JsValue): bigint {
  if (typeof value === 'bigint') return value * 10000n;
  const str = typeof value === 'number' ? value.toFixed(4) : String(value).trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(str);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) {
    throw new TypeError(`Ungültiger Geldbetrag: ${str}`);
  }
  const frac  = (m[3] ?? '').padEnd(4, '0');
  let units   = BigInt(m[2] || '0') * 10000n + BigInt(frac.slice(0, 4));
  if (frac.length > 4 && Number(frac[4]) >= 5) units += 1n; // round half up
  return m[1] === '-' ? -units : units;
}

export class TypeMapper {
  /**
   * @param byteswap  Little-endian integers/floats (only for unit tests – the
   *                  Connection always negotiates big-endian, see K5).
   * @param encoding  Character encoding for CHAR/VARCHAR/TEXT/LONGCHAR. Updated by
   *                  the Connection when the server reports its charset (ENVCHANGE).
   */
  constructor(private readonly byteswap = false, public encoding: BufferEncoding = 'utf8') {}

  decode(df: DataFormat, raw: Buffer | null): JsValue {
    if (raw === null) return null;

    switch (df.dataType) {
      case DataType.INT1:   return raw.readUInt8(0);
      case DataType.BIT:    return raw[0] !== 0;
      case DataType.INT2:   return this.byteswap ? raw.readInt16LE(0)     : raw.readInt16BE(0);
      case DataType.INT4:   return this.byteswap ? raw.readInt32LE(0)     : raw.readInt32BE(0);
      case DataType.INT8:   return this.byteswap ? raw.readBigInt64LE(0)  : raw.readBigInt64BE(0);
      case DataType.UINT2:  return this.byteswap ? raw.readUInt16LE(0)    : raw.readUInt16BE(0);
      case DataType.UINT4:  return this.byteswap ? raw.readUInt32LE(0)    : raw.readUInt32BE(0);
      case DataType.UINT8:  return this.byteswap ? raw.readBigUInt64LE(0) : raw.readBigUInt64BE(0);

      case DataType.INTN:   return this._decodeIntN(raw, true);
      case DataType.UINTN:  return this._decodeIntN(raw, false);

      case DataType.FLT4:   return this.byteswap ? raw.readFloatLE(0)  : raw.readFloatBE(0);
      case DataType.FLT8:   return this.byteswap ? raw.readDoubleLE(0) : raw.readDoubleBE(0);
      case DataType.FLTN:
        return raw.length === 4
          ? (this.byteswap ? raw.readFloatLE(0)  : raw.readFloatBE(0))
          : (this.byteswap ? raw.readDoubleLE(0) : raw.readDoubleBE(0));

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
        return raw.toString(this.encoding);

      default:
        return raw;
    }
  }

  encodeParam(df: DataFormat, value: JsValue): Buffer {
    if (value === null && df.isFixedLength()) {
      throw new TypeError(
        `NULL ist für den festen Typ ${DataType[df.dataType]} nicht darstellbar – ` +
        `nullable Variante (INTN, FLTN, MONEYN, DATETIMN, …) verwenden`,
      );
    }
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
        ? (this.byteswap ? raw.readInt16LE(0)  : raw.readInt16BE(0))
        : (this.byteswap ? raw.readUInt16LE(0) : raw.readUInt16BE(0));
      case 4: return signed
        ? (this.byteswap ? raw.readInt32LE(0)  : raw.readInt32BE(0))
        : (this.byteswap ? raw.readUInt32LE(0) : raw.readUInt32BE(0));
      case 8: return signed
        ? (this.byteswap ? raw.readBigInt64LE(0)  : raw.readBigInt64BE(0))
        : (this.byteswap ? raw.readBigUInt64LE(0) : raw.readBigUInt64BE(0));
      default: throw new Error(`Ungültige INTN-Länge: ${raw.length}`);
    }
  }

  private _decodeDecn(raw: Buffer, scale: number): string {
    const negative = raw[0] === 0x01;
    
    // Magnitude ist nun Big-Endian gespeichert in raw[1:]
    let mag = 0n;
    for (let i = 1; i < raw.length; i++) {
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
    const hi = raw.readInt32BE(0);
    const lo = raw.readUInt32BE(4);
    const cents = (BigInt(hi) << 32n) | BigInt(lo);
    return this._moneyToString(cents);
  }

  private _decodeMoney4(raw: Buffer): string {
    return this._moneyToString(BigInt(raw.readInt32BE(0)));
  }

  private _moneyToString(cents: bigint): string {
    const negative = cents < 0n;
    const abs = negative ? -cents : cents;
    const result = (abs / 10000n).toString() + '.' + (abs % 10000n).toString().padStart(4, '0');
    return negative ? '-' + result : result;
  }

  private _decodeDate(raw: Buffer): Date {
    // DATE is a signed day offset from 1900-01-01 (dates before 1900 are negative)
    return new Date(BASE_DATE_MS + raw.readInt32BE(0) * 86_400_000);
  }

  private _decodeTime(raw: Buffer): Date {
    const ms = Math.round(raw.readUInt32BE(0) / 300 * 1000);
    return new Date(BASE_DATE_MS + ms);
  }

  private _decodeDatetime(raw: Buffer): Date {
    const dayMs  = raw.readInt32BE(0) * 86_400_000;
    const timeMs = Math.round(raw.readUInt32BE(4) / 300 * 1000);
    return new Date(BASE_DATE_MS + dayMs + timeMs);
  }

  private _decodeShortDate(raw: Buffer): Date {
    const dayMs = raw.readUInt16BE(0) * 86_400_000;
    const minMs = raw.readUInt16BE(2) * 60_000;
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
        this.byteswap ? b.writeInt16LE(Number(value), 0) : b.writeInt16BE(Number(value), 0);
        break;
      case DataType.INT4:
        this.byteswap ? b.writeInt32LE(Number(value), 0) : b.writeInt32BE(Number(value), 0);
        break;
      case DataType.INT8: {
        const v = typeof value === 'bigint' ? value : BigInt(value as number);
        this.byteswap ? b.writeBigInt64LE(v, 0) : b.writeBigInt64BE(v, 0);
        break;
      }
      case DataType.UINT2:
        this.byteswap ? b.writeUInt16LE(Number(value), 0) : b.writeUInt16BE(Number(value), 0);
        break;
      case DataType.UINT4:
        this.byteswap ? b.writeUInt32LE(Number(value), 0) : b.writeUInt32BE(Number(value), 0);
        break;
      case DataType.UINT8: {
        const v = typeof value === 'bigint' ? value : BigInt(value as number);
        this.byteswap ? b.writeBigUInt64LE(v, 0) : b.writeBigUInt64BE(v, 0);
        break;
      }
      case DataType.FLT4:
        this.byteswap ? b.writeFloatLE(Number(value), 0) : b.writeFloatBE(Number(value), 0);
        break;
      case DataType.FLT8:
        this.byteswap ? b.writeDoubleLE(Number(value), 0) : b.writeDoubleBE(Number(value), 0);
        break;
      case DataType.SHORTMONEY:
        b.writeInt32BE(Number(toMoneyUnits(value)), 0);
        break;
      case DataType.MONEY: {
        const units = toMoneyUnits(value);
        b.writeInt32BE(Number(units >> 32n), 0);
        b.writeUInt32BE(Number(units & 0xFFFF_FFFFn), 4);
        break;
      }
      case DataType.DATE:
        b.writeInt32BE(daysSince1900(toDate(value)), 0);
        break;
      case DataType.TIME:
        b.writeUInt32BE(datetimeTicks(toDate(value)), 0);
        break;
      case DataType.DATETIME: {
        const d = toDate(value);
        b.writeInt32BE(daysSince1900(d), 0);
        b.writeUInt32BE(datetimeTicks(d), 4);
        break;
      }
      case DataType.SHORTDATE: {
        const d = toDate(value);
        b.writeUInt16BE(daysSince1900(d), 0);
        b.writeUInt16BE(d.getUTCHours() * 60 + d.getUTCMinutes(), 2);
        break;
      }
    }
    return b;
  }

  private _encodeVariable(df: DataFormat, value: JsValue): Buffer {
    const long = LONG_TYPES.has(df.dataType);
    if (value === null) return long ? Buffer.alloc(4) : Buffer.from([0x00]);

    switch (df.dataType) {
      case DataType.UNITEXT:
        return lenPrefixed(Buffer.from(String(value), 'utf16le'), true, df);
      case DataType.VARCHAR:
      case DataType.CHAR:
      case DataType.TEXT:
      case DataType.LONGCHAR:
        return lenPrefixed(Buffer.from(String(value), this.encoding), long, df);
      case DataType.BINARY:
      case DataType.VARBINARY:
      case DataType.IMAGE:
      case DataType.LONGBINARY:
        if (!Buffer.isBuffer(value)) {
          throw new TypeError(`Parameter vom Typ ${DataType[df.dataType]} erwartet einen Buffer`);
        }
        return lenPrefixed(value, long, df);
      case DataType.INTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 1)      b.writeUInt8(Number(value), 0);
        else if (n === 2) this.byteswap ? b.writeInt16LE(Number(value), 0) : b.writeInt16BE(Number(value), 0);
        else if (n === 4) this.byteswap ? b.writeInt32LE(Number(value), 0) : b.writeInt32BE(Number(value), 0);
        else {
          const v = typeof value === 'bigint' ? value : BigInt(value as number);
          this.byteswap ? b.writeBigInt64LE(v, 0) : b.writeBigInt64BE(v, 0);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.UINTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 1)      b.writeUInt8(Number(value), 0);
        else if (n === 2) this.byteswap ? b.writeUInt16LE(Number(value), 0) : b.writeUInt16BE(Number(value), 0);
        else if (n === 4) this.byteswap ? b.writeUInt32LE(Number(value), 0) : b.writeUInt32BE(Number(value), 0);
        else {
          const v = typeof value === 'bigint' ? value : BigInt(value as number);
          this.byteswap ? b.writeBigUInt64LE(v, 0) : b.writeBigUInt64BE(v, 0);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.FLTN: {
        const n = df.maxLength;
        const b = Buffer.alloc(n);
        if (n === 4) this.byteswap ? b.writeFloatLE(Number(value), 0)  : b.writeFloatBE(Number(value), 0);
        else         this.byteswap ? b.writeDoubleLE(Number(value), 0) : b.writeDoubleBE(Number(value), 0);
        return Buffer.concat([Buffer.from([n]), b]);
      }
      // MONEYN / DATETIMN / DATEN / TIMEN: Big-Endian, passend zu decode()
      // (gleiche Fehlerklasse wie der DECN-Fix vom 2026-09-22).
      case DataType.MONEYN: {
        const n = df.maxLength === 4 ? 4 : 8;
        const b = Buffer.alloc(n);
        const units = toMoneyUnits(value);
        if (n === 4) {
          b.writeInt32BE(Number(units), 0);
        } else {
          b.writeInt32BE(Number(units >> 32n), 0);
          b.writeUInt32BE(Number(units & 0xFFFF_FFFFn), 4);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.DECN:
      case DataType.NUMN:
        return this._encodeDecn(df, String(value));
      case DataType.DATETIMN: {
        const n = df.maxLength === 4 ? 4 : 8;
        const d = toDate(value);
        const b = Buffer.alloc(n);
        if (n === 4) {
          b.writeUInt16BE(daysSince1900(d), 0);
          b.writeUInt16BE(d.getUTCHours() * 60 + d.getUTCMinutes(), 2);
        } else {
          b.writeInt32BE(daysSince1900(d), 0);
          b.writeUInt32BE(datetimeTicks(d), 4);
        }
        return Buffer.concat([Buffer.from([n]), b]);
      }
      case DataType.DATEN: {
        const b = Buffer.alloc(4);
        b.writeInt32BE(daysSince1900(toDate(value)), 0);
        return Buffer.concat([Buffer.from([4]), b]);
      }
      case DataType.TIMEN: {
        const b = Buffer.alloc(4);
        b.writeUInt32BE(datetimeTicks(toDate(value)), 0);
        return Buffer.concat([Buffer.from([4]), b]);
      }
      default: {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), this.encoding);
        return lenPrefixed(bytes, long, df);
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
    // Big-Endian (mag[0] = höchstwertiges Byte) — muss zu _decodeDecn passen,
    // das raw[1] als höchstwertiges Byte interpretiert (gegen echten Server
    // verifiziert, siehe datatypes.test.ts "DECIMAL(10,2): Wert 99.99").
    let v = unscaled;
    for (let i = magBytes - 1; i >= 0 && v > 0n; i--) {
      mag[i] = Number(v & 0xFFn);
      v >>= 8n;
    }

    return Buffer.concat([Buffer.from([1 + magBytes, negative ? 0x01 : 0x00]), mag]);
  }
}

/**
 * Chooses a parameter DataFormat for a JS value when the caller supplied none.
 *   string  → VARCHAR (≤ 255 bytes) or LONGCHAR
 *   number  → INT4 (32-bit integer), INTN(8) (safe integer), FLT8 otherwise
 *   bigint  → INTN(8)
 *   boolean → BIT
 *   Date    → DATETIMN(8)
 *   Buffer  → VARBINARY (≤ 255 bytes) or LONGBINARY
 *   null    → VARCHAR (NULL)
 */
export function inferFormat(value: JsValue, encoding: BufferEncoding = 'utf8'): DataFormat {
  if (value === null) return new DataFormat(DataType.VARCHAR);
  if (typeof value === 'string') {
    return Buffer.byteLength(value, encoding) > 255
      ? new DataFormat(DataType.LONGCHAR)
      : new DataFormat(DataType.VARCHAR);
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= -0x8000_0000 && value <= 0x7FFF_FFFF) return new DataFormat(DataType.INT4);
      if (Number.isSafeInteger(value)) return new DataFormat(DataType.INTN, { maxLength: 8 });
    }
    return new DataFormat(DataType.FLT8);
  }
  if (typeof value === 'bigint')  return new DataFormat(DataType.INTN, { maxLength: 8 });
  if (typeof value === 'boolean') return new DataFormat(DataType.BIT);
  if (value instanceof Date)      return new DataFormat(DataType.DATETIMN, { maxLength: 8 });
  if (Buffer.isBuffer(value)) {
    return value.length > 255
      ? new DataFormat(DataType.LONGBINARY)
      : new DataFormat(DataType.VARBINARY);
  }
  throw new TypeError(`Parametertyp nicht unterstützt: ${typeof value}`);
}
