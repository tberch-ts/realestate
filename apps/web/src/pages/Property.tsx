import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PropertySnapshot } from '@mfa/shared';
import { fetchProperty } from '../lib/api';
import ProviderPanel from '../components/ProviderPanel';
import BuyBoxCard from '../components/BuyBoxCard';

export default function Property() {
  const [params] = useSearchParams();
  const address = params.get('address') ?? '';
  const [snapshot, setSnapshot] = useState<PropertySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    fetchProperty(address)
      .then(setSnapshot)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← New search
          </Link>
          <Link
            to={`/deal?address=${encodeURIComponent(address)}`}
            className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 font-semibold text-white text-sm"
          >
            Create deal →
          </Link>
        </div>
        <h1 className="text-3xl font-bold mt-3 mb-1">{address}</h1>
        {snapshot?.geocode.status === 'ok' && (
          <p className="text-slate-400 text-sm mb-6">
            {snapshot.geocode.data?.formatted} · ({snapshot.geocode.data?.lat.toFixed(5)},{' '}
            {snapshot.geocode.data?.lng.toFixed(5)})
          </p>
        )}

        {loading && <p className="text-slate-400">Pulling public data…</p>}
        {error && <p className="text-rose-400">Error: {error}</p>}

        {snapshot && (
          <>
            <BuyBoxCard buyBox={snapshot.buyBox} />

            <h2 className="text-lg font-semibold text-slate-200 mb-3 mt-8">Data sources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProviderPanel result={snapshot.assessor}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="Source" v={snapshot.assessor.data?.source} />
                  <Row k="Parcel" v={snapshot.assessor.data?.parcelId} />
                  <Row k="Owner" v={snapshot.assessor.data?.owner} />
                  <Row k="Year Built" v={snapshot.assessor.data?.yearBuilt} />
                  <Row k="Units" v={snapshot.assessor.data?.units} />
                  <Row k="Bldg sqft" v={snapshot.assessor.data?.sqft} />
                  <Row k="Assessed" v={fmtMoney(snapshot.assessor.data?.assessedValue)} />
                  <Row k="Last sale" v={fmtMoney(snapshot.assessor.data?.lastSalePrice)} />
                </dl>
              </ProviderPanel>

              <ProviderPanel result={snapshot.census}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="County" v={snapshot.census.data?.countyName} />
                  <Row k="County pop." v={fmtNum(snapshot.census.data?.populationCounty)} />
                  <Row k="5-yr growth" v={fmtPct(snapshot.census.data?.populationGrowthPct5yr)} />
                  <Row k="Tract" v={snapshot.census.data?.tract} />
                  <Row k="Tract pop." v={fmtNum(snapshot.census.data?.population)} />
                  <Row k="Median HH income" v={fmtMoney(snapshot.census.data?.medianHouseholdIncome)} />
                  <Row k="Median gross rent" v={fmtMoney(snapshot.census.data?.medianGrossRent)} />
                </dl>
              </ProviderPanel>

              <ProviderPanel result={snapshot.bls}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="Series" v={snapshot.bls.data?.description} />
                  <Row k="YoY growth" v={fmtPct(snapshot.bls.data?.yoyGrowthPct)} />
                  <Row k="Latest" v={fmtNum(snapshot.bls.data?.latestValue)} />
                  <Row k="Year prior" v={fmtNum(snapshot.bls.data?.priorYearValue)} />
                </dl>
              </ProviderPanel>

              <ProviderPanel result={snapshot.landlord}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="State" v={snapshot.landlord.data?.stateCode} />
                  <Row k="Tier" v={snapshot.landlord.data?.stateTier} />
                  <Row k="Score" v={snapshot.landlord.data?.stateScore} />
                  <Row k="City override" v={snapshot.landlord.data?.cityOverride?.city} />
                  <Row k="Notes" v={snapshot.landlord.data?.notes} />
                </dl>
              </ProviderPanel>

              <ProviderPanel result={snapshot.hud}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="Studio" v={fmtMoney(snapshot.hud.data?.fmrByBedrooms.studio)} />
                  <Row k="1 BR" v={fmtMoney(snapshot.hud.data?.fmrByBedrooms.oneBr)} />
                  <Row k="2 BR" v={fmtMoney(snapshot.hud.data?.fmrByBedrooms.twoBr)} />
                  <Row k="3 BR" v={fmtMoney(snapshot.hud.data?.fmrByBedrooms.threeBr)} />
                </dl>
              </ProviderPanel>

              <ProviderPanel result={snapshot.crime} />
              <ProviderPanel result={snapshot.attom} />
              <ProviderPanel result={snapshot.rentcast} />
              <ProviderPanel result={snapshot.geocode}>
                <dl className="text-sm text-slate-300 space-y-1">
                  <Row k="Formatted" v={snapshot.geocode.data?.formatted} />
                  <Row k="State" v={snapshot.geocode.data?.stateCode} />
                  <Row k="Place ID" v={snapshot.geocode.data?.placeId} />
                </dl>
              </ProviderPanel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number | undefined | null }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-1 gap-2">
      <dt className="text-slate-500 shrink-0">{k}</dt>
      <dd className="text-slate-200 text-right">{String(v)}</dd>
    </div>
  );
}

function fmtMoney(n?: number): string | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtNum(n?: number): string | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return n.toLocaleString('en-US');
}
function fmtPct(n?: number): string | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
