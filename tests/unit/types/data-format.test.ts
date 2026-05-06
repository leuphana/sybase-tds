import { DataFormat, DataFormatOptions } from '../../../src/types/data-format';
import { DataType, ParamStatus, RowStatus } from '../../../src/constants/tds-const';
import { TdsReader } from '../../../src/protocol/tds-reader';

// Offset-Helfer: Position des Datentyp-Bytes im serialisierten DataFormat-Block
// Layout: [nameLen(1)][name(n)][status(1)][userType(4)][dataType(1)][...lengthField][localeLen(1)]
function dataTypeOffset(nameLen: number): number {
  return 1 + nameLen + 1 + 4; // nameLen-Byte + name + status + userType
}

describe('DataFormat', () => {
  describe('Konstruktor / Defaults', () => {
    it('setzt dataType korrekt', () => {
      const df = new DataFormat(DataType.INT4);
      expect(df.dataType).toBe(DataType.INT4);
    });

    it('Default-Name ist leerer String', () => {
      expect(new DataFormat(DataType.INT4).name).toBe('');
    });

    it('Default-Status ist 0', () => {
      expect(new DataFormat(DataType.INT4).status).toBe(0);
    });

    it('Default-userType ist 0', () => {
      expect(new DataFormat(DataType.INT4).userType).toBe(0);
    });

    it('erlaubt Status-Flags zu setzen', () => {
      const df = new DataFormat(DataType.VARCHAR, { status: ParamStatus.NULLALLOWED });
      expect(df.status).toBe(ParamStatus.NULLALLOWED);
    });
  });

  describe('build() – Grundstruktur', () => {
    it('erstes Byte ist Namelänge (0 wenn kein Name)', () => {
      const buf = new DataFormat(DataType.INT4).build();
      expect(buf[0]).toBe(0x00);
    });

    it('Name-Bytes werden korrekt eingebettet', () => {
      const df = new DataFormat(DataType.INT4, { name: 'id' });
      const buf = df.build();
      expect(buf[0]).toBe(2);          // nameLen
      expect(buf[1]).toBe(0x69);       // 'i'
      expect(buf[2]).toBe(0x64);       // 'd'
    });

    it('Status-Byte folgt nach dem Namen', () => {
      const df = new DataFormat(DataType.INT4, { name: 'x', status: ParamStatus.NULLALLOWED });
      const buf = df.build();
      // Offset: 1 (nameLen) + 1 (name 'x') + 0 = 2
      expect(buf[2]).toBe(ParamStatus.NULLALLOWED);
    });

    it('userType (4 Bytes BE) folgt nach Status', () => {
      const df = new DataFormat(DataType.INT4, { userType: 0x00000042 });
      const buf = df.build();
      // Offset: 1 (nameLen=0) + 1 (status) = 2
      expect(buf.readUInt32BE(2)).toBe(0x00000042);
    });

    it('dataType-Byte steht an der richtigen Position', () => {
      const df = new DataFormat(DataType.INT4);
      const buf = df.build();
      // nameLen(1) + status(1) + userType(4) = Offset 6
      expect(buf[6]).toBe(DataType.INT4);
    });

    it('letztes Byte ist Locale-Länge (0 = kein Locale)', () => {
      const buf = new DataFormat(DataType.INT4).build();
      expect(buf[buf.length - 1]).toBe(0x00);
    });
  });

  describe('build() – Fixe Typen (kein Längenfeld)', () => {
    const fixedTypes = [
      DataType.INT1, DataType.BIT, DataType.INT2, DataType.INT4,
      DataType.INT8, DataType.UINT2, DataType.UINT4, DataType.UINT8,
      DataType.FLT4, DataType.FLT8, DataType.MONEY, DataType.SHORTMONEY,
      DataType.DATE, DataType.TIME, DataType.SHORTDATE, DataType.DATETIME,
    ];

    it.each(fixedTypes)('DataType 0x%s hat kein Längenfeld → Gesamtlänge = 8', (type) => {
      const buf = new DataFormat(type).build();
      // nameLen(1) + status(1) + userType(4) + dataType(1) + localeLen(1) = 8
      expect(buf).toHaveLength(8);
    });
  });

  describe('build() – 1-Byte-Längenfeld', () => {
    const variableTypes = [
      DataType.INTN, DataType.UINTN, DataType.FLTN, DataType.MONEYN,
      DataType.DATETIMN, DataType.DATEN, DataType.TIMEN,
      DataType.VARCHAR, DataType.CHAR, DataType.BINARY, DataType.VARBINARY,
    ];

    it.each(variableTypes)('DataType %s hat 1-Byte-Längenfeld → Gesamtlänge = 9', (type) => {
      const buf = new DataFormat(type, { maxLength: 10 }).build();
      // 8 (Basis) + 1 (Längenfeld)
      expect(buf).toHaveLength(9);
    });

    it('maxLength wird korrekt ins Längenfeld geschrieben', () => {
      const buf = new DataFormat(DataType.VARCHAR, { maxLength: 42 }).build();
      // Offset: nameLen(1) + status(1) + userType(4) + dataType(1) = 7
      expect(buf[7]).toBe(42);
    });
  });

  describe('build() – DECN / NUMN (1+1+1 Byte: len + precision + scale)', () => {
    it('DECN hat 3-Byte-Längenfeld → Gesamtlänge = 11', () => {
      const buf = new DataFormat(DataType.DECN, { maxLength: 17, precision: 18, scale: 4 }).build();
      expect(buf).toHaveLength(11);
    });

    it('Länge, Precision und Scale werden korrekt geschrieben', () => {
      const buf = new DataFormat(DataType.DECN, { maxLength: 17, precision: 18, scale: 4 }).build();
      const base = 7; // nameLen(1)+status(1)+userType(4)+dataType(1)
      expect(buf[base]).toBe(17); // maxLength
      expect(buf[base + 1]).toBe(18); // precision
      expect(buf[base + 2]).toBe(4);  // scale
    });
  });

  describe('build() – BIGDATETIMEN / BIGTIMEN (1+1 Byte: len + scale)', () => {
    it('BIGDATETIMEN hat 2-Byte-Längenfeld → Gesamtlänge = 10', () => {
      const buf = new DataFormat(DataType.BIGDATETIMEN, { maxLength: 8, scale: 6 }).build();
      expect(buf).toHaveLength(10);
    });

    it('Scale wird korrekt geschrieben', () => {
      const buf = new DataFormat(DataType.BIGDATETIMEN, { maxLength: 8, scale: 3 }).build();
      expect(buf[8]).toBe(3); // scale nach maxLength
    });
  });

  describe('build() – 4-Byte-Längenfeld (IMAGE, TEXT, LONGCHAR, LONGBINARY, UNITEXT)', () => {
    const largeTypes = [DataType.IMAGE, DataType.TEXT, DataType.LONGCHAR, DataType.LONGBINARY, DataType.UNITEXT];

    it.each(largeTypes)('DataType %s hat 4-Byte-Längenfeld → Gesamtlänge = 12', (type) => {
      const buf = new DataFormat(type, { maxLength: 2147483647 }).build();
      expect(buf).toHaveLength(12);
    });

    it('maxLength wird als 4-Byte-BE-Wert geschrieben', () => {
      const buf = new DataFormat(DataType.TEXT, { maxLength: 0x01000000 }).build();
      expect(buf.readUInt32BE(7)).toBe(0x01000000);
    });
  });

  describe('build() – Locale', () => {
    it('Locale-Bytes werden nach dem Längenfeld geschrieben', () => {
      const df = new DataFormat(DataType.INT4, { locale: 'de' });
      const buf = df.build();
      // nameLen(1)+status(1)+userType(4)+dataType(1)+localeLen(1)+locale(2) = 10
      expect(buf).toHaveLength(10);
      expect(buf[buf.length - 3]).toBe(2);    // locale-Länge
      expect(buf[buf.length - 2]).toBe(0x64); // 'd'
      expect(buf[buf.length - 1]).toBe(0x65); // 'e'
    });
  });

  describe('Hilfsmethoden', () => {
    it('isFixedLength() für INT4 = true', () => {
      expect(new DataFormat(DataType.INT4).isFixedLength()).toBe(true);
    });

    it('isFixedLength() für VARCHAR = false', () => {
      expect(new DataFormat(DataType.VARCHAR).isFixedLength()).toBe(false);
    });

    it('isNullable() wenn NULLALLOWED-Status gesetzt', () => {
      const df = new DataFormat(DataType.INT4, { status: ParamStatus.NULLALLOWED });
      expect(df.isNullable()).toBe(true);
    });

    it('isNullable() = false ohne NULLALLOWED-Status', () => {
      expect(new DataFormat(DataType.INT4).isNullable()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // DataFormat.read() – Round-Trip-Tests
  // -------------------------------------------------------------------------

  describe('read() – Round-Trip build() → read()', () => {
    function roundtrip(df: DataFormat): DataFormat {
      const buf = df.build();
      return DataFormat.read(new TdsReader(buf));
    }

    it('INT4 (fixer Typ): dataType erhalten', () => {
      expect(roundtrip(new DataFormat(DataType.INT4)).dataType).toBe(DataType.INT4);
    });

    it('INT4: name erhalten', () => {
      const df = new DataFormat(DataType.INT4, { name: 'id' });
      expect(roundtrip(df).name).toBe('id');
    });

    it('INT4: status erhalten', () => {
      const df = new DataFormat(DataType.INT4, { status: ParamStatus.RETURN });
      expect(roundtrip(df).status).toBe(ParamStatus.RETURN);
    });

    it('INT4: userType erhalten', () => {
      const df = new DataFormat(DataType.INT4, { userType: 99 });
      expect(roundtrip(df).userType).toBe(99);
    });

    it('VARCHAR: dataType erhalten', () => {
      expect(roundtrip(new DataFormat(DataType.VARCHAR, { maxLength: 50 })).dataType).toBe(DataType.VARCHAR);
    });

    it('VARCHAR: maxLength erhalten', () => {
      const df = new DataFormat(DataType.VARCHAR, { maxLength: 50 });
      expect(roundtrip(df).maxLength).toBe(50);
    });

    it('DECN: precision und scale erhalten', () => {
      const df = new DataFormat(DataType.DECN, { maxLength: 17, precision: 10, scale: 2 });
      const rt = roundtrip(df);
      expect(rt.precision).toBe(10);
      expect(rt.scale).toBe(2);
    });

    it('TEXT: maxLength (4 Bytes) erhalten', () => {
      const df = new DataFormat(DataType.TEXT, { maxLength: 2147483647 });
      expect(roundtrip(df).maxLength).toBe(2147483647);
    });

    it('BIGDATETIMEN: scale erhalten', () => {
      const df = new DataFormat(DataType.BIGDATETIMEN, { maxLength: 8, scale: 6 });
      expect(roundtrip(df).scale).toBe(6);
    });

    it('name und locale zusammen erhalten', () => {
      const df = new DataFormat(DataType.CHAR, { name: 'col', maxLength: 20, locale: 'de' });
      const rt = roundtrip(df);
      expect(rt.name).toBe('col');
      expect(rt.locale).toBe('de');
    });

    it('reader position nach read() zeigt auf nächstes Byte', () => {
      const df1 = new DataFormat(DataType.INT4);
      const df2 = new DataFormat(DataType.VARCHAR, { maxLength: 30 });
      const buf = Buffer.concat([df1.build(), df2.build()]);
      const reader = new TdsReader(buf);
      DataFormat.read(reader);
      // reader sollte jetzt auf df2 zeigen
      expect(DataFormat.read(reader).dataType).toBe(DataType.VARCHAR);
    });
  });
});
