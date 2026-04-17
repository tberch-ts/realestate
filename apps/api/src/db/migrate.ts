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
            has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect_db,
            has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public,
            has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public,
            (SELECT datdba::regrole::text FROM pg_database WHERE datname = current_database()) AS db_owner,
            (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'public') AS public_owner`
  );
  console.log('[migrate] grants:', grants.rows[0]);
  const dbs = await pool.query(
    `SELECT datname, datdba::regrole::text AS owner FROM pg_database WHERE datallowconn ORDER BY datname`
  );
  console.log('[migrate] databases visible:', dbs.rows);
  const memberships = await pool.query(
    `SELECT r.rolname FROM pg_roles r WHERE pg_has_role(current_user, r.oid, 'MEMBER')`
  );
  console.log('[migrate] roles:', memberships.rows.map(r => r.rolname).join(','));

  // Bail out before running CREATE — we just want the diagnostic this round.
  console.log('[migrate] DIAGNOSTIC ONLY — exiting before applying migrations');
  await pool.end();
  return;
  // unreachable below — left to keep the build happy
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
