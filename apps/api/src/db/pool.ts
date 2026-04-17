import pg from 'pg';

const { Pool } = pg;

// DO managed Postgres terminates SSL with a cert that isn't in the default Node trust store;
// rejectUnauthorized:false is the standard DO pattern. Dev Postgres has no SSL.
const needsSsl = process.env.NODE_ENV === 'production' || /sslmode=require/i.test(process.env.DATABASE_URL ?? '');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] pool error:', err);
});
