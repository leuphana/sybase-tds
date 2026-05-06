/** TDS 5.0 protocol constants – derived from TDS_LOGIN_PAKET.md, TDS_QUERY_PROTOKOLL.md, TDS_RESTLICHE_TOKENS.md */

// ---------------------------------------------------------------------------
// PDU types (TDS network header byte 0)
// ---------------------------------------------------------------------------

export enum PduType {
  BUF_LANG    = 0x01,  // TDS 4.x raw SQL (legacy)
  BUF_LOGIN   = 0x02,
  BUF_RPC     = 0x03,
  BUF_ATTN    = 0x06,
  BUF_LOGOUT  = 0x0D,
  BUF_NORMAL  = 0x0F,  // TDS 5.0 token-based requests (LANGUAGE, DYNAMIC, cursor tokens, …)
}

// ---------------------------------------------------------------------------
// Packet status (TDS network header byte 1)
// ---------------------------------------------------------------------------

export enum PacketStatus {
  CONTINUE = 0x00,
  EOM      = 0x01,
}

// ---------------------------------------------------------------------------
// Token types: client → server
// ---------------------------------------------------------------------------

export enum TokenType {
  // SQL / Prepared Statements
  LANGUAGE   = 0x21,
  DYNAMIC    = 0xE7,
  DYNAMIC2   = 0x62,
  DBRPC      = 0xE6,
  PARAMFMT   = 0xEC,
  PARAMFMT2  = 0x20,
  PARAMS     = 0xD7,

  // Cursor operations
  CURDECLARE  = 0x86,
  CURDECLARE2 = 0x23,
  CURDECLARE3 = 0x10,
  CUROPEN     = 0x84,
  CURFETCH    = 0x82,
  CURCLOSE    = 0x80,
  CURDELETE   = 0x81,
  CURUPDATE   = 0x85,
  CURINFO     = 0x83,
  CURINFO3    = 0x88,

  // Session / Security
  CAPABILITY = 0xE2,
  MSG        = 0x65,
  OPTIONCMD  = 0xA6,
  LOGOUT     = 0x71,
  KEY        = 0xCA,

  // Server → Client
  LOGINACK    = 0xAD,
  DONE        = 0xFD,
  DONEPROC    = 0xFE,
  DONEINPROC  = 0xFF,
  EED         = 0xE5,
  ENVCHANGE   = 0xE3,
  ROWFMT      = 0xEE,
  ROWFMT2     = 0x61,
  ROW         = 0xD1,
  ALTFMT      = 0xA8,
  ALTROW      = 0xD3,
  RETURNSTATUS = 0x79,
  RETURNVALUE  = 0x7B,
  ORDERBY      = 0xEB,
  TABNAME      = 0xE9,
}

// ---------------------------------------------------------------------------
// TDS data types
// ---------------------------------------------------------------------------

export enum DataType {
  // Integers (fixed)
  INT1  = 0x30,
  INT2  = 0x34,
  INT4  = 0x38,
  INT8  = 0xBF,
  UINT2 = 0x41,
  UINT4 = 0x42,
  UINT8 = 0x43,
  BIT   = 0x32,

  // Integers (variable length)
  INTN  = 0x26,
  UINTN = 0x44,

  // Floating point (fixed)
  FLT4 = 0x3B,
  FLT8 = 0x3E,

  // Floating point (variable length)
  FLTN = 0x6D,

  // Decimal / Numeric
  DECN = 0x6A,
  NUMN = 0x6C,

  // Money types (fixed)
  MONEY      = 0x3C,
  SHORTMONEY = 0x7A,

  // Money types (variable length)
  MONEYN = 0x6E,

  // Date / Time (fixed)
  DATE      = 0x31,
  TIME      = 0x33,
  SHORTDATE = 0x3A,
  DATETIME  = 0x3D,

  // Date / Time (variable length)
  DATETIMN    = 0x6F,
  DATEN       = 0x7B,
  TIMEN       = 0x93,
  BIGDATETIMEN = 0xBB,
  BIGTIMEN    = 0xBC,

  // Character strings
  CHAR     = 0x2F,
  VARCHAR  = 0x27,
  TEXT     = 0x23,
  LONGCHAR = 0xAF,
  UNITEXT  = 0xAE,

