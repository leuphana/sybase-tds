import { config } from "dotenv";
import { Connection } from "../src/connection";
import { DataFormat } from "../src/types/data-format";
import { DataType } from "../src/constants/tds-const";

config();

const HOST = process.env['SYBASE_TEST_HOST'];
const USER = process.env['SYBASE_TEST_USER'] ?? 'sa';
const PASS = process.env['SYBASE_TEST_PASS'] ?? '';
const PORT = parseInt(process.env['SYBASE_TEST_PORT'] ?? '5000', 10);

const DEBUG = process.env['TDS_DEBUG'] === '1';

console.log('TDS_DEBUG:', DEBUG);

async function main() {
  const conn = new Connection({
    host:     HOST!,
    port:     PORT,
    username: USER,
    password: PASS
  });

  console.time();
  await conn.connect();

  console.timeLog()

  const stm = await conn.prepare('select * from dbo.borrower b where b.borrower_bar = ?');
  console.log('PreparedStatement erstellt');
  const result = await stm.execute(['311083758243']);

  console.timeEnd();
  console.log('Ergebnis:', result);

  await conn.end();
}

main();