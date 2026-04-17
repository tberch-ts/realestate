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
  // Diagnostic: who/where are we?
  const who = await pool.query(
    "SELECT current_user, current_database(), session_user, current_setting('server_version') AS version"
  );
  console.log('[migrate] context:', who.rows[0]);
  const grants = await pool.query(
    `SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_db,
            has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public`
  );
  console.log('[migrate] grants:', grants.rows[0]);

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
