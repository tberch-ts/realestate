import { pool } from './pool.js';

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const res = await pool.query<{ value: T }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return res.rows[0]?.value ?? null;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  await pool.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
}
