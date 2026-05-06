import { LoginAckStatus } from '../../constants/tds-const';
import { TdsReader } from '../tds-reader';

export interface LoginAckData {
  status: number;
  tdsVersion: Buffer;
  programName: string;
  programVersion: Buffer;
  succeeded(): boolean;
}

export class LoginAckParser implements LoginAckData {
  readonly status: number;
  readonly tdsVersion: Buffer;
  readonly programName: string;
  readonly programVersion: Buffer;

  private constructor(
    status: number,
    tdsVersion: Buffer,
    programName: string,
    programVersion: Buffer,
  ) {
    this.status         = status;
    this.tdsVersion     = tdsVersion;
    this.programName    = programName;
    this.programVersion = programVersion;
  }

  succeeded(): boolean {
    return this.status === LoginAckStatus.SUCCEED ||
           this.status === LoginAckStatus.SECSESS_SUCCEED;
  }

  /**
   * Parses a LOGINACK buffer (first byte = 0xAD).
   * Layout: [0xAD][bodyLen(2)][status(1)][tdsVer(4)][nameLen(1)][name][progVer(4)]
   */
  static read(buf: Buffer, encoding: BufferEncoding = 'utf8'): LoginAckParser {
    const r = new TdsReader(buf);
    r.readUInt8();              // token type
    r.readUInt16BE();           // body length (not needed for sequential reading)
    const status      = r.readUInt8();
    const tdsVersion  = r.readBytes(4);
    const nameLen     = r.readUInt8();
    const programName = nameLen > 0 ? r.readString(nameLen, encoding) : '';
    const programVersion = r.readBytes(4);

    return new LoginAckParser(status, tdsVersion, programName, programVersion);
  }
}
