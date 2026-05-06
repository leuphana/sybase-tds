# TDS 5.0 Protocol Summary

Compact reference for the Sybase ASE wire protocol as implemented in this driver.

## Packet structure

Every TDS message consists of one or more 8-byte-header packets:

```
Byte 0:   PDU type  (0x01 BUF_LANG, 0x02 BUF_LOGIN, 0x03 BUF_RPC, 0x0D BUF_LOGOUT)
Byte 1:   Status    (0x01 = last packet / EOM)
Byte 2-3: Total length including header (Big-Endian)
Byte 4-5: Channel   (always 0x0000)
Byte 6:   Sequence number (starting at 1)
Byte 7:   Window    (always 0x00)
Byte 8+:  Body
```

Large messages are split into multiple packets; `TdsSocket` reassembles them transparently.

## Login sequence

```
Client → Server:  BUF_LOGIN  [LoginBody 568 B][CapabilityToken]
Server → Client:  LOGINACK   [status][tdsVersion][serverName][progVersion]
                  DONE
```

`LoginBody` (568 bytes) contains username, password, charset, language, byte-order flags, TDS version (`0x05 0x00 0x00 0x00`), and packet size as ASCII.

The `byteswap` flag in LoginBody tells the server whether the client uses LE (`lint4=1`) or BE (`lint4=0`) integers.

## Simple query

```
Client → Server:  BUF_LANG   [LANGUAGE token]
Server → Client:  [ROWFMT]   column metadata
                  [ROW] × n  data rows
                  DONE       rowCount
```

LANGUAGE token: `[0x21][bodyLen(4 BE)][status(1)][SQL text]`

## Prepared statements

### Prepare
```
Client → Server:  BUF_LANG   [DYNAMIC(PREPARE)][PARAMFMT]
Server → Client:  DONE
```

### Execute
```
Client → Server:  BUF_LANG   [DYNAMIC(EXEC)][PARAMS marker][param bytes]
Server → Client:  [ROWFMT][ROW × n][DONE]
```

### Deallocate
```
Client → Server:  BUF_LANG   [DYNAMIC(DEALLOC)]
Server → Client:  DONE
```

DYNAMIC token: `[0xE7][totalLen(2)][op(1)][status(1)][nameLen(1)][name][sqlLen(2)][sql]`  
DYNAMIC2 uses 4-byte length fields for statements > 32 KB.

## Cursor lifecycle

```
Client → Server:  CURDECLARE + CUROPEN    (declare SQL + open cursor)
Server → Client:  DONE

Client → Server:  CURFETCH               (fetch N rows)
Server → Client:  ROWFMT + ROW × n + DONE

Client → Server:  CURCLOSE               (close + deallocate)
Server → Client:  DONE
```

## Server response tokens

| Token | Hex | Purpose |
|-------|-----|---------|
| LOGINACK | 0xAD | Login result (succeeded/failed) |
| DONE | 0xFD | Command complete + rowCount |
| DONEPROC | 0xFE | Stored procedure complete |
| DONEINPROC | 0xFF | Subcommand complete |
| EED | 0xE5 | Error/extended error message |
| ENVCHANGE | 0xE3 | Server environment change (DB, charset) |
| ROWFMT | 0xEE | Column metadata |
| ROWFMT2 | 0x61 | Column metadata (extended) |
| ROW | 0xD1 | Data row |

## DataFormat wire layout

Each column/parameter descriptor in ROWFMT / PARAMFMT:

```
[nameLen(1)][name(n)][status(1)][userType(4 BE)][dataType(1)][lengthField(0–4)][localeLen(1)][locale(n)]
```

Length field size by type:
- 0 bytes: INT1/2/4/8, BIT, FLT4/8, MONEY, DATE, TIME, DATETIME, SHORTDATE, UINT2/4/8, SHORTMONEY
- 1 byte: VARCHAR, CHAR, BINARY, VARBINARY, INTN, UINTN, FLTN, MONEYN, DATETIMN, DATEN, TIMEN
- 3 bytes (maxLen + precision + scale): DECN, NUMN
- 2 bytes (maxLen + scale): BIGDATETIMEN, BIGTIMEN
- 4 bytes: TEXT, IMAGE, UNITEXT, LONGCHAR, LONGBINARY

## ROW data encoding

Each column in a ROW token:
- **Fixed type, no COLUMNSTATUS flag**: `[value bytes]`
- **Fixed type, with COLUMNSTATUS (status & 0x08)**: `[colStatus(1)][value bytes if colStatus≠0]`
- **Variable type (large: TEXT/IMAGE/UNITEXT/LONGCHAR/LONGBINARY)**: `[len(4 BE)][bytes]`
- **Variable type (others)**: `[len(1)][bytes]` — len=0 means NULL

## DECN / NUMN wire format

`[sign(1)][magnitude LE bytes]` where sign=0x00 is positive, 0x01 is negative. Magnitude bytes = `ceil(precision/9) × 4`.

## MONEY wire format

8 bytes: `[highINT32 LE][lowUINT32 LE]` — value = (high<<32 | low) / 10000

SHORTMONEY: 4 bytes INT32 LE — value = bytes / 10000

## DATE / TIME base

Date base: January 1, 1900 UTC  
DATE: days since base as UINT32 LE  
TIME: 1/300-second ticks since midnight as UINT32 LE  
DATETIME: `[INT32 LE days][UINT32 LE ticks]`  
SHORTDATE: `[UINT16 LE days][UINT16 LE minutes]`