  // Binary data
  BINARY     = 0x2D,
  VARBINARY  = 0x25,
  IMAGE      = 0x22,
  LONGBINARY = 0xE1,
  BLOB       = 0x24,
}

// ---------------------------------------------------------------------------
// Byte order types (negotiated during login)
// ---------------------------------------------------------------------------

export enum ByteOrder {
  INT4_BE    = 0x00,
  INT4_LE    = 0x01,
  INT2_BE    = 0x02,
  INT2_LE    = 0x03,
  FLT_BE     = 0x04,
  FLT_LE     = 0x0A,
  FLT4_BE    = 0x0C,
  FLT4_LE    = 0x0D,
  TWO_I4_BE  = 0x08,
  TWO_I4_LE  = 0x09,
  TWO_I2_BE  = 0x10,
  TWO_I2_LE  = 0x11,
}

// ---------------------------------------------------------------------------
// Security login flags (login body byte 514)
// ---------------------------------------------------------------------------

export enum SecLoginFlags {
  NONE        = 0x00,
  ENCRYPT     = 0x01,
  CHALLENGE   = 0x02,
  LABELS      = 0x04,
  APPDEFINED  = 0x08,
  SECSESSION  = 0x10,
  ENCRYPT2    = 0x20,
  ENCRYPT3    = 0x80,
  ALL_ENCRYPT = 0xA1,
}

// ---------------------------------------------------------------------------
// HA login flags (login body byte 516)
// ---------------------------------------------------------------------------

export enum HaLoginFlags {
  SESSION     = 0x01,
  RESUME      = 0x02,
  FAILOVERSRV = 0x04,
  REDIRECT    = 0x08,
  MIGRATE     = 0x10,
}

// ---------------------------------------------------------------------------
// DYNAMIC token – operation types
// ---------------------------------------------------------------------------

export enum DynamicOp {
  PREPARE    = 0x01,
  EXEC       = 0x02,
  DEALLOC    = 0x04,
  EXEC_IMMED = 0x08,
  ACK        = 0x20,
}

// ---------------------------------------------------------------------------
// DYNAMIC token – status flags
// ---------------------------------------------------------------------------

export enum DynamicStatus {
  HAS_ARGS          = 0x01,
  SUPPRESS_ROWFMT   = 0x02,
  BATCH_PARAMS      = 0x04,
  SUPPRESS_PARAMFMT = 0x08,
}

// ---------------------------------------------------------------------------
// LANGUAGE token – status flags
// ---------------------------------------------------------------------------

export enum LangStatus {
  HAS_ARGS    = 0x01,
  BATCH_PARAMS = 0x04,
}

// ---------------------------------------------------------------------------
// Parameter status flags (DataFormat block)
// ---------------------------------------------------------------------------

export enum ParamStatus {
  RETURN        = 0x01,
  COLUMNSTATUS  = 0x08,
  NULLALLOWED   = 0x20,
}

// ---------------------------------------------------------------------------
// Column status flags (ROWFMT DataFormat block)
// ---------------------------------------------------------------------------

export enum RowStatus {
  HIDDEN       = 0x01,
  KEY          = 0x02,
  VERSION      = 0x04,
  COLUMNSTATUS = 0x08,
  UPDATABLE    = 0x10,
  NULLALLOWED  = 0x20,
  IDENTITY     = 0x40,
}

// ---------------------------------------------------------------------------
// DONE token – status flags
// ---------------------------------------------------------------------------

export enum DoneStatus {
  MORE   = 0x01,
  ERROR  = 0x02,
  INXACT = 0x04,
  PROC   = 0x08,
  COUNT  = 0x10,
  ATTN   = 0x20,
  EVENT  = 0x40,
}

// ---------------------------------------------------------------------------
// LOGINACK – login status
// ---------------------------------------------------------------------------

export enum LoginAckStatus {
  SUCCEED           = 0x05,
  FAIL              = 0x06,
  NEGOTIATE         = 0x07,
  SECSESS_SUCCEED   = 0x85,
  SECSESS_FAIL      = 0x86,
  SECSESS_NEGOTIATE = 0x87,
}

// ---------------------------------------------------------------------------
// Cursor type flags
// ---------------------------------------------------------------------------

