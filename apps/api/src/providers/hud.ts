import type { HudRentRecord, ProviderResult } from '@mfa/shared';

// HUD Fair Market Rents — the official API requires an access token (free w/ registration).
// In v1 we keep this as a placeholder so the pattern is wired and a key can be added later.

export async function fetchHudFmr(year = new Date().getFullYear()): Promise<ProviderResult<HudRentRecord>> {
  const provider = 'hud_fmr';
  const token = process.env.HUD_API_TOKEN;

  if (!token) {
    return {
      provider,
      status: 'needs_credentials',
      message: 'HUD FMR API requires a free access token. Register at https://www.huduser.gov/portal/dataset/fmr-api.html',
    };
  }

  try {
    // Denver-Aurora-Lakewood, CO MSA FMR area code is METRO19740MM0000 (approximate; verified at runtime)
    const area = 'METRO19740MM0000';
    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${area}?year=${year}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { provider, status: 'error', message: `HTTP ${res.status}` };

    const body = (await res.json()) as {
      data?: {
        basicdata?: {
          Efficiency?: number;
          'One-Bedroom'?: number;
          'Two-Bedroom'?: number;
          'Three-Bedroom'?: number;
          'Four-Bedroom'?: number;
        };
      };
    };
    const d = body.data?.basicdata;
    if (!d) return { provider, status: 'not_available', message: 'No FMR basicdata returned' };

    return {
      provider,
      status: 'ok',
      data: {
        year,
        fmrByBedrooms: {
          studio: d.Efficiency,
          oneBr: d['One-Bedroom'],
          twoBr: d['Two-Bedroom'],
          threeBr: d['Three-Bedroom'],
          fourBr: d['Four-Bedroom'],
        },
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
