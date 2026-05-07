# node-sybase

TDS 5.0 Sybase ASE database driver for Node.js/TypeScript.

- Pure TypeScript — no native dependencies
- Promise/async-await API, no callbacks
- Prepared statements, server-side cursors, transactions, connection pool
- Cleanroom implementation from the Sybase TDS 5.0 protocol specification

## Installation

```bash
npm install node-sybase
```

## Quick start

```typescript
import { Connection } from 'node-sybase';

const conn = await Connection.connect({
  host:     'myserver',
  port:     5000,
  username: 'sa',
  password: 'secret',
});

// Simple query
const { rows } = await conn.query('SELECT id, name FROM users WHERE active = 1');
for (const [id, name] of rows) {
  console.log(id, name);
}

// Prepared statement
import { DataFormat } from 'node-sybase';
import { DataType }   from 'node-sybase/constants';

const stmt = await conn.prepare(
  'SELECT * FROM users WHERE id = ?',
  [new DataFormat(DataType.INT4)], // Optional
);
const result = await stmt.execute([42]);
await stmt.close();

// Transaction
const txn = conn.transaction();
await txn.begin();
try {
  await conn.query("INSERT INTO log VALUES ('test')");
  await txn.commit();
} catch {
  await txn.rollback();
}

await conn.end();
```

## Connection pool

```typescript
import { ConnectionPool } from 'node-sybase';

const pool = ConnectionPool.create(
  { host: 'myserver', port: 5000, username: 'sa', password: 'secret' },
  { min: 2, max: 10, idleTimeout: 30_000 },
);

const conn = await pool.acquire();
try {
  await conn.query('SELECT 1');
} finally {
  pool.release(conn);
}

await pool.end();
```

## Server-side cursor

```typescript
const cursor = conn.cursor('SELECT * FROM big_table');
await cursor.open();
const rows = await cursor.fetch(100);
await cursor.close();
```

## Supported data types

| TDS Type | JS/TS type |
|----------|-----------|
| INT1, INT2, INT4 | `number` |
| INT8, UINT8 | `bigint` |
| FLT4, FLT8, FLTN | `number` |
| DECN, NUMN | `string` ("123.45") |
| MONEY, SHORTMONEY | `string` ("1.0000") |
| DATE, TIME, DATETIME, SHORTDATE | `Date` |
| VARCHAR, CHAR, TEXT, LONGCHAR | `string` |
| UNITEXT | `string` (UTF-16 LE) |
| BINARY, VARBINARY, IMAGE | `Buffer` |
| BIT | `boolean` |
| NULL | `null` |

## Error handling

All server errors are thrown as `SybaseError` which extends `Error`:

```typescript
import { SybaseError } from 'node-sybase';

try {
  await conn.query('SELECT FROM'); // syntax error
} catch (err) {
  if (err instanceof SybaseError) {
    console.error(err.errorNumber, err.severity, err.message);
  }
}
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [TDS 5.0 Protocol Summary](docs/PROTOCOL.md)
- [API Reference](docs/API.md)
- [TypeORM Integration (future)](docs/TYPEORM.md)

## License

MIT
