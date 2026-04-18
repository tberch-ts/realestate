// Client-side dev-mode flag. Mirrors TalkStud.io framework convention:
//   Ctrl+Alt+D toggles.
//   Default ON on localhost, OFF on re.talkstud.io / any non-local host.
//   Persists in localStorage, survives refreshes.
//
// The server reads `x-mfa-dev-mode` header on every API call and routes
// PostGrid (and future test/live-keyed services) to the right credentials.

const STORAGE_KEY = 'mfa.devMode';

function hostnameDefault(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.local') ||
    h.startsWith('192.168.') ||
    h.startsWith('10.')
  );
}

export function getDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // No explicit choice made yet — default by hostname.
  return hostnameDefault();
}

export function setDevMode(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  // Tell any listeners (the banner, the toggle, any page showing mode status).
  window.dispatchEvent(new CustomEvent('mfa:devmode', { detail: on }));
}

export function toggleDevMode(): boolean {
  const next = !getDevMode();
  setDevMode(next);
  return next;
}

// Pure helper used by React hooks to subscribe to the event.
export function onDevModeChange(cb: (on: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener('mfa:devmode', handler);
  return () => window.removeEventListener('mfa:devmode', handler);
}
