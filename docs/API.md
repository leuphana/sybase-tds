# API Reference

## `Connection`

### `new Connection(options, rawSocket?).connect()`

```typescript
constructor(options: ConnectOptions, rawSocket?: RawSocket)
async connect(): Promise<this>
```

Opens a TCP (or TLS) connection, performs the TDS login handshake, enables
quoted identifiers and, if `database` is set, switches to that database.

```typescript
interface ConnectOptions {
  host:            string;      // Hostname or IP
  port?:           number;      // Default: 5000
  username:        string;
  password?:       string;      // Default: ''
  database?:       string;      // `use <database>` after login (identifier is validated)
  charset?:        string;      // 'utf8' | 'iso_1' | 'ascii_7' (others are rejected)
  language?:       string;      // e.g. 'us_english'
  packetSize?:     number;      // Requested packet size, default 2048 (512 until the server confirms)
  appName?:        string;      // Shown as program_name in sysprocesses
  connectTimeout?: number;      // ms for TCP + login, default 15000, 0 = none
  requestTimeout?: number;      // ms per request, default 0 = none (see "Timeouts")
  keepAlive?:      boolean;     // TCP keep-alive, default true
  tls?:            boolean | tls.ConnectionOptions; // requires an SSL-enabled ASE listener
  /** @deprecated – `true` throws; the driver is big-endian only */
  byteswap?:       boolean;
}
```

Throws `SybaseError` on a server-side login error, `Error('Login fehlgeschlagen')` on a rejected
login, `TdsTimeoutError` when `connectTimeout` is exceeded.

**Character set.** The server reports its charset via ENVCHANGE; the driver switches the encoding
for SQL text and CHAR/VARCHAR/TEXT data accordingly (`conn.encoding`). Unsupported server
charsets abort the login with a clear error instead of producing garbled text.

**Packet size.** Requests are sent in 512-byte packets until the server confirms a size via
ENVCHANGE(PACKETSIZE).

### State

```typescript
conn.isClosed:      boolean          // closed, failed or protocol error – do not reuse
conn.inTransaction: boolean          // DONE_INXACT reported or a Transaction is active
conn.database:      string           // current database (from ENVCHANGE)
conn.encoding:      BufferEncoding
```

### Concurrency

A connection processes **one request at a time**. Concurrent calls (`query`, `prepare`,
`execute`, cursor operations, …) are queued and executed in order – they never interleave on
the wire. Use a `ConnectionPool` for real parallelism.

### Timeouts

With `requestTimeout` set, a request that takes longer is cancelled: the driver sends an
ATTENTION packet, discards the rest of the response up to the server's `DONE_ATTN`
acknowledgement and then rejects with `TdsTimeoutError`. The connection stays usable. If the
server does not acknowledge within 5 s, the connection is closed (`isClosed === true`).

---

### `conn.query(sql, params?)`

```typescript
async query(sql: string, params?: JsValue[]): Promise<QueryResult>
```

Without `params`, sends the SQL as a LANGUAGE token. With `params`, `?` placeholders are bound
server-side through a temporary prepared statement (PREPARE → EXECUTE → DEALLOCATE) – no string
interpolation. ASE accepts untyped `?` only in WHERE, SET and VALUES clauses.

```typescript
interface QueryResult {
  columns:       DataFormat[];     // columns of the first result set
  rows:          JsValue[][];      // rows of the first result set
  rowCount:      number;           // count of the last DONE carrying DONE_COUNT
  resultSets:    ResultSet[];      // all result sets in order ({ columns, rows })
  messages:      ServerMessage[];  // info messages (severity < 11, e.g. PRINT)
  returnStatus?: number;           // stored procedure return status
  outputParams:  JsValue[];        // stored procedure output parameters
}
```

Throws `SybaseError` on a server error (severity ≥ 11). The error is thrown only after the whole
response has been read, so the connection stays in sync and can be reused.

---

### `conn.prepare(sql, params?)`

```typescript
async prepare(sql: string, params: DataFormat[] = []): Promise<PreparedStatement>
```

Sends DYNAMIC(PREPARE) (+ PARAMFMT if `params` are given) and returns a `PreparedStatement`.

---

### `conn.cursor(sql, params?)`

```typescript
cursor(sql: string, params: DataFormat[] = []): Cursor
```

Returns a `Cursor` (not yet opened).

---

### `conn.transaction()`

```typescript
transaction(): Transaction
```

Returns a `Transaction` (not yet begun).

---

### `conn.end()` / `conn.destroy()`

```typescript
async end(): Promise<void>   // LOGOUT + close; idempotent, waits for queued requests
destroy(): void              // close immediately without LOGOUT
```

---

## `PreparedStatement`

### `stmt.execute(values?)`

