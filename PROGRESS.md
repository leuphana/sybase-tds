# node-sybase – Entwicklungsfortschritt

TDS 5.0 Sybase ASE Datenbanktreiber für Node.js/TypeScript.
Implementierung nach dem **Cleanroom-Prinzip** ausschließlich auf Basis der Markdown-Dokumentation.

---

## Phasen-Übersicht

| Phase | Titel | Status |
|-------|-------|--------|
| 0 | Fortschrittsdokumentation anlegen | ✅ Abgeschlossen |
| 1 | Fundament (Protokoll-Kern) | ✅ Abgeschlossen |
| 2 | Client→Server Tokens | ✅ Abgeschlossen |
| 3 | Server→Client Tokens (Response-Parser) | ✅ Abgeschlossen |
| 4 | Typ-System | ✅ Abgeschlossen |
| 5 | High-Level API | ✅ Abgeschlossen |
| 6 | Projektdokumentation | ✅ Abgeschlossen |

---

## Phase 0 – Fortschrittsdokumentation ✅

- [x] PROGRESS.md erstellt

---

## Phase 1 – Fundament (Protokoll-Kern) ✅

Reihenfolge: Tests zuerst, dann Implementierung (TDD).

- [x] Projekt-Setup (`package.json`, `tsconfig.json`, `tsconfig.test.json`, `jest.config.js`)
- [x] `src/constants/tds-const.ts` – alle Konstanten/Enums (PduType, TokenType, DataType, ...)
- [x] `src/protocol/tds-writer.ts` – binärer Schreiber (BE/LE-aware, writeStringLen)
- [x] `src/protocol/tds-reader.ts` – binärer Leser (Roundtrip-geprüft)
- [x] `src/protocol/tds-packet.ts` – Netzwerk-Header-Modell (8 Bytes, toBuffer/fromBuffer)
- [x] `src/protocol/tds-socket.ts` – TCP-Socket + Packet-Framing (Splittung + Assemblierung)

**Testergebnis: 115/115 Tests grün**

---

## Phase 2 – Client→Server Tokens ✅

**Testergebnis: 356/356 Tests grün**

- [x] `src/protocol/tokens/login-token.ts` – 568-Byte Login-Body + 8-Byte Header
- [x] `src/protocol/tokens/capability-token.ts` – Request/Response Bit-Masken (14+10 Bytes)
- [x] `src/protocol/tokens/language-token.ts` – einfache SQL-Query (LANGUAGE 0x21)
- [x] `src/protocol/tokens/dynamic-token.ts` – Prepared Statements (DYNAMIC 0xE7 / DYNAMIC2 0x62)
- [x] `src/protocol/tokens/param-fmt-token.ts` – PARAMFMT (0xEC)
- [x] `src/protocol/tokens/params-token.ts` – PARAMS-Marker (0xD7)
- [x] `src/protocol/tokens/dbrpc-token.ts` – Stored Procedure Call (DBRPC 0xE6)
- [x] `src/protocol/tokens/cursor-tokens.ts` – CURDECLARE/CURDECLARE2/CURDECLARE3/CUROPEN/CURFETCH/CURCLOSE/CURDELETE/CURUPDATE/CURINFO/CURINFO3/KEY
- [x] `src/protocol/tokens/logout-token.ts` – LOGOUT (0x71)
- [x] `src/protocol/tokens/option-cmd-token.ts` – OPTIONCMD (0xA6)

---

## Phase 3 – Server→Client Tokens (Response-Parser) ✅

**Testergebnis: 447/447 Tests grün** (20 Suiten)

Neue Methode: `DataFormat.read(reader)` – Deserialisierung aus Wire-Format.

