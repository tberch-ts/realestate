import pg from 'pg';

const { Pool } = pg;

// DO managed Postgres uses a self-signed cert. The connection string DO injects has
// `sslmode=require`, which pg-connection-string v2.7+ treats as `verify-full` —
// that overrides any `ssl` config we pass and rejects the self-signed chain.
// Workaround: strip sslmode from the URL and configure SSL explicitly.
function buildConnConfig(): pg.PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) return {};

  const inProd = process.env.NODE_ENV === 'production';
  let sslmodeInUrl = false;
  let connectionString = raw;
  try {
    const url = new URL(raw);
    sslmodeInUrl = url.searchParams.has('sslmode');
    url.searchParams.delete('sslmode');
    connectionString = url.toString();
  } catch {
    // not a URL — leave as-is
  }

  const needsSsl = inProd || sslmodeInUrl;
  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    // Match the migrator: every connection looks at the `app` schema first so
    // unqualified table names resolve there. Falls back to `public` for built-ins.
    options: '-c search_path=app,public',
  };
}

export const pool = new Pool(buildConnConfig());

pool.on('error', (err) => {
  console.error('[db] pool error:', err);
});
