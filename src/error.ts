import { EedParser } from './protocol/response/eed-token';

/** Informational message from the server (EED with severity < 11, e.g. PRINT). */
export interface ServerMessage {
  number: number;
  severity: number;
  state: number;
  message: string;
  sqlState: string;
  serverName: string;
  procName: string;
  lineNumber: number;
}

/**
 * SybaseError – created from an EED token (server-side error).
 */
export class SybaseError extends Error {
  readonly errorNumber: number;
  readonly state: number;
  readonly severity: number;
  readonly serverName: string;
  readonly procName: string;
  readonly lineNumber: number;
  readonly sqlState: string;

  constructor(eed: EedParser) {
    super(eed.message);
    this.name        = 'SybaseError';
    this.errorNumber = eed.errorNumber;
    this.state       = eed.state;
    this.severity    = eed.severity;
    this.serverName  = eed.serverName;
    this.procName    = eed.procName;
    this.lineNumber  = eed.lineNumber;
    this.sqlState    = eed.sqlState;

    // Correct prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static toMessage(eed: EedParser): ServerMessage {
    return {
      number:     eed.errorNumber,
      severity:   eed.severity,
      state:      eed.state,
      message:    eed.message,
      sqlState:   eed.sqlState,
      serverName: eed.serverName,
      procName:   eed.procName,
      lineNumber: eed.lineNumber,
    };
  }
}
