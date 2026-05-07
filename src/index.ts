// Core connection API
export { Connection } from './connection';
export type { ConnectOptions, QueryResult } from './connection';

// Connection pool
export { ConnectionPool } from './connection-pool';
export type { PoolOptions } from './connection-pool';

// High-level abstractions
export { Transaction } from './transaction';
export { Cursor } from './cursor';
export { PreparedStatement } from './prepared-statement';

// Error type
export { SybaseError } from './error';

// Type system (needed for PreparedStatement / Cursor column metadata)
export { DataFormat } from './types/data-format';
export type { DataFormatOptions } from './types/data-format';
export type { JsValue } from './types/type-mapper';

// TDS data-type enum — consumers may need this when working with DataFormat
export { DataType } from './constants/tds-const';