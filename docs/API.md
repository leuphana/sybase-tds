# API Reference

## `Connection`

### `Connection.connect(options, rawSocket?)`

```typescript
static async connect(options: ConnectOptions, rawSocket?: RawSocket): Promise<Connection>
```

Opens a TCP connection, performs the TDS login handshake, and returns a ready `Connection`.

```typescript
interface ConnectOptions {
  host:       string;       // Hostname or IP
  port?:      number;       // Default: 5000
  username:   string;
  password?:  string;       // Default: ''
  charset?:   string;       // e.g. 'utf8', 'iso_1'
  language?:  string;       // e.g. 'us_english'
  packetSize?: number;      // TDS packet size, default 512
  byteswap?:  boolean;      // true for BE servers, default false (LE)
}
```

Throws `SybaseError` on server-side login error, `Error('Login fehlgeschlagen')` on rejected login.

---

### `conn.query(sql)`

```typescript
async query(sql: string): Promise<QueryResult>
```

Sends a plain SQL string as a LANGUAGE token.

```typescript
interface QueryResult {
  columns:  DataFormat[];   // Column metadata
  rows:     JsValue[][];    // Decoded row data
  rowCount: number;         // Rows affected / returned per DONE token
}
```

Throws `SybaseError` on server error (severity ≥ 11).

---

### `conn.prepare(sql, params?)`

```typescript
async prepare(sql: string, params: DataFormat[] = []): Promise<PreparedStatement>
```

Sends DYNAMIC(PREPARE) + PARAMFMT to the server and returns a `PreparedStatement`.

---

### `conn.cursor(sql, params?)`

```typescript
cursor(sql: string, params: DataFormat[] = []): Cursor
```

Returns a `Cursor` (not yet opened). Call `cursor.open()` to declare and open it on the server.

---

### `conn.transaction()`

```typescript
transaction(): Transaction
```

Returns a `Transaction` (not yet begun). Call `txn.begin()` to start.

---

### `conn.end()`

```typescript
async end(): Promise<void>
```

Sends LOGOUT and closes the TCP socket.

---

## `PreparedStatement`

Created via `conn.prepare()`.

### `stmt.execute(values)`

```typescript
async execute(values: JsValue[]): Promise<QueryResult>
```

Sends DYNAMIC(EXEC) + PARAMS marker + encoded parameter bytes.

### `stmt.close()`

```typescript
async close(): Promise<void>
```

Sends DYNAMIC(DEALLOC). Idempotent — safe to call multiple times.

---

## `Cursor`

Created via `conn.cursor()`.

### `cursor.open()`

```typescript
async open(): Promise<void>
```

Sends CURDECLARE + CUROPEN.

### `cursor.fetch(count?)`

```typescript
async fetch(count?: number): Promise<JsValue[][]>
```

Sends CURFETCH (type NEXT) and returns decoded rows.

### `cursor.close()`

```typescript
async close(): Promise<void>
```

Sends CURCLOSE with `dealloc = true`. Idempotent.

---

## `Transaction`

Created via `conn.transaction()`.

### `txn.begin()` / `txn.commit()` / `txn.rollback()`

```typescript
async begin():    Promise<void>
async commit():   Promise<void>
async rollback(): Promise<void>
```

Sends `BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK` via `connection.query()`.

Calling `begin()` when a transaction is already active throws `Error('Transaktion bereits aktiv')`.  
Calling `commit()` or `rollback()` without `begin()` throws `Error('Keine aktive Transaktion')`.

---

## `ConnectionPool`

### `ConnectionPool.create(options, poolOptions?)`

```typescript
static create(options: ConnectOptions, poolOptions?: PoolOptions): ConnectionPool

interface PoolOptions {
  min?:         number;   // Minimum connections (default 0)
  max?:         number;   // Maximum connections (default 10; 0 = unlimited)
  idleTimeout?: number;   // Ms before idle connection is closed (default 60000)
}
```

### `pool.acquire()`

```typescript
async acquire(): Promise<Connection>
```

Returns an idle connection immediately, creates a new one if below `max`, or waits if `max` is reached.

### `pool.release(conn)`

```typescript
release(conn: Connection): void
```

Returns a connection to the pool. Starts the idle timer.

### `pool.end()`

```typescript
async end(): Promise<void>
```

Closes all idle connections and rejects pending `acquire()` calls.

---

## `SybaseError`

```typescript
class SybaseError extends Error {
  errorNumber: number;   // Sybase error code
  state:       number;
  severity:    number;   // ≥ 11 = error, < 11 = warning/info
  serverName:  string;
  procName:    string;
  lineNumber:  number;
}
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
