// Runtime config shim — GitHub Pages is pure static hosting (no server-side
// env injection like apps/web's nginx entrypoint), so this always resolves
// from the Vite build-time env (import.meta.env.VITE_*).

interface RuntimeEnv {
  API_URL: string;
}

function read(): RuntimeEnv {
  const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
  return { API_URL };
}

export const env: RuntimeEnv = read();
export const API_URL = env.API_URL;
