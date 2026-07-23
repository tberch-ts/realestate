// Runtime config shim — GitHub Pages is pure static hosting (no server-side
// env injection like apps/web's nginx entrypoint), so this always resolves
// from the Vite build-time env (import.meta.env.VITE_*).

interface RuntimeEnv {
  API_URL: string;
  GOOGLE_MAPS_API_KEY?: string;
}

function read(): RuntimeEnv {
  // Production builds must default to the real API — GitHub Pages has no
  // build-time secrets, so a build made without a local .env would otherwise
  // silently ship pointing at the builder's own localhost (see incident:
  // this shipped broken for every real visitor until caught in QA).
  const API_URL = (import.meta.env.VITE_API_URL as string | undefined)
    ?? (import.meta.env.DEV ? 'http://localhost:4000' : 'https://mfa-api.fly.dev');
  // Hardcoded fallback for the Google Maps key, same rationale as the
  // Firebase client config in firebase.ts: it is NOT secret (it ships in
  // every static bundle and is locked down by HTTP-referrer restrictions in
  // Google Cloud Console, not by hiding it). Without this fallback, any
  // docs/ rebuild made without VITE_GOOGLE_MAPS_API_KEY in the environment
  // silently ships a bundle with no key and every map ("Missing Google Maps
  // API key") breaks — this has now happened three times. Override via
  // VITE_GOOGLE_MAPS_API_KEY for a different key/project.
  const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)
    || 'AIzaSyDS_-uRGuRiqBT-RsFW_NAQcG5setOfqSE';
  return { API_URL, GOOGLE_MAPS_API_KEY };
}

export const env: RuntimeEnv = read();
export const API_URL = env.API_URL;
export const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;