```typescript
async execute(values: JsValue[] = []): Promise<QueryResult>
```

Sends DYNAMIC(EXEC) + PARAMFMT + PARAMS. If no formats were passed to `prepare()`, they are
inferred per value (`inferFormat`):

| JS value | TDS type |
|----------|----------|
| `string` ≤ 255 bytes / longer | VARCHAR / LONGCHAR |
| integer in int32 / safe integer / other number | INT4 / INTN(8) / FLT8 |
| `bigint` | INTN(8) |
| `boolean` | BIT |
| `Date` | DATETIMN(8) |
| `Buffer` ≤ 255 bytes / longer | VARBINARY / LONGBINARY |
| `null` | VARCHAR (NULL) |

Values that do not fit the declared format (e.g. a 300-byte string for `VARCHAR(255)`, `null`
for a fixed type such as INT4) throw instead of being silently truncated.

### `stmt.close()`

Sends DYNAMIC(DEALLOC). Idempotent.

---

## `Cursor`

### `cursor.open(values?)`

```typescript
async open(values: JsValue[] = []): Promise<void>
```

Sends CURDECLARE + CUROPEN (+ PARAMFMT/PARAMS if `values` are given).

### `cursor.fetch(count?)`

```typescript
async fetch(count = 1): Promise<JsValue[][]>
```

Fetches up to `count` rows (sends CURINFO SETCURROWS when the fetch size changes). When fewer
rows than requested come back, `cursor.isDone` becomes `true` and further calls return `[]`
without a round trip.

### `cursor.close()`

Sends CURCLOSE with `dealloc = true`. Idempotent.

---

## `Transaction`

```typescript
async begin():    Promise<void>   // BEGIN TRANSACTION
async commit():   Promise<void>   // COMMIT TRANSACTION
async rollback(): Promise<void>   // ROLLBACK TRANSACTION
txn.isActive:     boolean
```

Simple, non-nested transactions only (no savepoints). `begin()` throws if a transaction is
already active on the connection.

---

## `ConnectionPool`

```typescript
new ConnectionPool(options: ConnectOptions, poolOptions?: PoolOptions)

interface PoolOptions {
  min?:            number;   // kept open even when idle (default 0)
  max?:            number;   // idle + in use + being created (default 10; 0 = unlimited)
  idleTimeout?:    number;   // ms before an idle connection above `min` is closed (default 60000)
  acquireTimeout?: number;   // ms acquire() waits before rejecting (default 30000; 0 = forever)
}
```

### `pool.acquire()`

Returns an idle connection (dead ones are skipped), creates a new one if below `max`, or waits.

### `pool.release(conn)`

```typescript
release(conn: Connection): Promise<void>   // never rejects
```

Broken connections are discarded (a waiting `acquire()` gets a fresh one). If the connection is
still in a transaction, `IF @@trancount > 0 ROLLBACK TRANSACTION` is run first; if that fails the
connection is destroyed. Double release is ignored.

### `pool.end()`

Closes idle connections and rejects pending `acquire()` calls. Connections in use are closed
when they are released.

`pool.size`, `pool.idleCount`, `pool.activeCount`, `pool.waitingCount` expose the current state.

---

## `SybaseError` / `TdsTimeoutError`

```typescript
class SybaseError extends Error {
  errorNumber: number;   // Sybase error code
  state:       number;
  severity:    number;   // ≥ 11 = error
  sqlState:    string;
  serverName:  string;
  procName:    string;
  lineNumber:  number;
}

class TdsTimeoutError extends Error {}   // connectTimeout / requestTimeout exceeded
```

---

## `DataFormat`

```typescript
class DataFormat {
  constructor(dataType: DataType, options?: DataFormatOptions)
  
  readonly dataType:   DataType;
  readonly maxLength:  number;
  readonly precision:  number;
  readonly scale:      number;
  readonly status:     number;    // ParamStatus flags
  readonly name:       string;    // Column/parameter name

  isFixedLength():  boolean
  isNullable():     boolean
  fixedByteLen():   number
  build():          Buffer        // Serialize to PARAMFMT/ROWFMT wire format
  static read(reader: TdsReader): DataFormat  // Deserialize from ROWFMT
}
```

---

## `TypeMapper`

```typescript
class TypeMapper {
  constructor(byteswap?: boolean)   // byteswap=true for BE servers
  decode(df: DataFormat, raw: Buffer | null): JsValue
  encodeParam(df: DataFormat, value: JsValue): Buffer
}

type JsValue = null | number | bigint | boolean | string | Buffer | Date;
```

`decode()` converts raw bytes from `RowParser` into JS primitives.  
`encodeParam()` produces wire bytes for PARAMS tokens: fixed types return just the value bytes; variable types return `[length][bytes]` or `[0x00]` for null.
