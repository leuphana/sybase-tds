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

async function main() {
  const conn = new Connection({
    host:     HOST!,
    port:     PORT,
    username: USER,
    password: PASS
  });
  await conn.connect();
  const stm = await conn.query('SELECT "Borrower"."address_id_nr" AS "Borrower_address_id_nr", "Borrower"."borrower_bar" AS "Borrower_borrower_bar", "Borrower"."iln" AS "Borrower_iln" FROM "borrower" "Borrower"');
  console.log('Ergebnis:', stm);

  await conn.end();
}

main();