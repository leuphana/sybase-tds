# Changelog

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
