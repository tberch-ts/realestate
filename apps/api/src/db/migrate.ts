import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

// Minimal migration runner — just applies every *.sql file in db/migrations in sorted order.
// The postgres container also auto-loads these on first boot via /docker-entrypoint-initdb.d,
// so this script is mainly for re-running after schema changes in dev.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../../../db/migrations');

async function main() {
  // PG 15+ + DO managed PG: the app user doesn't own the public schema, so CREATE
  // TABLE in public fails. Create our own `app` schema (which we own) and route
  // unqualified migration DDL into it via search_path. Runtime queries do the same
  // via the search_path option set in pool.ts.
  await pool.query('CREATE SCHEMA IF NOT EXISTS app');

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await pool.query('SET search_path TO app, public');
    await pool.query(sql);
  }
  console.log('[migrate] done');
  await pool.end();
}

main().catch((e) => {
  console.error('[migrate] failed:', e);
  process.exit(1);
});
