import { EedParser } from '../../../../src/protocol/response/eed-token';
import { TokenType } from '../../../../src/constants/tds-const';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

function makeEed(opts: {
  errorNumber?: number;
  state?: number;
  severity?: number;
  sqlState?: string;
  status?: number;
  tranState?: number;
  message?: string;
  serverName?: string;
  procName?: string;
  lineNumber?: number;
} = {}): Buffer {
  const errorNumber = opts.errorNumber ?? 208;
  const state       = opts.state       ?? 1;
  const severity    = opts.severity    ?? 16;
  const sqlState    = opts.sqlState    ?? '';
  const status      = opts.status      ?? 0x00;
  const tranState   = opts.tranState   ?? 0;
  const message     = opts.message     ?? 'Object not found';
  const serverName  = opts.serverName  ?? 'srv';
  const procName    = opts.procName    ?? '';
  const lineNumber  = opts.lineNumber  ?? 1;

  const sqlStateBytes  = Buffer.from(sqlState,  'ascii');
  const messageBytes   = Buffer.from(message,   'utf8');
  const serverBytes    = Buffer.from(serverName,'ascii');
  const procBytes      = Buffer.from(procName,  'ascii');

  const bodyLen =
    4 + 1 + 1 +
    1 + sqlStateBytes.length +
    1 + 2 +
    2 + messageBytes.length +
    1 + serverBytes.length +
    1 + procBytes.length +
    2;

  const w = new TdsWriter();
  w.writeUInt8(TokenType.EED);
  w.writeUInt16BE(bodyLen);
  w.writeUInt32BE(errorNumber);
  w.writeUInt8(state);
  w.writeUInt8(severity);
  w.writeUInt8(sqlStateBytes.length);
  if (sqlStateBytes.length > 0) w.writeBytes(sqlStateBytes);
  w.writeUInt8(status);
  w.writeUInt16BE(tranState);
  w.writeUInt16BE(messageBytes.length);
  if (messageBytes.length > 0) w.writeBytes(messageBytes);
  w.writeUInt8(serverBytes.length);
  if (serverBytes.length > 0) w.writeBytes(serverBytes);
  w.writeUInt8(procBytes.length);
  if (procBytes.length > 0) w.writeBytes(procBytes);
  w.writeUInt16BE(lineNumber);
  return w.toBuffer();
}

describe('EedParser', () => {
  describe('read()', () => {
    it('errorNumber korrekt', () => {
      expect(EedParser.read(makeEed({ errorNumber: 208 })).errorNumber).toBe(208);
    });

    it('state korrekt', () => {
      expect(EedParser.read(makeEed({ state: 3 })).state).toBe(3);
    });

    it('severity korrekt', () => {
      expect(EedParser.read(makeEed({ severity: 11 })).severity).toBe(11);
    });

    it('sqlState korrekt (leer)', () => {
      expect(EedParser.read(makeEed({ sqlState: '' })).sqlState).toBe('');
    });

    it('sqlState korrekt (nicht leer)', () => {
      expect(EedParser.read(makeEed({ sqlState: 'S0002' })).sqlState).toBe('S0002');
    });

    it('message korrekt', () => {
      expect(EedParser.read(makeEed({ message: 'Object not found' })).message).toBe('Object not found');
    });

    it('serverName korrekt', () => {
      expect(EedParser.read(makeEed({ serverName: 'myserver' })).serverName).toBe('myserver');
    });

    it('procName leer wenn nicht in Prozedur', () => {
      expect(EedParser.read(makeEed({ procName: '' })).procName).toBe('');
    });

    it('procName korrekt wenn gesetzt', () => {
      expect(EedParser.read(makeEed({ procName: 'sp_test' })).procName).toBe('sp_test');
    });

    it('lineNumber korrekt', () => {
      expect(EedParser.read(makeEed({ lineNumber: 42 })).lineNumber).toBe(42);
    });

    it('tranState korrekt', () => {
      expect(EedParser.read(makeEed({ tranState: 2 })).tranState).toBe(2);
    });

    it('isError() ist true bei severity >= 11', () => {
      expect(EedParser.read(makeEed({ severity: 16 })).isError()).toBe(true);
    });

    it('isError() ist false bei severity <= 10', () => {
      expect(EedParser.read(makeEed({ severity: 10 })).isError()).toBe(false);
    });
  });
});
