import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PropertySnapshot } from '@mfa/shared';
import { Search } from 'lucide-react';
import { fetchProperty } from '../lib/api';
import ProviderPanel from '../components/ProviderPanel';
import BuyBoxCard from '../components/BuyBoxCard';

export default function PropertySearch() {
  const [params] = useSearchParams();
  const [address, setAddress] = useState(params.get('address') ?? '');
  const [snapshot, setSnapshot] = useState<PropertySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function search(addr: string) {
    if (!addr.trim()) return;
    setLoading(true);
    setError(null);
    fetchProperty(addr.trim())
      .then(setSnapshot)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const fromQuery = params.get('address');
    if (fromQuery) search(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search(address);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Property Search</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter any address to pull assessor, census, HUD rent, and buy-box data.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-xl">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            required
            placeholder="123 Main St, Denver, CO"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          <Search size={14} /> Search
        </button>
      </form>

      {loading && <p className="text-gray-400 text-sm">Pulling public data…</p>}
      {error && <p className="text-rose-400 text-sm mb-6">API {error}</p>}

      {snapshot && (
        <>
          <BuyBoxCard buyBox={snapshot.buyBox} />

          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-8">Data sources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProviderPanel result={snapshot.assessor}>
              <dl className="text-sm text-gray-300 space-y-1">
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
              <dl className="text-sm text-gray-300 space-y-1">
                <Row k="County" v={snapshot.census.data?.countyName} />
                <Row k="County pop." v={fmtNum(snapshot.census.data?.populationCounty)} />
                <Row k="5-yr growth" v={fmtPct(snapshot.census.data?.populationGrowthPct5yr)} />
                <Row k="Tract pop." v={fmtNum(snapshot.census.data?.population)} />
                <Row k="Median HH income" v={fmtMoney(snapshot.census.data?.medianHouseholdIncome)} />
                <Row k="Median gross rent" v={fmtMoney(snapshot.census.data?.medianGrossRent)} />
              </dl>
            </ProviderPanel>

            <ProviderPanel result={snapshot.bls}>
              <dl className="text-sm text-gray-300 space-y-1">
                <Row k="Series" v={snapshot.bls.data?.description} />
                <Row k="YoY growth" v={fmtPct(snapshot.bls.data?.yoyGrowthPct)} />
                <Row k="Latest" v={fmtNum(snapshot.bls.data?.latestValue)} />
              </dl>
            </ProviderPanel>

            <ProviderPanel result={snapshot.hud}>
              <dl className="text-sm text-gray-300 space-y-1">
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
              <dl className="text-sm text-gray-300 space-y-1">
                <Row k="Formatted" v={snapshot.geocode.data?.formatted} />
                <Row k="State" v={snapshot.geocode.data?.stateCode} />
              </dl>
            </ProviderPanel>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number | undefined | null }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex justify-between border-b border-gray-800/60 pb-1 gap-2">
      <dt className="text-gray-500 shrink-0">{k}</dt>
      <dd className="text-gray-200 text-right">{String(v)}</dd>
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
