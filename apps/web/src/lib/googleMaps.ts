// Minimal Google Maps JS API loader — no external deps.
// Loads once, resolves to the google.maps namespace.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('not in browser'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const cbName = `__gm_init_${Math.random().toString(36).slice(2)}`;
    w[cbName] = () => {
      resolve(w.google.maps);
      delete w[cbName];
    };
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&callback=${cbName}&v=weekly&libraries=`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps JS API'));
      delete w[cbName];
      pending = null;
    };
    document.head.appendChild(script);
  });

  return pending;
}