- [x] `src/protocol/response/login-ack.ts` – LoginAckParser: status, tdsVersion, programName/Version, succeeded()
- [x] `src/protocol/response/done-token.ts` – DoneParser: DONE/DONEPROC/DONEINPROC (9 Bytes), hasCount/isError/hasMore
- [x] `src/protocol/response/eed-token.ts` – EedParser: errorNumber, severity, sqlState, message, serverName, procName, lineNumber
- [x] `src/protocol/response/env-change-token.ts` – EnvChangeParser: entries[] mit type/newValue/oldValue (mehrere pro Token möglich)
- [x] `src/protocol/response/row-fmt-token.ts` – RowFmtParser: columns[] via DataFormat.read() (ROWFMT + ROWFMT2)
- [x] `src/protocol/response/row-token.ts` – RowParser: values[] als Buffer|null; fixe/variable Typen, COLUMNSTATUS, LARGE_TYPES
- [x] `src/protocol/response/token-parser.ts` – TokenParser (stateful Dispatcher): parse(Buffer) → TdsToken[]

---

## Phase 4 – Typ-System ✅

**Testergebnis: 542/542 Tests grün** (21 Suiten)

- [x] `src/types/data-format.ts` – DataFormat-Deskriptor (Spalten & Parameter)
- [x] `src/types/type-mapper.ts` – JS/TS ↔ TDS-Datentypen (alle 40+ Typen)

Abzudeckende TDS-Typen:
- Ganzzahlen: INT1, INT2, INT4, INT8, INTN, UINT2, UINT4, UINT8, UINTN
- Fließkomma: FLT4, FLT8, FLTN
- Dezimal: DECN, NUMN
- Geld: MONEY, SHORTMONEY, MONEYN
- Datum/Zeit: DATE, TIME, SHORTDATE, DATETIME, DATETIMN, DATEN, TIMEN, BIGDATETIMEN, BIGTIMEN
- Zeichenketten: CHAR, VARCHAR, TEXT, LONGCHAR, UNITEXT
- Binär: BIT, BINARY, VARBINARY, IMAGE, LONGBINARY, BLOB

---

## Phase 5 – High-Level API ✅

**Testergebnis: 595/595 Tests grün** (26 Suiten; 6 Integrationstests übersprungen, da kein SYBASE_TEST_HOST)

- [x] `src/error.ts` – `SybaseError` (aus EED-Token)
- [x] `src/connection.ts` – `connect()`, `query()`, `prepare()`, `cursor()`, `transaction()`, `end()`
- [x] `src/prepared-statement.ts` – PREPARE → n×EXECUTE → DEALLOCATE
- [x] `src/cursor.ts` – CURDECLARE + CUROPEN + CURFETCH + CURCLOSE
- [x] `src/transaction.ts` – `begin()`, `commit()`, `rollback()`
- [x] `src/connection-pool.ts` – `acquire()`, `release()`, Idle-Timeout, Waiter-Queue
- [x] `tests/unit/mock-socket.ts` – Gemeinsamer Test-Helfer (MockSocket + Token-Hilfsfunktionen)
- [x] `tests/unit/connection.test.ts`
- [x] `tests/unit/prepared-statement.test.ts`
- [x] `tests/unit/cursor.test.ts`
- [x] `tests/unit/transaction.test.ts`
- [x] `tests/unit/connection-pool.test.ts`
- [x] `tests/integration/connection.test.ts` (skipbar via `SYBASE_TEST_HOST`)

---

## Phase 6 – Projektdokumentation ✅

- [x] `README.md` – Übersicht, Installation, Quickstart
- [x] `docs/ARCHITECTURE.md` – Schichtenmodell, Klassen-Interaktionen, Datenfluss
- [x] `docs/PROTOCOL.md` – TDS 5.0 Protokoll-Zusammenfassung
- [x] `docs/API.md` – Vollständige Public-API-Referenz
- [x] `docs/TYPEORM.md` – Hinweise zur TypeORM-Integration (separates Paket)
- [x] `CHANGELOG.md` – Initiale Version 0.1.0

---

## Projektstruktur

