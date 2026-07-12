// Loads .env from the monorepo root before anything else runs.
//
// This MUST be the first import in index.ts, and this file must not import
// anything besides dotenv/node:url/node:path. ES modules evaluate all of a
// file's static imports (in source order, depth-first) before any of that
// file's own top-level statements — including statements textually written
// above later imports. So a plain `loadEnv(...)` call sitting between two
// imports in index.ts does NOT run before those imports evaluate; modules
// like stripe/client.ts or db/pool.ts that read process.env.* at import time
// would see undefined values. Making the .env load itself the first
// imported module's side effect is what actually guarantees it runs first.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../../.env') });
