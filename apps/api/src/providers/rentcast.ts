import type { ProviderResult } from '@mfa/shared';

export async function fetchRentcast(): Promise<ProviderResult> {
  const provider = 'rentcast';
  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return {
      provider,
      status: 'needs_credentials',
      message: 'RentCast is a paid provider. Set RENTCAST_API_KEY to unlock rent comps and estimates.',
    };
  }
  return {
    provider,
    status: 'not_available',
    message: 'RentCast integration not yet implemented.',
  };
}
