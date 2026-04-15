import type { BlsRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// BLS public API v2. Key is optional: w/o = 25/day per IP, w/ = 500/day.
// For v1 we query state-level total nonfarm employment (CES) and compute YoY growth.
// State series format: CES<2-digit FIPS>00000001 (seasonally adjusted total nonfarm).

const STATE_FIPS: Record<string, string> = {
  CO: '08', TX: '48', FL: '12', TN: '47', NC: '37', GA: '13', AZ: '04',
  NV: '32', UT: '49', ID: '16', SC: '45', AL: '01', OK: '40', ND: '38',
  SD: '46', WY: '56', MT: '30', AR: '05', MS: '28', KY: '21', IN: '18',
  OH: '39', MI: '26', PA: '42', VA: '51', WV: '54', MO: '29', KS: '20',
  NE: '31', IA: '19', MN: '27', WI: '55', IL: '17', NM: '35', LA: '22',
  CA: '06', OR: '41', WA: '53', NY: '36', NJ: '34', CT: '09', MA: '25',
  RI: '44', ME: '23', NH: '33', VT: '50', MD: '24', DE: '10', DC: '11',
  HI: '15', AK: '02',
};

export async function fetchBls(geocode: GeocodedAddress): Promise<ProviderResult<BlsRecord>> {
  const provider = 'bls_ces';
  const stateCode = geocode.stateCode;
  if (!stateCode) {
    return { provider, status: 'not_available', message: 'No state resolved from geocode' };
  }
  const fips = STATE_FIPS[stateCode];
  if (!fips) {
    return { provider, status: 'not_available', message: `Unmapped state: ${stateCode}` };
  }

  const seriesId = `CES${fips}00000001`; // state total nonfarm, SA
  const thisYear = new Date().getFullYear();
  const startYear = thisYear - 2;

  try {
    const body: Record<string, unknown> = {
      seriesid: [seriesId],
      startyear: String(startYear),
      endyear: String(thisYear),
    };
    const key = process.env.BLS_API_KEY;
    if (key) body.registrationkey = key;

    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { provider, status: 'error', message: `HTTP ${res.status}` };

    const json = (await res.json()) as {
      status: string;
      message?: string[];
      Results?: {
        series?: Array<{
          seriesID: string;
          data: Array<{ year: string; period: string; periodName: string; value: string }>;
        }>;
      };
    };

    if (json.status !== 'REQUEST_SUCCEEDED') {
      const msg = (json.message ?? []).join('; ') || 'BLS request failed';
      if (/threshold/i.test(msg) || /daily/i.test(msg)) {
        return { provider, status: 'needs_credits', message: msg };
      }
      return { provider, status: 'error', message: msg };
    }

    const points = json.Results?.series?.[0]?.data ?? [];
    if (points.length < 13) {
      return { provider, status: 'not_available', message: 'Insufficient BLS data points' };
    }

    // BLS returns points in reverse chronological order (latest first).
    const latest = points[0];
    const yearAgo = points[12]; // 12 monthly periods earlier = same month, one year prior
    const latestValue = Number(latest.value);
    const priorYearValue = Number(yearAgo.value);
    const yoy = priorYearValue > 0 ? ((latestValue - priorYearValue) / priorYearValue) * 100 : 0;

    return {
      provider,
      status: 'ok',
      data: {
        stateCode,
        latestYear: Number(latest.year),
        latestValue,
        priorYearValue,
        yoyGrowthPct: Number(yoy.toFixed(2)),
        seriesId,
        description: `${stateCode} total nonfarm employment, seasonally adjusted`,
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
