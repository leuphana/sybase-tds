import { DoneParser } from '../../../../src/protocol/response/done-token';
import { TokenType, DoneStatus } from '../../../../src/constants/tds-const';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

function makeDone(
  tokenType = TokenType.DONE,
  status = 0,
  tranState = 0,
  rowCount = 0,
): Buffer {
  const w = new TdsWriter();
  w.writeUInt8(tokenType);
  w.writeUInt16BE(status);
  w.writeUInt16BE(tranState);
  w.writeUInt32BE(rowCount);
  return w.toBuffer();
}

describe('DoneParser', () => {
  describe('read()', () => {
    it('tokenType = DONE (0xFD)', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE)).tokenType).toBe(TokenType.DONE);
    });

    it('tokenType = DONEPROC (0xFE)', () => {
      expect(DoneParser.read(makeDone(TokenType.DONEPROC)).tokenType).toBe(TokenType.DONEPROC);
    });

    it('tokenType = DONEINPROC (0xFF)', () => {
      expect(DoneParser.read(makeDone(TokenType.DONEINPROC)).tokenType).toBe(TokenType.DONEINPROC);
    });

    it('status-Flags korrekt', () => {
      const buf = makeDone(TokenType.DONE, DoneStatus.COUNT | DoneStatus.MORE);
      expect(DoneParser.read(buf).status).toBe(DoneStatus.COUNT | DoneStatus.MORE);
    });

    it('tranState korrekt', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE, 0, 2)).tranState).toBe(2);
    });

    it('rowCount korrekt', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE, DoneStatus.COUNT, 0, 42)).rowCount).toBe(42);
    });

    it('rowCount = 0 ohne COUNT-Flag', () => {
      expect(DoneParser.read(makeDone()).rowCount).toBe(0);
    });

    it('hasCount() ist true wenn COUNT-Flag gesetzt', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE, DoneStatus.COUNT, 0, 10)).hasCount()).toBe(true);
    });

    it('hasCount() ist false ohne COUNT-Flag', () => {
      expect(DoneParser.read(makeDone()).hasCount()).toBe(false);
    });

    it('isError() ist true wenn ERROR-Flag gesetzt', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE, DoneStatus.ERROR)).isError()).toBe(true);
    });

    it('hasMore() ist true wenn MORE-Flag gesetzt', () => {
      expect(DoneParser.read(makeDone(TokenType.DONE, DoneStatus.MORE)).hasMore()).toBe(true);
    });

    it('Gesamtpuffer = 9 Bytes', () => {
      expect(makeDone()).toHaveLength(9);
    });
  });
});
