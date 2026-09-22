import { config } from "dotenv";
import { Connection } from "../src/connection";
import { DataFormat } from "../src/types/data-format";
import { DataType } from "../src/constants/tds-const";
import { ConnectionPool } from "../src/connection-pool";

config();

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const DEBUG = process.env['TDS_DEBUG'] === '1';

async function main() {
  const opts = {
    host:     HOST!,
    port:     PORT,
    username: USER,
    password: PASS
  };

  const pool = new ConnectionPool(opts, { max: 2 });
  const conn = await pool.acquire();
  const r = await conn.query('SELECT 1');
  console.log(r);
}

main();