export enum CursorType {
  RDONLY         = 0x001,
  UPDATABLE      = 0x002,
  SENSITIVE      = 0x004,
  DYNAMIC        = 0x008,
  INSENSITIVE    = 0x020,
  SEMISENSITIVE  = 0x040,
  KEYSETDRIVEN   = 0x080,
  SCROLLABLE     = 0x100,
  RELLOCKSONCLOSE = 0x200,
}

// ---------------------------------------------------------------------------
// Cursor status flags (server response CURINFO)
// ---------------------------------------------------------------------------

export enum CursorStatus {
  IS_DECLARED    = 0x001,
  IS_OPEN        = 0x002,
  IS_CLOSED      = 0x004,
  IS_RDONLY      = 0x008,
  IS_UPDATABLE   = 0x010,
  IS_ROWCNT      = 0x020,
  IS_DALLOC      = 0x040,
  IS_SCROLLABLE  = 0x080,
  IS_IMPLICIT    = 0x100,
  IS_SENSITIVE   = 0x200,
  IS_INSENSITIVE = 0x400,
  IS_SEMISENSITIVE = 0x800,
  IS_KEYSETDRIVEN  = 0x1000,
}

// ---------------------------------------------------------------------------
// Cursor fetch types
// ---------------------------------------------------------------------------

export enum FetchType {
  NEXT  = 1,
  PREV  = 2,
  FIRST = 3,
  LAST  = 4,
  ABS   = 5,
  REL   = 6,
}

// ---------------------------------------------------------------------------
// CURINFO – commands
// ---------------------------------------------------------------------------

export enum CurInfoCmd {
  SETCURROWS = 1,
  INQUIRE    = 2,
  INFORM     = 3,
  LISTALL    = 4,
}

// ---------------------------------------------------------------------------
// ENVCHANGE – environment types
// ---------------------------------------------------------------------------

export enum EnvType {
  DB         = 1,
  LANG       = 2,
  CHARSET    = 3,
  PACKETSIZE = 4,
}

// ---------------------------------------------------------------------------
// OPTIONCMD – option IDs
// ---------------------------------------------------------------------------

export enum OptionId {
  TEXTSIZE       = 0x02,
  ROWCOUNT       = 0x05,
  ISOLATION      = 0x08,
  CHAINXACTS     = 0x19,
  QUOTED_IDENT   = 0x23,
  LOB_LOCATOR    = 0x31,
  ISOLATION_MODE = 0x34,
}

// ---------------------------------------------------------------------------
// MSG – types
// ---------------------------------------------------------------------------

export enum MsgType {
  SEC_ENCRYPT  = 1,
  SEC_LOGPWD   = 2,
  SEC_REMPWD   = 3,
  SEC_CHALLENGE = 4,
  SEC_RESPONSE = 5,
  SEC_OPAQUE   = 11,
  HAFAILOVER   = 12,
  EMPTY        = 13,
  SEC_ENCRYPT2 = 14,
  SEC_LOGPWD2  = 15,
  SEC_SUP_CIPHER = 16,
  MIG_REQ      = 17,
  MIG_SYNC     = 18,
  MIG_CONT     = 19,
  MIG_FAIL     = 21,
  SEC_REMPWD2  = 22,
  SEC_ENCRYPT3 = 30,
  SEC_LOGPWD3  = 31,
  DR_MAP       = 33,
  SEC_SYMKEY   = 34,
  SEC_ENCRYPT4 = 35,
}

// ---------------------------------------------------------------------------
// Aggregate function codes (ALTFMT)
// ---------------------------------------------------------------------------

export enum AltFunction {
  COUNT    = 75,
  SUM      = 77,
  AVG      = 79,
  MIN      = 81,
  MAX      = 82,
  COUNTBIG = 97,
}

// ---------------------------------------------------------------------------
// Fixed protocol values
// ---------------------------------------------------------------------------

export const TDS_VERSION = Buffer.from([0x05, 0x00, 0x00, 0x00]);
export const TDS_HEADER_SIZE    = 8;
export const LOGIN_BODY_SIZE    = 568;
export const DEFAULT_PACKET_SIZE = 512;
export const DEFAULT_PORT       = 5000;
export const DEFAULT_CHARSET    = 'utf8';
export const DEFAULT_LANGUAGE   = 'us_english';
export const PROGRAM_NAME       = 'node-sybase';
export const PROGRAM_NAME_MAX   = 10;
