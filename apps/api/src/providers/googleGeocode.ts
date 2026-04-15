import type { GeocodedAddress, ProviderResult } from '@mfa/shared';

export async function geocodeAddress(address: string): Promise<ProviderResult<GeocodedAddress>> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const provider = 'google_geocoding';

  if (!key) {
    return {
      provider,
      status: 'needs_credentials',
      message: 'Set GOOGLE_MAPS_API_KEY in .env to enable geocoding.',
    };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', key);

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      status: string;
      error_message?: string;
      results: Array<{
        formatted_address: string;
        place_id: string;
        geometry: { location: { lat: number; lng: number } };
        address_components: Array<{ short_name: string; long_name: string; types: string[] }>;
      }>;
    };

    if (body.status === 'REQUEST_DENIED') {
      return { provider, status: 'needs_credentials', message: body.error_message ?? 'API key rejected' };
    }
    if (body.status === 'OVER_QUERY_LIMIT') {
      return { provider, status: 'needs_credits', message: 'Google quota exceeded' };
    }
    if (body.status !== 'OK' || body.results.length === 0) {
      return { provider, status: 'error', message: body.error_message ?? body.status };
    }

    const r = body.results[0];
    const components: Record<string, string> = {};
    let stateCode: string | undefined;
    for (const c of r.address_components) {
      for (const t of c.types) {
        components[t] = c.long_name;
        if (t === 'administrative_area_level_1') stateCode = c.short_name;
      }
    }

    return {
      provider,
      status: 'ok',
      data: {
        formatted: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        placeId: r.place_id,
        components,
        stateCode,
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
