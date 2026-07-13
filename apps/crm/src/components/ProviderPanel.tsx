import type { ProviderResult } from '@mfa/shared';

const LABEL: Record<string, string> = {
  google_geocoding: 'Google Geocoding',
  assessor: 'County Assessor',
  denver_assessor: 'Denver Assessor',
  phoenix_assessor: 'Phoenix Assessor (Maricopa Co.)',
  austin_assessor: 'Austin Assessor (Travis Co.)',
  nashville_assessor: 'Nashville Assessor (Davidson Co.)',
  charlotte_assessor: 'Charlotte Assessor (Mecklenburg Co.)',
  tampa_assessor: 'Tampa Assessor (Hillsborough Co.)',
  raleigh_assessor: 'Raleigh Assessor (Wake Co.)',
  census_acs: 'US Census (ACS)',
  bls_ces: 'BLS Employment',
  fbi_ucr: 'FBI Crime Data (UCR)',
  landlord_friendliness: 'Landlord Friendliness',
  hud_fmr: 'HUD Fair Market Rents',
  attom: 'ATTOM Data',
  rentcast: 'RentCast',
};

const BADGE: Record<string, string> = {
  ok: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  needs_credentials: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  needs_credits: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  not_available: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  error: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export default function ProviderPanel({
  title,
  result,
  children,
}: {
  title?: string;
  result: ProviderResult | undefined;
  children?: React.ReactNode;
}) {
  if (!result) return null;
  const name = title ?? LABEL[result.provider] ?? result.provider;
  return (
    <section className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-100">{name}</h3>
        <span className={`px-2 py-0.5 text-xs rounded border ${BADGE[result.status] ?? BADGE.error}`}>
          {result.status.replace('_', ' ')}
        </span>
      </header>
      {result.status === 'ok' && children}
      {result.status !== 'ok' && <p className="text-sm text-gray-500">{result.message ?? 'Unavailable.'}</p>}
    </section>
  );
}
