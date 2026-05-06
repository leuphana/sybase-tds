# Architecture

## Layer overview

```
┌─────────────────────────────────────────────┐
│  Public API                                  │
│  Connection · PreparedStatement · Cursor     │
│  Transaction · ConnectionPool                │
├─────────────────────────────────────────────┤
│  Type System                                 │
│  DataFormat · TypeMapper                     │
├─────────────────────────────────────────────┤
│  Protocol Layer – Response Parsers           │
│  TokenParser · LoginAckParser · DoneParser   │
│  EedParser · EnvChangeParser · RowFmtParser  │
│  RowParser                                   │
├─────────────────────────────────────────────┤
│  Protocol Layer – Token Builders             │
│  LoginToken · CapabilityToken                │
│  LanguageToken · DynamicToken                │
│  ParamFmtToken · ParamsToken · DbrpcToken    │
│  CursorTokens · LogoutToken · OptionCmdToken │
├─────────────────────────────────────────────┤
│  Network / Framing                           │
│  TdsSocket · TdsPacket                       │
├─────────────────────────────────────────────┤
│  Binary I/O                                  │
│  TdsWriter · TdsReader                       │
├─────────────────────────────────────────────┤
│  Constants                                   │
│  tds-const.ts (enums/flags)                 │
└─────────────────────────────────────────────┘
```

## Key classes

### Network layer

**`TdsSocket`** wraps a raw TCP socket (`net.Socket`). It handles:
- Splitting outgoing data into TDS packets (8-byte header + body)
- Reassembling incoming packets into complete TDS messages
- Promise-based `send()` / `receive()` API

**`TdsPacket`** models a single TDS network packet.  
**`TdsWriter`** / **`TdsReader`** are symmetric binary helpers (BE/LE-aware).

### Protocol layer

**Token Builders** (client → server): each class has a static `build()` that returns a `Buffer`.  
**Response Parsers** (server → client): each class has a static `read()` that takes a `Buffer` and returns a typed object.

**`TokenParser`** is a stateful dispatcher. It reads a message body, dispatches by token-type byte, and returns a `TdsToken[]` discriminated union. It maintains `_columns` state across ROWFMT → ROW pairs.

### Type system

**`DataFormat`** is shared between client (PARAMFMT) and server (ROWFMT). It holds type code, length, precision/scale, locale, etc., and can both serialize (`build()`) and deserialize (`DataFormat.read()`).

**`TypeMapper`** converts between `Buffer | null` (raw wire bytes) and `JsValue` (JS primitives). It respects the `byteswap` flag for platforms with different byte order.

### Public API

**`Connection`** orchestrates TdsSocket + login + token building + response parsing:
- `connect()` — static factory; sends LOGIN + CAPABILITY, checks LOGINACK
- `query()` — sends LANGUAGE token, collects results
- `_collectResult()` — loops on `receive()` until done with `!hasMore()`
- `prepare()` / `cursor()` / `transaction()` — factory methods for sub-objects

**`PreparedStatement`**: stateful lifecycle — PREPARE sends DYNAMIC + PARAMFMT; EXECUTE sends DYNAMIC + PARAMS + param bytes; DEALLOC sends DYNAMIC.

**`Cursor`**: CURDECLARE + CUROPEN → CURFETCH (repeated) → CURCLOSE.

**`Transaction`**: thin wrapper — sends `BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK` via `connection.query()`.

**`ConnectionPool`**: manages idle/active connection lists, idle timers, and a waiter queue for when max is reached.

## Data flow: `connection.query('SELECT ...')`

```
User calls: conn.query(sql)
  │
  ├─ LanguageToken.build(sql) → Buffer
  ├─ TdsSocket.send(BUF_LANG, buffer)
  │     └─ splits into TDS packets, writes to TCP
  │
  ├─ TdsSocket.receive() → TdsMessage { data: Buffer }
  │     └─ assembles packets from TCP
  │
  ├─ TokenParser.parse(data) → TdsToken[]
  │     ├─ 'rowFmt' → update columns
  │     ├─ 'row'    → raw values (Buffer|null)[]
  │     └─ 'done'   → rowCount, hasMore()
  │
  ├─ TypeMapper.decode(column, rawValue) → JsValue (per cell)
  │
  └─ return QueryResult { columns, rows, rowCount }
```

## Dependency injection for testing

`Connection.connect()` accepts an optional `RawSocket` parameter. Tests inject a `MockSocket` that:
- Captures written packets in `written[]`
- Auto-emits pre-queued server responses when `write()` is called

This makes every layer fully testable without a real Sybase server.
