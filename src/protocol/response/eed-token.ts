import { TdsReader } from '../tds-reader';

export class EedParser {
  readonly errorNumber: number;
  readonly state: number;
  readonly severity: number;
  readonly sqlState: string;
  readonly status: number;
  readonly tranState: number;
  readonly message: string;
  readonly serverName: string;
  readonly procName: string;
  readonly lineNumber: number;

  private constructor(
    errorNumber: number, state: number, severity: number,
    sqlState: string, status: number, tranState: number,
    message: string, serverName: string, procName: string, lineNumber: number,
  ) {
    this.errorNumber = errorNumber;
    this.state       = state;
    this.severity    = severity;
    this.sqlState    = sqlState;
    this.status      = status;
    this.tranState   = tranState;
    this.message     = message;
    this.serverName  = serverName;
    this.procName    = procName;
    this.lineNumber  = lineNumber;
  }

  isError(): boolean { return this.severity >= 11; }

  /**
   * Layout:
   * [0xE5][bodyLen(2)][errorNum(4)][state(1)][severity(1)]
   * [sqlStateLen(1)][sqlState][status(1)][tranState(2)]
   * [msgLen(2)][message][serverNameLen(1)][serverName]
   * [procNameLen(1)][procName][lineNumber(2)]
   */
  static read(
    buf: Buffer,
    encoding: BufferEncoding = 'utf8',
  ): EedParser {
    const r = new TdsReader(buf);
    r.readUInt8();    // token type
    r.readUInt16BE(); // body length

    const errorNumber    = r.readUInt32BE();
    const state          = r.readUInt8();
    const severity       = r.readUInt8();

    const sqlStateLen    = r.readUInt8();
    const sqlState       = sqlStateLen > 0 ? r.readString(sqlStateLen, 'ascii') : '';

    const status         = r.readUInt8();
    const tranState      = r.readUInt16BE();

    const msgLen         = r.readUInt16BE();
    const message        = msgLen > 0 ? r.readString(msgLen, encoding) : '';

    const serverNameLen  = r.readUInt8();
    const serverName     = serverNameLen > 0 ? r.readString(serverNameLen, 'ascii') : '';

    const procNameLen    = r.readUInt8();
    const procName       = procNameLen > 0 ? r.readString(procNameLen, 'ascii') : '';

    const lineNumber     = r.readUInt16BE();

    return new EedParser(
      errorNumber, state, severity, sqlState, status, tranState,
      message, serverName, procName, lineNumber,
    );
  }
}