```
node-sybase/
├── src/
│   ├── constants/
│   │   └── tds-const.ts
│   ├── protocol/
│   │   ├── tds-writer.ts
│   │   ├── tds-reader.ts
│   │   ├── tds-packet.ts
│   │   ├── tds-socket.ts
│   │   ├── tokens/
│   │   │   ├── login-token.ts
│   │   │   ├── capability-token.ts
│   │   │   ├── language-token.ts
│   │   │   ├── dynamic-token.ts
│   │   │   ├── param-fmt-token.ts
│   │   │   ├── params-token.ts
│   │   │   ├── dbrpc-token.ts
│   │   │   ├── cursor-tokens.ts
│   │   │   ├── logout-token.ts
│   │   │   └── option-cmd-token.ts
│   │   └── response/
│   │       ├── token-parser.ts
│   │       ├── login-ack.ts
│   │       ├── done-token.ts
│   │       ├── eed-token.ts
│   │       ├── env-change-token.ts
│   │       ├── row-fmt-token.ts
│   │       └── row-token.ts
│   ├── types/
│   │   ├── data-format.ts
│   │   └── type-mapper.ts
│   ├── connection.ts
│   ├── connection-pool.ts
│   ├── prepared-statement.ts
│   ├── cursor.ts
│   └── transaction.ts
├── tests/
│   ├── unit/
│   │   ├── protocol/
│   │   │   ├── tds-writer.test.ts
│   │   │   ├── tds-reader.test.ts
│   │   │   ├── tds-packet.test.ts
│   │   │   ├── tokens/
│   │   │   │   ├── login-token.test.ts
│   │   │   │   ├── capability-token.test.ts
│   │   │   │   ├── language-token.test.ts
│   │   │   │   ├── dynamic-token.test.ts
│   │   │   │   ├── param-fmt-token.test.ts
│   │   │   │   ├── cursor-tokens.test.ts
│   │   │   │   └── ...
│   │   │   └── response/
│   │   │       ├── token-parser.test.ts
│   │   │       ├── done-token.test.ts
│   │   │       ├── eed-token.test.ts
│   │   │       ├── row-fmt-token.test.ts
│   │   │       └── ...
│   │   └── types/
│   │       ├── data-format.test.ts
│   │       └── type-mapper.test.ts
│   └── integration/
│       └── connection.test.ts    # Skipbar via SYBASE_TEST_HOST env-Flag
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROTOCOL.md
│   ├── API.md
│   └── TYPEORM.md
├── README.md
├── CHANGELOG.md
├── package.json
├── tsconfig.json
└── jest.config.ts
```

---

## Klassen-Übersicht

