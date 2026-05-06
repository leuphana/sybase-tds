import { DataType, ParamStatus } from '../constants/tds-const';
import { TdsWriter } from '../protocol/tds-writer';
import { TdsReader } from '../protocol/tds-reader';

export interface DataFormatOptions {
  name?: string;
  status?: number;
  userType?: number;
  maxLength?: number;
  precision?: number;
  scale?: number;
  locale?: string;
  blobSubtype?: number;
}

/**
 * Describes a column or parameter in TDS 5.0 DataFormat format.
 *
 * Byte layout (from TDS_QUERY_PROTOKOLL.md – DataFormat block):
 *   [nameLen(1)][name(n)][status(1)][userType(4)][dataType(1)][lengthField(0-4)][localeLen(1)][locale(n)]
 */
export class DataFormat {
  readonly name: string;
  readonly status: number;
  readonly userType: number;
  readonly dataType: DataType;
  readonly maxLength: number;
  readonly precision: number;
  readonly scale: number;
  readonly locale: string;
  readonly blobSubtype: number;

  constructor(dataType: DataType, options: DataFormatOptions = {}) {
    this.dataType    = dataType;
    this.name        = options.name       ?? '';
    this.status      = options.status     ?? 0;
    this.userType    = options.userType   ?? 0;
    this.maxLength   = options.maxLength  ?? DataFormat._defaultMaxLength(dataType);
    this.precision   = options.precision  ?? 18;
    this.scale       = options.scale      ?? 0;
    this.locale      = options.locale     ?? '';
    this.blobSubtype = options.blobSubtype ?? 3; // 3 = VARCHAR
  }

  // -------------------------------------------------------------------------
  // Deserialization (server → client)
  // -------------------------------------------------------------------------

  static read(reader: TdsReader, encoding: BufferEncoding = 'utf8'): DataFormat {
    const nameLen   = reader.readUInt8();
    const name      = nameLen > 0 ? reader.readString(nameLen, encoding) : '';
    const status    = reader.readUInt8();
    const userType  = reader.readUInt32BE();
    const dataType  = reader.readUInt8() as DataType;

    let maxLength  = 0;
    let precision  = 18;
    let scale      = 0;
    let blobSubtype = 3;

    if (DataFormat._fixedByteLen(dataType) < 0) {
      switch (dataType) {
        case DataType.DECN:
        case DataType.NUMN:
          maxLength = reader.readUInt8();
          precision = reader.readUInt8();
          scale     = reader.readUInt8();
          break;
        case DataType.BIGDATETIMEN:
        case DataType.BIGTIMEN:
          maxLength = reader.readUInt8();
          scale     = reader.readUInt8();
          break;
        case DataType.IMAGE:
        case DataType.TEXT:
        case DataType.UNITEXT:
        case DataType.LONGCHAR:
        case DataType.LONGBINARY:
          maxLength = reader.readUInt32BE();
          break;
        case DataType.BLOB:
          blobSubtype = reader.readUInt8();
          reader.readUInt16BE(); // ClassID length (always 0)
          break;
        default:
          maxLength = reader.readUInt8();
          break;
      }
    }

    const localeLen = reader.readUInt8();
    const locale    = localeLen > 0 ? reader.readString(localeLen, 'latin1') : '';

    return new DataFormat(dataType, { name, status, userType, maxLength, precision, scale, locale, blobSubtype });
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  build(): Buffer {
    const w = new TdsWriter();
    const nameBytes = Buffer.from(this.name, 'utf8');

    w.writeUInt8(nameBytes.length);
    if (nameBytes.length > 0) w.writeBytes(nameBytes);

    w.writeUInt8(this.status);
    w.writeUInt32BE(this.userType);
    w.writeUInt8(this.dataType);

    this._writeLengthField(w);

    const localeBytes = Buffer.from(this.locale, 'latin1');
    w.writeUInt8(localeBytes.length);
    if (localeBytes.length > 0) w.writeBytes(localeBytes);

    return w.toBuffer();
  }

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  isFixedLength(): boolean {
    return DataFormat._fixedByteLen(this.dataType) >= 0;
  }

  isNullable(): boolean {
    return (this.status & ParamStatus.NULLALLOWED) !== 0;
  }

  /** Fixed data length in bytes for fixed types, -1 for variable types */
  fixedByteLen(): number {
    return DataFormat._fixedByteLen(this.dataType);
  }

  // -------------------------------------------------------------------------
  // Internal helper methods
  // -------------------------------------------------------------------------

  private _writeLengthField(w: TdsWriter): void {
    if (this.isFixedLength()) return;

    switch (this.dataType) {
      case DataType.VARBINARY:
      case DataType.INTN:
      case DataType.VARCHAR:
      case DataType.BINARY:
      case DataType.CHAR:
      case DataType.UINTN:
      case DataType.FLTN:
      case DataType.MONEYN:
      case DataType.DATETIMN:
      case DataType.DATEN:
      case DataType.TIMEN:
        w.writeUInt8(this.maxLength);
        break;

      case DataType.DECN:
      case DataType.NUMN:
        w.writeUInt8(this.maxLength);
        w.writeUInt8(this.precision);
        w.writeUInt8(this.scale);
        break;

      case DataType.BIGDATETIMEN:
      case DataType.BIGTIMEN:
        w.writeUInt8(this.maxLength);
        w.writeUInt8(this.scale);
        break;

      case DataType.IMAGE:
      case DataType.TEXT:
      case DataType.UNITEXT:
      case DataType.LONGCHAR:
      case DataType.LONGBINARY:
        w.writeUInt32BE(this.maxLength);
        break;

      case DataType.BLOB:
        w.writeUInt8(this.blobSubtype);
        w.writeUInt16BE(0); // ClassID length
        break;

      default:
        w.writeUInt8(this.maxLength);
        break;
    }
  }

  private static _fixedByteLen(type: DataType): number {
    switch (type) {
      case DataType.INT1:       return 1;
      case DataType.BIT:        return 1;
      case DataType.INT2:       return 2;
      case DataType.UINT2:      return 2;
      case DataType.INT4:       return 4;
      case DataType.UINT4:      return 4;
      case DataType.SHORTMONEY: return 4;
      case DataType.DATE:       return 4;
      case DataType.TIME:       return 4;
      case DataType.SHORTDATE:  return 4;
      case DataType.FLT4:       return 4;
      case DataType.INT8:       return 8;
      case DataType.UINT8:      return 8;
      case DataType.MONEY:      return 8;
      case DataType.DATETIME:   return 8;
      case DataType.FLT8:       return 8;
      default:                  return -1;
    }
  }

  private static _defaultMaxLength(type: DataType): number {
    switch (type) {
      case DataType.VARCHAR:
      case DataType.CHAR:
      case DataType.BINARY:
      case DataType.VARBINARY:    return 255;
      case DataType.TEXT:
      case DataType.LONGCHAR:
      case DataType.LONGBINARY:
      case DataType.IMAGE:
      case DataType.UNITEXT:      return 2147483647;
      case DataType.INTN:         return 4;
      case DataType.UINTN:        return 4;
      case DataType.FLTN:         return 8;
      case DataType.MONEYN:       return 8;
      case DataType.DATETIMN:     return 8;
      case DataType.DATEN:        return 4;
      case DataType.TIMEN:        return 4;
      case DataType.DECN:
      case DataType.NUMN:         return 17;
      case DataType.BIGDATETIMEN:
      case DataType.BIGTIMEN:     return 8;
      default:                    return 0;
    }
  }
}
