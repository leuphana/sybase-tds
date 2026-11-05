# Changelog

## Unreleased

Hardening from the code review of 2026-11-05 (see `SYBASE_TODO.md`, section "Code-Review 2026-11-05").

### Fixed
- Variable-length parameters longer than 255 bytes were silently corrupted (1-byte length). They now throw; LONGCHAR/LONGBINARY use a 4-byte length (K1).
- MONEYN/DATETIMN/DATEN/TIMEN parameters were encoded little-endian although the server and `decode()` use big-endian – every `Date` parameter was affected (K2).
- RETURNSTATUS (0x79) was parsed as a length-prefixed token, breaking every stored procedure call; PARAMFMT/PARAMS from the server (output parameters) are now parsed (K3).
- Concurrent requests on one connection interleaved on the wire; requests are now queued (K4).
- `ConnectionPool` could exceed `max` under concurrent `acquire()`.
- A server error no longer aborts reading the response mid-stream; the error is thrown after the final DONE, so the connection stays in sync (H10).
- TIME parameters lost milliseconds; DATE before 1900 decoded wrongly; MONEY went through floating point (M12).
- `null` for a fixed-length type (e.g. INT4) was sent as 0; it now throws.
- `cursor.fetch(count)` ignored `count` (M13).
- Receiving large results used O(n²) buffer concatenation (M14).

### Added
- `ConnectOptions`: `database`, `appName`, `connectTimeout`, `requestTimeout` (cancels via ATTENTION), `keepAlive`, `tls`.
- `conn.query(sql, params)` with server-side parameter binding (M15).
- `QueryResult.resultSets`, `.messages` (PRINT/info), `.returnStatus`, `.outputParams`.
- `conn.isClosed`, `conn.inTransaction`, `conn.database`, `conn.encoding`, `conn.destroy()`.
- Server charset (ENVCHANGE) selects the string encoding (utf8, iso_1, ascii_7); unsupported charsets fail loudly. Negotiated packet size is applied (H9, M14).
- Pool: health check on acquire/release, rollback of open transactions on release, `min`, `acquireTimeout`, stats getters (H7).
- Cursor: `open(values)` with parameters, `isDone`.
- `TdsTimeoutError`, `ServerMessage`, `inferFormat` exports.

### Changed
- `byteswap: true` now throws – little-endian sessions never worked (K5).
- Default requested packet size is 2048 (sending starts at 512 until the server confirms).
- `pool.release()` returns a Promise (never rejects).
- `QueryResult.rows`/`columns` refer to the first result set instead of all rows mixed under the last result set's columns; `rowCount` prefers DONE tokens with DONE_COUNT.
- `npm test` runs unit tests only; integration tests need `npm run test:integration` (they used to run against the host in `.env` automatically).

## 0.1.0 — 2026-05-06

Initial release.

### Added

**Phase 1 – Protocol foundation**
- `TdsWriter` / `TdsReader` — binary I/O with BE/LE awareness
- `TdsPacket` — 8-byte network header model
- `TdsSocket` — TCP framing (split + reassemble); injectable `RawSocket` interface

**Phase 2 – Client→Server tokens**
- `LoginToken` — 568-byte login body
- `CapabilityToken` — request/response capability bit masks
- `LanguageToken` — plain SQL query (LANGUAGE 0x21)
- `DynamicToken` — prepared statements (DYNAMIC 0xE7 / DYNAMIC2 0x62)
- `ParamFmtToken` — PARAMFMT (0xEC)
- `ParamsToken` — PARAMS marker (0xD7)
- `DbrpcToken` — stored procedure call (DBRPC 0xE6)
- `CursorTokens` — CURDECLARE / CUROPEN / CURFETCH / CURCLOSE / CURDELETE / CURUPDATE / CURINFO / CURINFO3 / KEY
- `LogoutToken` — LOGOUT (0x71)
- `OptionCmdToken` — OPTIONCMD (0xA6)

**Phase 3 – Server→Client response parsers**
- `LoginAckParser` — login result
- `DoneParser` — DONE / DONEPROC / DONEINPROC
- `EedParser` — server error messages
- `EnvChangeParser` — environment change notifications
- `RowFmtParser` — column metadata via `DataFormat.read()`
- `RowParser` — raw data row bytes
- `TokenParser` — stateful dispatcher for all response tokens

**Phase 4 – Type system**
- `DataFormat` — column/parameter descriptor; serializes and deserializes wire format
- `TypeMapper` — converts `Buffer|null` ↔ `JsValue` for all 40+ TDS data types

**Phase 5 – High-level API**
- `Connection` — `connect()`, `query()`, `prepare()`, `cursor()`, `transaction()`, `end()`
- `PreparedStatement` — PREPARE → EXECUTE → DEALLOCATE lifecycle
- `Cursor` — CURDECLARE + CUROPEN + CURFETCH + CURCLOSE
- `Transaction` — BEGIN / COMMIT / ROLLBACK via SQL
- `ConnectionPool` — idle pool, waiter queue, idle timeout, `acquire()` / `release()` / `end()`
- `SybaseError` — typed error wrapping EED server messages

**Phase 6 – Documentation**
- `README.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/API.md`, `docs/TYPEORM.md`