| Klasse | Datei | Verantwortlichkeit |
|--------|-------|--------------------|
| `TdsConst` | `constants/tds-const.ts` | Alle Token-Codes, Typ-Codes, Flags als `const enum` |
| `TdsWriter` | `protocol/tds-writer.ts` | `writeUInt8/16/32/64`, `writeString(charset)`, Endianness-Flag |
| `TdsReader` | `protocol/tds-reader.ts` | Spiegelbildlich zu `TdsWriter`, liest aus `Buffer` |
| `TdsPacket` | `protocol/tds-packet.ts` | Modell für 8-Byte-Header + Body; serialisiert/deserialisiert |
| `TdsSocket` | `protocol/tds-socket.ts` | TCP-Socket-Wrapper; teilt Byte-Stream in TDS-Pakete; Async-Iterator |
| `LoginToken` | `protocol/tokens/login-token.ts` | Serialisiert 568-Byte Login-Body + Capability |
| `CapabilityToken` | `protocol/tokens/capability-token.ts` | Bit-Masken für REQ/RES-Capabilities |
| `LanguageToken` | `protocol/tokens/language-token.ts` | Einfache SQL-Query (LANGUAGE 0x21) |
| `DynamicToken` | `protocol/tokens/dynamic-token.ts` | Prepare/Execute/Dealloc (DYNAMIC / DYNAMIC2) |
| `ParamFmtToken` | `protocol/tokens/param-fmt-token.ts` | PARAMFMT / PARAMFMT2 Serialisierung |
| `ParamsToken` | `protocol/tokens/params-token.ts` | PARAMS-Marker + rohe Parameterdaten |
| `DbrpcToken` | `protocol/tokens/dbrpc-token.ts` | Stored Procedure Call (DBRPC 0xE6) |
| `CursorTokens` | `protocol/tokens/cursor-tokens.ts` | Alle Cursor-Token (Declare/Open/Fetch/Close/Update/Delete/Info) |
| `LogoutToken` | `protocol/tokens/logout-token.ts` | Verbindungsende (LOGOUT 0x71) |
| `OptionCmdToken` | `protocol/tokens/option-cmd-token.ts` | Server-Optionen (OPTIONCMD 0xA6) |
| `TokenParser` | `protocol/response/token-parser.ts` | Dispatch-Schleife: liest Token-Byte, delegiert an Unter-Parser |
| `LoginAckParser` | `protocol/response/login-ack.ts` | LOGINACK (0xAD) parsen |
| `DoneTokenParser` | `protocol/response/done-token.ts` | DONE/DONEPROC/DONEINPROC parsen |
| `EedTokenParser` | `protocol/response/eed-token.ts` | Fehlermeldungen parsen → `SybaseError` werfen |
| `EnvChangeParser` | `protocol/response/env-change-token.ts` | Umgebungsänderungen parsen |
| `RowFmtParser` | `protocol/response/row-fmt-token.ts` | Spalten-Metadaten → `ColumnMetadata[]` |
| `RowParser` | `protocol/response/row-token.ts` | Datenzeilen → JS-Objekte |
| `DataFormat` | `types/data-format.ts` | Typ-Deskriptor: TDS-Typ, Länge, Precision, Scale, Nullable |
| `TypeMapper` | `types/type-mapper.ts` | JS-Wert → TDS-Bytes; TDS-Bytes → JS-Wert |
| `Connection` | `connection.ts` | `connect()`, `query()`, `prepare()`, `cursor()`, `end()` |
| `PreparedStatement` | `prepared-statement.ts` | Lifecycle: Prepare → n×Execute → Deallocate |
| `Cursor` | `cursor.ts` | `open()`, `fetch(n)`, `close()` mit Scrolling-Unterstützung |
| `Transaction` | `transaction.ts` | `begin()`, `commit()`, `rollback()` |
| `ConnectionPool` | `connection-pool.ts` | `acquire()`, `release()`, Min/Max-Pool-Größe, Idle-Timeout |

---

## Designentscheidungen

- **Endianness**: TDS 5.0 nutzt standardmäßig Big-Endian. `TdsWriter`/`TdsReader` tragen ein `byteswap`-Flag für LE-Server.
- **String-Encoding**: Konfigurierbar per Verbindung (UTF-8 default); `TdsWriter.writeString()` übernimmt die Kodierung.
- **Kein Callback-API**: Ausschließlich `Promise`/`async-await`. Intern über Node.js `EventEmitter` auf Socket-Events.
- **Prepared Statements**: DYNAMIC-Token (≤32 KB) automatisch, DYNAMIC2 (>32 KB) transparent.
- **TypeORM-Kompatibilität**: Wird als **separates npm-Paket** `typeorm-sybase` implementiert — nicht Teil dieser Library.

---

## Quellen (Protokoll-Dokumentation)

| Datei | Inhalt |
|-------|--------|
| `TDS_LOGIN_PAKET.md` | TDS-Header (8 B), Login-Body (568 B), Byte-Order-Typen |
| `TDS_QUERY_PROTOKOLL.md` | LANGUAGE, DYNAMIC/2, PARAMFMT/2, PARAMS, DBRPC, Datentypen |
| `TDS_RESTLICHE_TOKENS.md` | Cursor-Tokens, CAPABILITY, Session-Management, Server-Antwort-Tokens |
