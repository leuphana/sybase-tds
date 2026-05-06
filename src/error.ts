import { EedParser } from './protocol/response/eed-token';

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

  constructor(eed: EedParser) {
    super(eed.message);
    this.name        = 'SybaseError';
    this.errorNumber = eed.errorNumber;
    this.state       = eed.state;
    this.severity    = eed.severity;
    this.serverName  = eed.serverName;
    this.procName    = eed.procName;
    this.lineNumber  = eed.lineNumber;

    // Correct prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
