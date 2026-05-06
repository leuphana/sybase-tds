# TypeORM Integration

TypeORM support for Sybase ASE is planned as a **separate npm package** `typeorm-sybase`.

This library (`node-sybase`) provides only the low-level TDS 5.0 driver. The TypeORM adapter will be built on top of it.

## Planned package: `typeorm-sybase`

```typescript
import { DataSource } from 'typeorm';
import 'typeorm-sybase';  // registers the 'sybase' driver

const ds = new DataSource({
  type:     'sybase',
  host:     'myserver',
  port:     5000,
  username: 'sa',
  password: 'secret',
  database: 'pubs2',
  entities: [User],
});
await ds.initialize();
```

## Implementation notes

The TypeORM driver adapter needs to implement:

| TypeORM interface | Implementation note |
|-------------------|---------------------|
| `Driver` | Wraps `ConnectionPool` |
| `QueryRunner` | Wraps `Connection.query()` / `PreparedStatement` |
| `SchemaBuilder` | Sybase-specific DDL queries |
| `QueryBuilder` | Standard TypeORM with Sybase dialect |

### Type mapping

| TypeORM column type | Sybase type |
|--------------------|-------------|
| `int` | `INT` (INT4) |
| `bigint` | `BIGINT` (INT8) |
| `float` | `FLOAT` (FLT8) |
| `decimal` | `NUMERIC(p,s)` (NUMN) |
| `varchar` | `VARCHAR(n)` |
| `text` | `TEXT` |
| `boolean` | `BIT` |
| `date` | `DATETIME` |
| `blob` | `IMAGE` |

### Parameter placeholders

Sybase uses `?` for positional parameters in prepared statements, not `$1`-style. The TypeORM dialect must map accordingly.

### Transactions

Use `Connection.transaction()` for TypeORM's transaction management. Sybase does not support savepoints in TDS 5.0.

### Known limitations

- No `RETURNING` / `OUTPUT` clause — use a subsequent `SELECT @@IDENTITY` or `SELECT SCOPE_IDENTITY()`.
- No `TRUNCATE ... RESTART IDENTITY`.
- Schema inspection requires queries against `sysobjects` / `syscolumns` system tables.
