import { RowParser } from '../../../../src/protocol/response/row-token';
import { TokenType, DataType, RowStatus } from '../../../../src/constants/tds-const';
import { DataFormat } from '../../../../src/types/data-format';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

function makeRow(values: Buffer[], columns: DataFormat[], hasColStatus: number[] = []): Buffer {
  const w = new TdsWriter();
  w.writeUInt8(TokenType.ROW);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const val = values[i];
    if (col.isFixedLength()) {
      if (col.status & RowStatus.COLUMNSTATUS) {
        w.writeUInt8(hasColStatus[i] ?? 0x01);
        if ((hasColStatus[i] ?? 0x01) !== 0) w.writeBytes(val);
      } else {
        w.writeBytes(val);
      }
    } else {
      w.writeUInt8(val.length); // actual length (0 = null)
      if (val.length > 0) w.writeBytes(val);
    }
  }
  return w.toBuffer();
}

describe('RowParser', () => {
  describe('read() – fixe Typen', () => {
    const col = new DataFormat(DataType.INT4);
    const intVal = Buffer.alloc(4);
    intVal.writeUInt32BE(42, 0);

    it('INT4-Wert korrekt als Buffer', () => {
      const buf = makeRow([intVal], [col]);
      const result = RowParser.read(buf, [col]);
      expect(result.values[0]).toEqual(intVal);
    });

    it('2 fixe Spalten in korrekter Reihenfolge', () => {
      const col2 = new DataFormat(DataType.INT2);
      const int2Val = Buffer.from([0x00, 0x07]);
      const buf = makeRow([intVal, int2Val], [col, col2]);
      const result = RowParser.read(buf, [col, col2]);
      expect(result.values[0]).toEqual(intVal);
      expect(result.values[1]).toEqual(int2Val);
    });
  });

  describe('read() – variable Typen', () => {
    const col = new DataFormat(DataType.VARCHAR, { maxLength: 50 });

    it('VARCHAR-Wert korrekt', () => {
      const strBuf = Buffer.from('hello', 'utf8');
      const buf = makeRow([strBuf], [col]);
      expect(RowParser.read(buf, [col]).values[0]).toEqual(strBuf);
    });

    it('NULL-Wert (Länge = 0) → null', () => {
      const buf = makeRow([Buffer.alloc(0)], [col]);
      expect(RowParser.read(buf, [col]).values[0]).toBeNull();
    });

    it('leere Zeichenkette (Länge = 0) wird als null behandelt', () => {
      const buf = makeRow([Buffer.alloc(0)], [col]);
      expect(RowParser.read(buf, [col]).values[0]).toBeNull();
    });
  });

  describe('read() – COLUMNSTATUS bei fixen Typen', () => {
    const col = new DataFormat(DataType.INT4, { status: RowStatus.COLUMNSTATUS | RowStatus.NULLALLOWED });
    const intVal = Buffer.alloc(4);
    intVal.writeUInt32BE(99, 0);

    it('Wert ist null wenn Spalten-Status-Byte = 0', () => {
      const w = new TdsWriter();
      w.writeUInt8(TokenType.ROW);
      w.writeUInt8(0x00); // columnStatus = null
      const buf = w.toBuffer();
      expect(RowParser.read(buf, [col]).values[0]).toBeNull();
    });

    it('Wert korrekt wenn Spalten-Status-Byte = 1', () => {
      const w = new TdsWriter();
      w.writeUInt8(TokenType.ROW);
      w.writeUInt8(0x01); // columnStatus = has value
      w.writeBytes(intVal);
      const buf = w.toBuffer();
      expect(RowParser.read(buf, [col]).values[0]).toEqual(intVal);
    });
  });

  describe('read() – gemischte Spalten', () => {
    it('INT4 + VARCHAR in einer Zeile', () => {
      const intCol  = new DataFormat(DataType.INT4);
      const varCol  = new DataFormat(DataType.VARCHAR, { maxLength: 30 });
      const intVal  = Buffer.from([0x00, 0x00, 0x00, 0x05]);
      const strVal  = Buffer.from('hello', 'utf8');

      const w = new TdsWriter();
      w.writeUInt8(TokenType.ROW);
      w.writeBytes(intVal);       // fixed INT4
      w.writeUInt8(strVal.length); // varchar length
      w.writeBytes(strVal);

      const result = RowParser.read(w.toBuffer(), [intCol, varCol]);
      expect(result.values[0]).toEqual(intVal);
      expect(result.values[1]).toEqual(strVal);
    });
  });
});
