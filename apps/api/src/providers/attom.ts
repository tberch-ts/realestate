import type { ProviderResult } from '@mfa/shared';

// ATTOM Data API — paid. Stub returns 'needs_credentials' until ATTOM_API_KEY is set.
// When enabled, this would call https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail

export async function fetchAttom(): Promise<ProviderResult> {
  const provider = 'attom';
  const key = process.env.ATTOM_API_KEY;
  if (!key) {
    return {
      provider,
      status: 'needs_credentials',
      message: 'ATTOM is a paid provider. Set ATTOM_API_KEY to unlock comps, ownership, and mortgage history.',
    };
  }
  // Real integration lands in a later phase once key is configured.
  return {
    provider,
    status: 'not_available',
    message: 'ATTOM integration not yet implemented.',
  };
}
