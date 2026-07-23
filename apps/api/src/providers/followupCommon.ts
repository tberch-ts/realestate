// Small shared helpers for the follow-up providers (generic engine +
// per-market sources). Kept separate so both files import one copy instead
// of each redefining str/num/geometry parsing.

export function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ArcGIS returns dates as epoch-ms integers (esri JSON). Convert to an ISO
// date string (YYYY-MM-DD); a 0/negative value means "no recorded sale".
export function epochToIsoDate(v: unknown): string | undefined {
  const n = num(v);
  if (n == null || n <= 0) return undefined;
  return new Date(n).toISOString().slice(0, 10);
}

// ArcGIS polygon geometries come in rings (Array<Array<[lng,lat]>>). Also
// accepts GeoJSON Polygon/MultiPolygon coordinates for callers that pass a
// hotspots feature geometry.
export function extractPolygonRings(geometry: unknown): number[][][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geometry as any;
  if (g?.rings) return g.rings;
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) return g.coordinates;
  if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return (g.coordinates as number[][][][]).flat();
  }
  return [];
}

// Average of every vertex — good enough for a map pin on a parcel polygon.
export function centroidFromGeometry(
  geometry: unknown,
  fallback: [number, number]
): [number, number] {
  const rings = extractPolygonRings(geometry);
  const coords: number[][] = [];
  const collect = (arr: unknown[]): void => {
    if (typeof arr[0] === 'number') {
      coords.push(arr as number[]);
    } else {
      for (const sub of arr) collect(sub as unknown[]);
    }
  };
  collect(rings as unknown[]);
  if (coords.length === 0) return fallback;
  const sx = coords.reduce((s, c) => s + c[0], 0);
  const sy = coords.reduce((s, c) => s + c[1], 0);
  return [sx / coords.length, sy / coords.length];
}

// Owner mailing state is a first-class field on most county rolls, but a few
// (e.g. Wake/Raleigh) bury it in a free-text mailing line like
// "SOLANA BEACH CA 92075-2125". Pull the 2-letter state that precedes a ZIP.
export function stateFromMailingLine(...lines: Array<unknown>): string | undefined {
  for (const line of lines) {
    const s = str(line);
    if (!s) continue;
    const m = s.toUpperCase().match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/);
    if (m) return m[1];
  }
  return undefined;
}
