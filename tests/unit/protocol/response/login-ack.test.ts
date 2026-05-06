import { LoginAckParser, LoginAckData } from '../../../../src/protocol/response/login-ack';
import { TokenType, LoginAckStatus } from '../../../../src/constants/tds-const';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

/** Hilfsfunktion: baut einen validen LOGINACK-Buffer */
function makeLoginAck(
  status = LoginAckStatus.SUCCEED,
  tdsVersion = Buffer.from([0x05, 0x00, 0x00, 0x00]),
  programName = 'ASE',
  programVersion = Buffer.from([0x0F, 0x00, 0x00, 0x00]),
): Buffer {
  const nameBytes = Buffer.from(programName, 'utf8');
  const bodyLen = 1 + 4 + 1 + nameBytes.length + 4;

  const w = new TdsWriter();
  w.writeUInt8(TokenType.LOGINACK);
  w.writeUInt16BE(bodyLen);
  w.writeUInt8(status);
  w.writeBytes(tdsVersion);
  w.writeUInt8(nameBytes.length);
  w.writeBytes(nameBytes);
  w.writeBytes(programVersion);
  return w.toBuffer();
}

describe('LoginAckParser', () => {
  describe('read()', () => {
    it('gibt status korrekt zurück', () => {
      const buf = makeLoginAck(LoginAckStatus.SUCCEED);
      expect(LoginAckParser.read(buf).status).toBe(LoginAckStatus.SUCCEED);
    });

    it('status FAIL wird erkannt', () => {
      expect(LoginAckParser.read(makeLoginAck(LoginAckStatus.FAIL)).status).toBe(LoginAckStatus.FAIL);
    });

    it('TDS-Version korrekt', () => {
      const ver = Buffer.from([0x05, 0x00, 0x00, 0x00]);
      expect(LoginAckParser.read(makeLoginAck(LoginAckStatus.SUCCEED, ver)).tdsVersion).toEqual(ver);
    });

    it('Programmname korrekt', () => {
      expect(LoginAckParser.read(makeLoginAck()).programName).toBe('ASE');
    });

    it('Programmname leer möglich', () => {
      expect(LoginAckParser.read(makeLoginAck(LoginAckStatus.SUCCEED, Buffer.from([0x05, 0, 0, 0]), '')).programName).toBe('');
    });

    it('Programmversion korrekt', () => {
      const pv = Buffer.from([0x10, 0x01, 0x00, 0x00]);
      expect(LoginAckParser.read(makeLoginAck(LoginAckStatus.SUCCEED, Buffer.from([0x05, 0, 0, 0]), 'ASE', pv)).programVersion).toEqual(pv);
    });

    it('succeeded() ist true bei Status SUCCEED', () => {
      expect(LoginAckParser.read(makeLoginAck()).succeeded()).toBe(true);
    });

    it('succeeded() ist false bei Status FAIL', () => {
      expect(LoginAckParser.read(makeLoginAck(LoginAckStatus.FAIL)).succeeded()).toBe(false);
    });
  });
});
