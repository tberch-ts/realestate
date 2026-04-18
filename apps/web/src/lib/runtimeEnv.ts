// Runtime config shim.
//
// In prod, `/env.js` is generated at container start by the nginx entrypoint
// and sets `window.__ENV__`. In dev (Vite), window.__ENV__ is absent, so we
// fall back to `import.meta.env.VITE_*`. Same build artifact works in both.

interface RuntimeEnv {
  API_URL: string;
  GOOGLE_MAPS_API_KEY?: string;
}

declare global {
  interface Window {
    __ENV__?: Partial<RuntimeEnv>;
  }
}

function read(): RuntimeEnv {
  const w = typeof window !== 'undefined' ? window.__ENV__ : undefined;
  // ?? not ||  — empty string from window.__ENV__ is a valid value (means
  // "use relative URLs"), not a fallback trigger.
  const API_URL =
    w?.API_URL ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
  const GOOGLE_MAPS_API_KEY =
    w?.GOOGLE_MAPS_API_KEY ?? (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? undefined;
  return { API_URL, GOOGLE_MAPS_API_KEY };
}

export const env: RuntimeEnv = read();
export const API_URL = env.API_URL;
export const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;
