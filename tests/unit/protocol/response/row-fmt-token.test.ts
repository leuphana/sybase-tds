import { RowFmtParser } from '../../../../src/protocol/response/row-fmt-token';
import { TokenType, DataType, RowStatus } from '../../../../src/constants/tds-const';
import { DataFormat } from '../../../../src/types/data-format';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

function makeRowFmt(columns: DataFormat[], tokenType = TokenType.ROWFMT): Buffer {
  const colBlocks = columns.map(c => c.build());
  const bodyLen   = 2 + colBlocks.reduce((s, b) => s + b.length, 0); // colCount(2) + blocks

  const w = new TdsWriter();
  w.writeUInt8(tokenType);
  w.writeUInt16BE(bodyLen);
  w.writeUInt16BE(columns.length);
  for (const b of colBlocks) w.writeBytes(b);
  return w.toBuffer();
}

describe('RowFmtParser', () => {
  describe('read() – ROWFMT (0xEE)', () => {
    it('0 Spalten → leeres columns-Array', () => {
      expect(RowFmtParser.read(makeRowFmt([])).columns).toHaveLength(0);
    });

    it('1 Spalte (INT4) korrekt', () => {
      const cols = [new DataFormat(DataType.INT4)];
      const result = RowFmtParser.read(makeRowFmt(cols));
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].dataType).toBe(DataType.INT4);
    });

    it('2 Spalten (INT4, VARCHAR) in korrekter Reihenfolge', () => {
      const cols = [
        new DataFormat(DataType.INT4),
        new DataFormat(DataType.VARCHAR, { maxLength: 50 }),
      ];
      const result = RowFmtParser.read(makeRowFmt(cols));
      expect(result.columns[0].dataType).toBe(DataType.INT4);
      expect(result.columns[1].dataType).toBe(DataType.VARCHAR);
    });

    it('Spaltenname wird korrekt geparst', () => {
      const cols = [new DataFormat(DataType.INT4, { name: 'user_id' })];
      expect(RowFmtParser.read(makeRowFmt(cols)).columns[0].name).toBe('user_id');
    });

    it('Status-Flags werden korrekt geparst', () => {
      const cols = [new DataFormat(DataType.VARCHAR, { maxLength: 30, status: RowStatus.NULLALLOWED })];
      expect(RowFmtParser.read(makeRowFmt(cols)).columns[0].status).toBe(RowStatus.NULLALLOWED);
    });

    it('VARCHAR maxLength wird korrekt geparst', () => {
      const cols = [new DataFormat(DataType.VARCHAR, { maxLength: 120 })];
      expect(RowFmtParser.read(makeRowFmt(cols)).columns[0].maxLength).toBe(120);
    });

    it('DECN precision und scale werden korrekt geparst', () => {
      const cols = [new DataFormat(DataType.DECN, { precision: 12, scale: 4 })];
      const result = RowFmtParser.read(makeRowFmt(cols));
      expect(result.columns[0].precision).toBe(12);
      expect(result.columns[0].scale).toBe(4);
    });

    it('TEXT maxLength (4 Bytes) korrekt', () => {
      const cols = [new DataFormat(DataType.TEXT, { maxLength: 2147483647 })];
      expect(RowFmtParser.read(makeRowFmt(cols)).columns[0].maxLength).toBe(2147483647);
    });
  });

  describe('read() – ROWFMT2 (0x61)', () => {
    it('tokenType ROWFMT2 wird akzeptiert', () => {
      const cols = [new DataFormat(DataType.INT4)];
      const result = RowFmtParser.read(makeRowFmt(cols, TokenType.ROWFMT2));
      expect(result.columns[0].dataType).toBe(DataType.INT4);
    });
  });
});
