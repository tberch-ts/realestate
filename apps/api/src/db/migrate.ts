// Loads .env from the monorepo root regardless of cwd — `dotenv/config`'s
// default lookup is cwd-relative, which breaks when this runs via `npm run
// db:migrate` (cwd = apps/api, not the repo root where .env actually lives).
import '../loadEnv.js';
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
  // Migrations live in an `app` schema we own — keeps PG 15+ public-schema rules
  // out of the picture and matches the runtime search_path set in pool.ts.
  await pool.query('CREATE SCHEMA IF NOT EXISTS app');
  await pool.query('SET search_path TO app, public');

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await pool.query(sql);
  }
  console.log('[migrate] done');
  await pool.end();
}

main().catch((e) => {
  console.error('[migrate] failed:', e);
  process.exit(1);
});
