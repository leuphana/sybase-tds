import { TypeMapper, JsValue } from '../../../src/types/type-mapper';
import { DataFormat }          from '../../../src/types/data-format';
import { DataType }            from '../../../src/constants/tds-const';

// ---------------------------------------------------------------------------
// Hilfsfunktionen: bauen rohe Wert-Buffer (wie RowParser sie zurückgibt,
// d.h. OHNE Längenpräfix)
// ---------------------------------------------------------------------------

function i8(v: number)  { return Buffer.from([v & 0xFF]); }
function i16le(v: number) { const b = Buffer.alloc(2); b.writeInt16LE(v, 0); return b; }
function i32le(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v, 0); return b; }
function u16le(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); return b; }
function u32le(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v, 0); return b; }
function i64le(v: bigint) { const b = Buffer.alloc(8); b.writeBigInt64LE(v, 0); return b; }
function u64le(v: bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(v, 0); return b; }
function f32le(v: number) { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; }
function f64le(v: number) { const b = Buffer.alloc(8); b.writeDoubleLE(v, 0); return b; }

/** DECN-Rohdaten: sign(1) + magnitude LE (0 padding) */
function decnRaw(unscaled: bigint, magBytes: number, negative = false): Buffer {
  const sign = Buffer.from([negative ? 0x01 : 0x00]);
  const mag  = Buffer.alloc(magBytes);
  let v = unscaled < 0n ? -unscaled : unscaled;
  for (let i = 0; i < magBytes && v > 0n; i++) {
    mag[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return Buffer.concat([sign, mag]);
}

/** MONEY-Rohdaten: high INT32 LE + low UINT32 LE */
function moneyRaw(cents: bigint): Buffer {
  const b = Buffer.alloc(8);
  const hi = Number(cents >> 32n) | 0;
  const lo = Number(cents & 0xFFFF_FFFFn) >>> 0;
  b.writeInt32LE(hi, 0);
  b.writeUInt32LE(lo, 4);
  return b;
}

/** SHORTMONEY-Rohdaten: INT32 LE (Wert * 10000) */
function shortMoneyRaw(cents: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32LE(cents, 0);
  return b;
}

const BASE_DATE = Date.UTC(1900, 0, 1); // 1. Jan 1900 Mitternacht UTC

/** DATE-Rohdaten: Tage seit 1900-01-01 als UINT32 LE */
function dateRaw(d: Date): Buffer {
  const days = Math.floor((d.getTime() - BASE_DATE) / 86_400_000);
  const b = Buffer.alloc(4);
  b.writeUInt32LE(days, 0);
  return b;
}

/** TIME-Rohdaten: 1/300s seit Mitternacht als UINT32 LE */
function timeRaw(h: number, m: number, s: number): Buffer {
  const ticks = (h * 3600 + m * 60 + s) * 300;
  const b = Buffer.alloc(4);
  b.writeUInt32LE(ticks, 0);
  return b;
}

/** DATETIME-Rohdaten: days(4 LE) + ticks(4 LE) */
function datetimeRaw(d: Date): Buffer {
  const days  = Math.floor((d.getTime() - BASE_DATE) / 86_400_000);
  const ms    = d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ticks = Math.round(ms / 1000 * 300);
  const b = Buffer.alloc(8);
  b.writeInt32LE(days, 0);
  b.writeUInt32LE(ticks, 4);
  return b;
}

/** SHORTDATE-Rohdaten: days(2 LE uint) + minutes(2 LE uint) */
function shortDateRaw(d: Date): Buffer {
  const days    = Math.floor((d.getTime() - BASE_DATE) / 86_400_000);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const b = Buffer.alloc(4);
  b.writeUInt16LE(days, 0);
  b.writeUInt16LE(minutes, 2);
  return b;
}

// ===========================================================================

describe('TypeMapper', () => {
  const m = new TypeMapper();         // byteswap = false (LE, Standard)
  const mBe = new TypeMapper(true);   // byteswap = true (BE)

  // -------------------------------------------------------------------------
  // NULL-Behandlung
  // -------------------------------------------------------------------------

  describe('decode() – NULL', () => {
    it('null → null für INT4',    () => expect(m.decode(new DataFormat(DataType.INT4), null)).toBeNull());
    it('null → null für VARCHAR', () => expect(m.decode(new DataFormat(DataType.VARCHAR), null)).toBeNull());
    it('null → null für DECN',    () => expect(m.decode(new DataFormat(DataType.DECN), null)).toBeNull());
    it('null → null für DATETIME',() => expect(m.decode(new DataFormat(DataType.DATETIME), null)).toBeNull());
  });

  // -------------------------------------------------------------------------
  // Fixe Integer-Typen (LE)
  // -------------------------------------------------------------------------

  describe('decode() – Fixe Ganzzahlen (LE)', () => {
    it('INT1: 42', () => expect(m.decode(new DataFormat(DataType.INT1), i8(42))).toBe(42));
    it('INT1: 255', () => expect(m.decode(new DataFormat(DataType.INT1), i8(255))).toBe(255));

    it('INT2: 1000', () => expect(m.decode(new DataFormat(DataType.INT2), i16le(1000))).toBe(1000));
    it('INT2: -1',   () => expect(m.decode(new DataFormat(DataType.INT2), i16le(-1))).toBe(-1));

    it('INT4: 42',      () => expect(m.decode(new DataFormat(DataType.INT4), i32le(42))).toBe(42));
    it('INT4: -1',      () => expect(m.decode(new DataFormat(DataType.INT4), i32le(-1))).toBe(-1));
    it('INT4: 2147483647', () => expect(m.decode(new DataFormat(DataType.INT4), i32le(2147483647))).toBe(2147483647));

    it('INT8: 42n',  () => expect(m.decode(new DataFormat(DataType.INT8), i64le(42n))).toBe(42n));
    it('INT8: -1n',  () => expect(m.decode(new DataFormat(DataType.INT8), i64le(-1n))).toBe(-1n));

    it('UINT2: 65535', () => expect(m.decode(new DataFormat(DataType.UINT2), u16le(65535))).toBe(65535));
    it('UINT4: 4294967295', () => expect(m.decode(new DataFormat(DataType.UINT4), u32le(4294967295))).toBe(4294967295));
    it('UINT8: 42n', () => expect(m.decode(new DataFormat(DataType.UINT8), u64le(42n))).toBe(42n));

    it('BIT: 0 → false', () => expect(m.decode(new DataFormat(DataType.BIT), i8(0))).toBe(false));
    it('BIT: 1 → true',  () => expect(m.decode(new DataFormat(DataType.BIT), i8(1))).toBe(true));
    it('BIT: 255 → true', () => expect(m.decode(new DataFormat(DataType.BIT), i8(255))).toBe(true));
  });

  // -------------------------------------------------------------------------
  // Fixe Integer-Typen (BE)
  // -------------------------------------------------------------------------

  describe('decode() – Fixe Ganzzahlen (BE, byteswap=true)', () => {
    it('INT4 BE: 42', () => {
      const b = Buffer.alloc(4); b.writeInt32BE(42, 0);
      expect(mBe.decode(new DataFormat(DataType.INT4), b)).toBe(42);
    });
    it('INT2 BE: 1000', () => {
      const b = Buffer.alloc(2); b.writeInt16BE(1000, 0);
      expect(mBe.decode(new DataFormat(DataType.INT2), b)).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // Variable Integer-Typen (INTN, UINTN)
  // -------------------------------------------------------------------------

  describe('decode() – INTN', () => {
    it('INTN 1 Byte: 42',   () => expect(m.decode(new DataFormat(DataType.INTN), i8(42))).toBe(42));
    it('INTN 2 Bytes: 1000',() => expect(m.decode(new DataFormat(DataType.INTN), i16le(1000))).toBe(1000));
    it('INTN 4 Bytes: -5',  () => expect(m.decode(new DataFormat(DataType.INTN), i32le(-5))).toBe(-5));
    it('INTN 8 Bytes: 42n', () => expect(m.decode(new DataFormat(DataType.INTN), i64le(42n))).toBe(42n));
  });

  describe('decode() – UINTN', () => {
    it('UINTN 1 Byte: 255',     () => expect(m.decode(new DataFormat(DataType.UINTN), i8(255))).toBe(255));
    it('UINTN 4 Bytes: 65000',  () => expect(m.decode(new DataFormat(DataType.UINTN), u32le(65000))).toBe(65000));
    it('UINTN 8 Bytes: 1n',     () => expect(m.decode(new DataFormat(DataType.UINTN), u64le(1n))).toBe(1n));
  });

  // -------------------------------------------------------------------------
  // Float-Typen
  // -------------------------------------------------------------------------

  describe('decode() – Float-Typen', () => {
    it('FLT4: 3.14 (approx)', () => {
      expect(m.decode(new DataFormat(DataType.FLT4), f32le(3.14))).toBeCloseTo(3.14, 2);
    });
    it('FLT8: 3.141592653589793', () => {
      expect(m.decode(new DataFormat(DataType.FLT8), f64le(3.141592653589793))).toBeCloseTo(3.141592653589793, 10);
    });
    it('FLTN 4 Bytes: 1.5', () => {
      expect(m.decode(new DataFormat(DataType.FLTN), f32le(1.5))).toBeCloseTo(1.5, 5);
    });
    it('FLTN 8 Bytes: 1.5', () => {
      expect(m.decode(new DataFormat(DataType.FLTN), f64le(1.5))).toBeCloseTo(1.5, 10);
    });
  });

  // -------------------------------------------------------------------------
  // DECN / NUMN
  // -------------------------------------------------------------------------

  describe('decode() – DECN / NUMN', () => {
    it('DECN(5,2): 12345 unscaled → "123.45"', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 5, scale: 2 });
      const raw = decnRaw(12345n, 4); // precision ≤ 9 → 4 Magnitude-Bytes
      expect(m.decode(df, raw)).toBe('123.45');
    });

    it('DECN: negativ "-99.99"', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 5, scale: 2 });
      const raw = decnRaw(9999n, 4, true);
      expect(m.decode(df, raw)).toBe('-99.99');
    });

    it('DECN(10,2): 123.45 mit 8-Byte Magnitude', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 10, scale: 2 });
      const raw = decnRaw(12345n, 8);
      expect(m.decode(df, raw)).toBe('123.45');
    });

    it('DECN(5,0): ganze Zahl "42"', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 5, scale: 0 });
      const raw = decnRaw(42n, 4);
      expect(m.decode(df, raw)).toBe('42');
    });

    it('NUMN(5,3): "1.234"', () => {
      const df  = new DataFormat(DataType.NUMN, { precision: 5, scale: 3 });
      const raw = decnRaw(1234n, 4);
      expect(m.decode(df, raw)).toBe('1.234');
    });

    it('DECN: Null-Wert (0) → "0.00"', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 5, scale: 2 });
      const raw = decnRaw(0n, 4);
      expect(m.decode(df, raw)).toBe('0.00');
    });
  });

  // -------------------------------------------------------------------------
  // MONEY / SHORTMONEY
  // -------------------------------------------------------------------------

  describe('decode() – MONEY / SHORTMONEY', () => {
    it('MONEY: 1 Dollar → "1.0000"', () => {
      expect(m.decode(new DataFormat(DataType.MONEY), moneyRaw(10000n))).toBe('1.0000');
    });

    it('MONEY: 9999.9999', () => {
      expect(m.decode(new DataFormat(DataType.MONEY), moneyRaw(99999999n))).toBe('9999.9999');
    });

    it('MONEY: negativ "-0.5000"', () => {
      expect(m.decode(new DataFormat(DataType.MONEY), moneyRaw(-5000n))).toBe('-0.5000');
    });

    it('SHORTMONEY: 1 Dollar → "1.0000"', () => {
      expect(m.decode(new DataFormat(DataType.SHORTMONEY), shortMoneyRaw(10000))).toBe('1.0000');
    });

    it('SHORTMONEY: negativ "-2.5000"', () => {
      expect(m.decode(new DataFormat(DataType.SHORTMONEY), shortMoneyRaw(-25000))).toBe('-2.5000');
    });

    it('MONEYN 4 Bytes: wie SHORTMONEY', () => {
      expect(m.decode(new DataFormat(DataType.MONEYN), shortMoneyRaw(10000))).toBe('1.0000');
    });

    it('MONEYN 8 Bytes: wie MONEY', () => {
      expect(m.decode(new DataFormat(DataType.MONEYN), moneyRaw(10000n))).toBe('1.0000');
    });
  });

  // -------------------------------------------------------------------------
  // DATE / TIME / DATETIME
  // -------------------------------------------------------------------------

  describe('decode() – Datum / Uhrzeit', () => {
    const day20000101 = new Date(Date.UTC(2000, 0, 1));
    const day19900601 = new Date(Date.UTC(1990, 5, 1));

    it('DATE: 1. Jan 2000', () => {
      const result = m.decode(new DataFormat(DataType.DATE), dateRaw(day20000101)) as Date;
      expect(result.getUTCFullYear()).toBe(2000);
      expect(result.getUTCMonth()).toBe(0);
      expect(result.getUTCDate()).toBe(1);
    });

    it('DATE: 1. Jun 1990', () => {
      const result = m.decode(new DataFormat(DataType.DATE), dateRaw(day19900601)) as Date;
      expect(result.getUTCFullYear()).toBe(1990);
      expect(result.getUTCMonth()).toBe(5);
      expect(result.getUTCDate()).toBe(1);
    });

    it('DATE: 1. Jan 1900 (Basisdatum)', () => {
      const result = m.decode(new DataFormat(DataType.DATE), Buffer.from([0, 0, 0, 0])) as Date;
      expect(result.getUTCFullYear()).toBe(1900);
    });

    it('TIME: 12:30:00 → Stunden/Minuten korrekt', () => {
      const result = m.decode(new DataFormat(DataType.TIME), timeRaw(12, 30, 0)) as Date;
      expect(result.getUTCHours()).toBe(12);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it('TIME: 00:00:00', () => {
      const result = m.decode(new DataFormat(DataType.TIME), timeRaw(0, 0, 0)) as Date;
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
    });

    it('DATETIME: 1. Jan 2000 12:30:00', () => {
      const dt = new Date(Date.UTC(2000, 0, 1, 12, 30, 0));
      const result = m.decode(new DataFormat(DataType.DATETIME), datetimeRaw(dt)) as Date;
      expect(result.getUTCFullYear()).toBe(2000);
      expect(result.getUTCHours()).toBe(12);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it('SHORTDATE: 2000-01-01 09:15', () => {
      const dt = new Date(Date.UTC(2000, 0, 1, 9, 15, 0));
      const result = m.decode(new DataFormat(DataType.SHORTDATE), shortDateRaw(dt)) as Date;
      expect(result.getUTCFullYear()).toBe(2000);
      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCMinutes()).toBe(15);
    });

    it('DATEN: wie DATE', () => {
      const result = m.decode(new DataFormat(DataType.DATEN), dateRaw(day20000101)) as Date;
      expect(result.getUTCFullYear()).toBe(2000);
    });

    it('TIMEN: wie TIME', () => {
      const result = m.decode(new DataFormat(DataType.TIMEN), timeRaw(8, 0, 0)) as Date;
      expect(result.getUTCHours()).toBe(8);
    });

    it('DATETIMN 8 Bytes: wie DATETIME', () => {
      const dt = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
      const result = m.decode(new DataFormat(DataType.DATETIMN), datetimeRaw(dt)) as Date;
      expect(result.getUTCFullYear()).toBe(2000);
      expect(result.getUTCHours()).toBe(12);
    });

    it('DATETIMN 4 Bytes: wie SHORTDATE', () => {
      const dt = new Date(Date.UTC(2000, 0, 1, 9, 15, 0));
      const result = m.decode(new DataFormat(DataType.DATETIMN), shortDateRaw(dt)) as Date;
      expect(result.getUTCHours()).toBe(9);
    });
  });

  // -------------------------------------------------------------------------
  // String-Typen
  // -------------------------------------------------------------------------

  describe('decode() – Zeichenketten', () => {
    it('VARCHAR: "hello"', () => {
      expect(m.decode(new DataFormat(DataType.VARCHAR), Buffer.from('hello', 'utf8'))).toBe('hello');
    });

    it('VARCHAR: leerer String', () => {
      expect(m.decode(new DataFormat(DataType.VARCHAR), Buffer.alloc(0))).toBe('');
    });

    it('CHAR: "ABC"', () => {
      expect(m.decode(new DataFormat(DataType.CHAR), Buffer.from('ABC', 'latin1'))).toBe('ABC');
    });

    it('TEXT: längerer Text', () => {
      const text = 'Lorem ipsum dolor sit amet';
      expect(m.decode(new DataFormat(DataType.TEXT), Buffer.from(text, 'utf8'))).toBe(text);
    });

    it('LONGCHAR: dekodiert als utf8', () => {
      expect(m.decode(new DataFormat(DataType.LONGCHAR), Buffer.from('test', 'utf8'))).toBe('test');
    });

    it('UNITEXT: dekodiert als utf16le', () => {
      const buf = Buffer.from('AB', 'utf16le');
      expect(m.decode(new DataFormat(DataType.UNITEXT), buf)).toBe('AB');
    });
  });

  // -------------------------------------------------------------------------
  // Binär-Typen
  // -------------------------------------------------------------------------

  describe('decode() – Binärdaten', () => {
    const raw = Buffer.from([0x01, 0x02, 0x03, 0xFF]);

    it('BINARY: passthrough', () => {
      expect(m.decode(new DataFormat(DataType.BINARY), raw)).toEqual(raw);
    });

    it('VARBINARY: passthrough', () => {
      expect(m.decode(new DataFormat(DataType.VARBINARY), raw)).toEqual(raw);
    });

    it('IMAGE: passthrough', () => {
      expect(m.decode(new DataFormat(DataType.IMAGE), raw)).toEqual(raw);
    });

    it('LONGBINARY: passthrough', () => {
      expect(m.decode(new DataFormat(DataType.LONGBINARY), raw)).toEqual(raw);
    });
  });

  // =========================================================================
  // encodeParam()
  // =========================================================================

  describe('encodeParam() – Fixe Typen (nur Wert-Bytes, kein Längenpräfix)', () => {
    it('INT1: 42 → [0x2A]', () => {
      expect(m.encodeParam(new DataFormat(DataType.INT1), 42)).toEqual(Buffer.from([0x2A]));
    });

    it('BIT: true → [0x01]', () => {
      expect(m.encodeParam(new DataFormat(DataType.BIT), true)).toEqual(Buffer.from([0x01]));
    });

    it('BIT: false → [0x00]', () => {
      expect(m.encodeParam(new DataFormat(DataType.BIT), false)).toEqual(Buffer.from([0x00]));
    });

    it('INT2: 1000 → 2 Bytes LE', () => {
      const expected = Buffer.alloc(2); expected.writeInt16LE(1000, 0);
      expect(m.encodeParam(new DataFormat(DataType.INT2), 1000)).toEqual(expected);
    });

    it('INT4: 42 → 4 Bytes LE', () => {
      const expected = Buffer.alloc(4); expected.writeInt32LE(42, 0);
      expect(m.encodeParam(new DataFormat(DataType.INT4), 42)).toEqual(expected);
    });

    it('INT4 BE: 42 → 4 Bytes BE', () => {
      const expected = Buffer.alloc(4); expected.writeInt32BE(42, 0);
      expect(mBe.encodeParam(new DataFormat(DataType.INT4), 42)).toEqual(expected);
    });

    it('INT8: 42n → 8 Bytes LE', () => {
      const expected = Buffer.alloc(8); expected.writeBigInt64LE(42n, 0);
      expect(m.encodeParam(new DataFormat(DataType.INT8), 42n)).toEqual(expected);
    });

    it('UINT2: 65535 → 2 Bytes LE', () => {
      const expected = Buffer.alloc(2); expected.writeUInt16LE(65535, 0);
      expect(m.encodeParam(new DataFormat(DataType.UINT2), 65535)).toEqual(expected);
    });

    it('FLT4: 1.5 → 4 Bytes LE', () => {
      const expected = Buffer.alloc(4); expected.writeFloatLE(1.5, 0);
      expect(m.encodeParam(new DataFormat(DataType.FLT4), 1.5)).toEqual(expected);
    });

    it('FLT8: 3.14 → 8 Bytes LE', () => {
      const expected = Buffer.alloc(8); expected.writeDoubleLE(3.14, 0);
      expect(m.encodeParam(new DataFormat(DataType.FLT8), 3.14)).toEqual(expected);
    });
  });

  describe('encodeParam() – Variable Typen (mit Längenpräfix)', () => {
    it('VARCHAR: "hello" → [5][h][e][l][l][o]', () => {
      const result = m.encodeParam(new DataFormat(DataType.VARCHAR, { maxLength: 50 }), 'hello');
      expect(result[0]).toBe(5);
      expect(result.slice(1).toString('utf8')).toBe('hello');
    });

    it('VARCHAR null → [0x00]', () => {
      expect(m.encodeParam(new DataFormat(DataType.VARCHAR, { maxLength: 50 }), null)).toEqual(Buffer.from([0x00]));
    });

    it('BINARY: Buffer → [len][bytes]', () => {
      const data = Buffer.from([0xAA, 0xBB]);
      const result = m.encodeParam(new DataFormat(DataType.BINARY, { maxLength: 10 }), data);
      expect(result[0]).toBe(2);
      expect(result.slice(1)).toEqual(data);
    });

    it('INTN maxLength=4: 42 → [4][42 LE]', () => {
      const df = new DataFormat(DataType.INTN, { maxLength: 4 });
      const result = m.encodeParam(df, 42);
      expect(result[0]).toBe(4);
      expect(result.readInt32LE(1)).toBe(42);
    });

    it('INTN null → [0x00]', () => {
      expect(m.encodeParam(new DataFormat(DataType.INTN, { maxLength: 4 }), null)).toEqual(Buffer.from([0x00]));
    });

    it('INTN maxLength=8: 42n → [8][42 LE 8Bytes]', () => {
      const df = new DataFormat(DataType.INTN, { maxLength: 8 });
      const result = m.encodeParam(df, 42n);
      expect(result[0]).toBe(8);
      expect(result.readBigInt64LE(1)).toBe(42n);
    });

    it('FLTN maxLength=8: 3.14 → [8][double LE]', () => {
      const df = new DataFormat(DataType.FLTN, { maxLength: 8 });
      const result = m.encodeParam(df, 3.14);
      expect(result[0]).toBe(8);
      expect(result.readDoubleLE(1)).toBeCloseTo(3.14, 10);
    });

    it('MONEYN maxLength=4: 2.5 → [4][int LE 25000]', () => {
      const df = new DataFormat(DataType.MONEYN, { maxLength: 4 });
      const result = m.encodeParam(df, 2.5);
      expect(result[0]).toBe(4);
      expect(result.readInt32LE(1)).toBe(25000);
    });

    it('DECN(5,2): "123.45" → korrekte Bytes', () => {
      const df  = new DataFormat(DataType.DECN, { precision: 5, scale: 2 });
      const result = m.encodeParam(df, '123.45');
      expect(result[0]).toBe(5); // length = 1 sign + 4 magnitude
      expect(result[1]).toBe(0x00); // positive
    });

    it('DECN(5,2): null → [0x00]', () => {
      expect(m.encodeParam(new DataFormat(DataType.DECN, { precision: 5, scale: 2 }), null))
        .toEqual(Buffer.from([0x00]));
    });
  });

  // =========================================================================
  // Round-Trip-Tests: encodeParam() → decode() (nur für var. Typen)
  // =========================================================================

  describe('Round-Trip: encodeParam() → decode()', () => {
    function roundTrip(df: DataFormat, value: JsValue): JsValue {
      const encoded = m.encodeParam(df, value);
      if (df.isFixedLength()) {
        return m.decode(df, encoded);
      }
      // Variable: überspringe Längenpräfix
      const len = encoded[0];
      if (len === 0) return null;
      return m.decode(df, encoded.slice(1));
    }

    it('INT4: 42', () => expect(roundTrip(new DataFormat(DataType.INT4), 42)).toBe(42));
    it('INT8: 42n', () => expect(roundTrip(new DataFormat(DataType.INT8), 42n)).toBe(42n));
    it('FLT8: 3.14', () => expect(roundTrip(new DataFormat(DataType.FLT8), 3.14)).toBeCloseTo(3.14, 10));
    it('INTN(4): 99', () => expect(roundTrip(new DataFormat(DataType.INTN, { maxLength: 4 }), 99)).toBe(99));
    it('VARCHAR: "hello"', () => expect(roundTrip(new DataFormat(DataType.VARCHAR, { maxLength: 50 }), 'hello')).toBe('hello'));
    it('VARCHAR: null',    () => expect(roundTrip(new DataFormat(DataType.VARCHAR, { maxLength: 50 }), null)).toBeNull());
    it('BINARY: passthrough', () => {
      const buf = Buffer.from([0x01, 0x02]);
      expect(roundTrip(new DataFormat(DataType.BINARY, { maxLength: 10 }), buf)).toEqual(buf);
    });
    it('DECN(5,2): "123.45"', () => {
      expect(roundTrip(new DataFormat(DataType.DECN, { precision: 5, scale: 2 }), '123.45')).toBe('123.45');
    });
    it('DECN(5,2): "-99.99"', () => {
      expect(roundTrip(new DataFormat(DataType.DECN, { precision: 5, scale: 2 }), '-99.99')).toBe('-99.99');
    });
  });
});
