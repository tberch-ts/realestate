import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  addDoc, collection, getDocs, onSnapshot, orderBy, query, serverTimestamp, where,
} from 'firebase/firestore'
import { ExternalLink, List, Map as MapIcon, MessageSquareText, Search } from 'lucide-react'
import type { LandLeadResult, LandLeadScored, MarketKey } from '@mfa/shared'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { fetchLandLeads } from '../lib/api'
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets'
import { loadGoogleMaps } from '../lib/googleMaps'
import { GOOGLE_MAPS_API_KEY as MAPS_KEY } from '../lib/runtimeEnv'
import { DARK_MAP_STYLE } from '../lib/mapStyle'
import { matchLeadToBuyBoxes, bestMatch, type BuyBoxMatch } from '../lib/landMatch'
import { ownerFirstName } from '../lib/outreachScripts'
import { zillowSoldLotsUrl, zillowNewConstructionUrl, zillowForSaleLotsUrl } from '../lib/zillowLinks'
import MarketSelect from '../components/MarketSelect'
import ScriptModal from '../components/ScriptModal'
import type { BuilderBuyBox } from '../lib/collections'

// The "one-click flip" lead finder: every vacant-lot owner in the market
// matching your filters, ranked by contact priority. Key default: owners
// who have held 10+ years (recent purchasers excluded) — they're the ones
// who sell at a discount. Matched against your active builder buy boxes.

const INPUT = 'rounded-lg border px-3 py-1.5 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

export default function LandLeads() {
  const { user } = useAuth()
  const { markets } = useMarkets()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [market, setMarket] = useState<MarketKey>((searchParams.get('market') as MarketKey) || getStoredMarket())
  const cfg = markets.find((m) => m.key === market)

  // If the stored market doesn't support land, hop to the first that does.
  useEffect(() => {
    if (!markets.length || searchParams.get('market')) return
    const cur = markets.find((m) => m.key === market)
    if (cur && !cur.landSupported) {
      const firstLand = markets.find((m) => m.landSupported)
      if (firstLand) setMarket(firstLand.key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets])

  // ---- filters (applied on Search click; defaults mirror the strategy) ----
  const [zips, setZips] = useState(searchParams.get('zips') ?? '')
  const [minAcres, setMinAcres] = useState('0.1')
  const [maxAcres, setMaxAcres] = useState('')
  const [minYearsHeld, setMinYearsHeld] = useState('10')
  const [includeUnknown, setIncludeUnknown] = useState(true)
  const [outOfState, setOutOfState] = useState(false)
  const [outOfCounty, setOutOfCounty] = useState(false)
  const [limit, setLimit] = useState('200')

  const [result, setResult] = useState<LandLeadResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [searchTick, setSearchTick] = useState(0)

  // ---- active buy boxes (live) ----
  const [boxes, setBoxes] = useState<BuilderBuyBox[]>([])
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'builder_buy_boxes'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc')),
      (snap) => setBoxes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BuilderBuyBox))
    )
  }, [user])

  // ---- fetch leads ----
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchLandLeads(market, {
      zips: zips.trim() ? zips.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
      minAcres: numOrUndef(minAcres),
      maxAcres: numOrUndef(maxAcres),
      minYearsHeld: numOrUndef(minYearsHeld),
      includeUnknownSaleDate: includeUnknown,
      outOfStateOwner: outOfState || undefined,
      outOfCountyOwner: outOfCounty || undefined,
      limit: numOrUndef(limit),
    })
      .then((r) => !cancelled && setResult(r))
      .catch((e: Error) => {
        if (!cancelled) {
          setResult(null)
          setError(e.message)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, searchTick])

  const matchesByLead = useMemo(() => {
    const m = new Map<LandLeadScored, BuyBoxMatch[]>()
    if (!result) return m
    for (const lead of result.leads) m.set(lead, matchLeadToBuyBoxes(lead, boxes))
    return m
  }, [result, boxes])

  const [scriptLead, setScriptLead] = useState<LandLeadScored | null>(null)
  const [savedParcels, setSavedParcels] = useState<Record<string, string>>({}) // parcelId -> contactId

  async function saveToCrm(lead: LandLeadScored): Promise<string | undefined> {
    if (!user || !lead.owner) return
    const key = lead.parcelId ?? `${lead.owner}:${lead.zip}`
    if (savedParcels[key]) return savedParcels[key]

    // Dedup: same owner name already in contacts → reuse it.
    const existing = await getDocs(
      query(collection(db, 'contacts'), where('ownerId', '==', user.uid), where('name', '==', lead.owner))
    )
    let contactId = existing.docs[0]?.id
    if (!contactId) {
      const ref = await addDoc(collection(db, 'contacts'), {
        ownerId: user.uid,
        name: lead.owner,
        kind: 'seller',
        notes: contactNotes(lead, cfg?.label),
        ...(lead.ownerMailingAddress ? { addressLine1: lead.ownerMailingAddress } : {}),
        ...(lead.ownerMailingState ? { stateCode: lead.ownerMailingState } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      contactId = ref.id
    }
    await addDoc(collection(db, 'contacts', contactId, 'interactions'), {
      ownerId: user.uid,
      kind: 'note',
      subject: 'Imported from Land Leads',
      body: contactNotes(lead, cfg?.label),
      occurredAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
    setSavedParcels((s) => ({ ...s, [key]: contactId! }))
    return contactId
  }

  async function createLandDeal(lead: LandLeadScored) {
    if (!user) return
    const match = bestMatch(matchesByLead.get(lead) ?? [])
    const contractPrice = match?.pass ? match.suggestedOffer : undefined
    const builderPrice = match?.pass ? match.builderPrice : undefined
    const ref = await addDoc(collection(db, 'deals'), {
      ownerId: user.uid,
      members: [],
      address: lead.address || `Parcel ${lead.parcelId ?? '?'} (${lead.zip ?? cfg?.label ?? ''})`,
      strategy: 'land',
      status: 'lead',
      ...(lead.parcelId ? { parcelId: lead.parcelId } : {}),
      ...(lead.lotAcres != null ? { lotAcres: lead.lotAcres } : {}),
      ...(contractPrice != null ? { contractPrice } : {}),
      ...(builderPrice != null ? { builderPrice } : {}),
      ...(contractPrice != null && builderPrice != null ? { assignmentFee: builderPrice - contractPrice } : {}),
      ...(match?.pass ? { builderBuyBoxId: match.box.id } : {}),
      notes: contactNotes(lead, cfg?.label),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    navigate(`/app/deals/${ref.id}`)
  }

  function onMarketChange(next: MarketKey) {
    setMarket(next)
    setStoredMarket(next)
    setResult(null)
  }

  const zillowQuery = zips.trim() ? zips.split(',')[0].trim() : cfg?.label ?? ''

  return (
    <div>
      <div className="mb-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Land Leads</h1>
          <p className="text-sm text-gray-500">
            Every vacant-lot owner matching your filters in {cfg?.label ?? 'this market'}, ranked by
            contact priority — long-hold owners first, recent purchasers excluded.
          </p>
        </div>
        <MarketSelect value={market} onChange={onMarketChange} capability="landSupported" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="text-gray-500">Verify demand on Zillow:</span>
        <ZLink href={zillowSoldLotsUrl(zillowQuery)} label="Sold lots" />
        <ZLink href={zillowNewConstructionUrl(zillowQuery)} label="New construction" />
        <ZLink href={zillowForSaleLotsUrl(zillowQuery)} label="Lots for sale" />
      </div>

      {/* ---- filter panel ---- */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearchTick((t) => t + 1)
        }}
        className="rounded-xl border p-3 mb-4 flex flex-wrap gap-3 items-end"
        style={bd}
      >
        <Filter label="Zip codes (comma-sep)">
          <input className={`${INPUT} w-44`} style={bd} placeholder="27610, 27603" value={zips} onChange={(e) => setZips(e.target.value)} />
        </Filter>
        <Filter label="Min acres">
          <input className={`${INPUT} w-20`} style={bd} value={minAcres} onChange={(e) => setMinAcres(e.target.value)} />
        </Filter>
        <Filter label="Max acres">
          <input className={`${INPUT} w-20`} style={bd} value={maxAcres} onChange={(e) => setMaxAcres(e.target.value)} />
        </Filter>
        <Filter label="Owned ≥ years (excludes recent buyers)">
          <input className={`${INPUT} w-20`} style={bd} value={minYearsHeld} onChange={(e) => setMinYearsHeld(e.target.value)} />
        </Filter>
        <Filter label="Max results">
          <input className={`${INPUT} w-20`} style={bd} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Filter>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 pb-2 cursor-pointer">
          <input type="checkbox" checked={includeUnknown} onChange={(e) => setIncludeUnknown(e.target.checked)} />
          Include no-recorded-sale (likely decades-held)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 pb-2 cursor-pointer">
          <input type="checkbox" checked={outOfState} onChange={(e) => setOutOfState(e.target.checked)} />
          Out-of-state owners only
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 pb-2 cursor-pointer">
          <input type="checkbox" checked={outOfCounty} onChange={(e) => setOutOfCounty(e.target.checked)} />
          Out-of-county owners only
        </label>
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Search size={14} /> Get leads
        </button>
        <div className="ml-auto flex items-center gap-1">
          <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={<List size={14} />} label="List" />
          <ViewBtn active={view === 'map'} onClick={() => setView('map')} icon={<MapIcon size={14} />} label="Map" />
        </div>
      </form>

      {loading && <p className="text-gray-400 text-sm">Querying {cfg?.label ?? 'market'} vacant parcels…</p>}
      {error && <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>}

      {result && !loading && (
        <p className="text-xs text-gray-500 mb-2">
          {result.count} lead{result.count === 1 ? '' : 's'}
          {result.count > result.leads.length ? ` (showing top ${result.leads.length})` : ''}
          {boxes.filter((b) => b.active).length === 0 && (
            <>
              {' · '}
              <Link to="/app/land/buy-boxes" className="text-blue-400 hover:text-blue-300">
                Add a builder buy box
              </Link>{' '}
              to see instant matches + suggested offers.
            </>
          )}
        </p>
      )}

      {result && view === 'map' && <LeadsMap leads={result.leads} center={cfg?.center} />}

      {result && view === 'list' && result.leads.length > 0 && (
        <div className="rounded-xl border overflow-x-auto" style={bd}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b" style={bd}>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Owner</th>
                <th className="py-2 px-3 font-medium">Lot</th>
                <th className="py-2 px-3 font-medium text-right">Acres</th>
                <th className="py-2 px-3 font-medium text-right">Held</th>
                <th className="py-2 px-3 font-medium">Buy-box match</th>
                <th className="py-2 px-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {result.leads.map((lead) => (
                <LeadRow
                  key={lead.parcelId ?? `${lead.owner}:${lead.centroid.join(',')}`}
                  lead={lead}
                  matches={matchesByLead.get(lead) ?? []}
                  saved={!!savedParcels[lead.parcelId ?? `${lead.owner}:${lead.zip}`]}
                  onSave={() => saveToCrm(lead)}
                  onScripts={() => setScriptLead(lead)}
                  onDeal={() => createLandDeal(lead)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && !loading && result.leads.length === 0 && (
        <div className="p-4 rounded border text-gray-400 text-sm" style={bd}>
          No leads with these filters. Try widening the acreage range, lowering "owned ≥ years", or removing zips.
        </div>
      )}

      {scriptLead && (
        <ScriptModal
          ctx={{
            ownerFirstName: ownerFirstName(scriptLead.owner),
            yearsHeld: scriptLead.signals.yearsHeld,
            lotAcres: scriptLead.lotAcres,
            areaLabel: scriptLead.city ?? scriptLead.zip ?? cfg?.label,
            address: scriptLead.address,
            offerPrice: bestMatch(matchesByLead.get(scriptLead) ?? [])?.pass
              ? bestMatch(matchesByLead.get(scriptLead) ?? [])?.suggestedOffer
              : undefined,
          }}
          onClose={() => setScriptLead(null)}
          onLogOutreach={async () => {
            const contactId = await saveToCrm(scriptLead)
            if (!contactId || !user) return
            await addDoc(collection(db, 'contacts', contactId, 'interactions'), {
              ownerId: user.uid,
              kind: 'outreach_sent',
              subject: 'Land outreach script sent',
              occurredAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            })
          }}
        />
      )}
    </div>
  )
}

function LeadRow({
  lead,
  matches,
  saved,
  onSave,
  onScripts,
  onDeal,
}: {
  lead: LandLeadScored
  matches: BuyBoxMatch[]
  saved: boolean
  onSave: () => void
  onScripts: () => void
  onDeal: () => void
}) {
  const best = bestMatch(matches)
  return (
    <tr className="border-t hover:bg-white/5 transition-colors" style={bd}>
      <td className="py-2 px-3 align-top">
        <span className={`text-lg font-bold ${scoreColor(lead.score)}`}>{lead.score}</span>
      </td>
      <td className="py-2 px-3 align-top">
        <p className="text-gray-100">{lead.owner ?? '—'}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          <Badge cls={OWNER_TIERS[lead.signals.ownerType].cls}>{OWNER_TIERS[lead.signals.ownerType].label}</Badge>
          {lead.signals.outOfStateOwner && lead.ownerMailingState && (
            <Badge cls="border-amber-500/40 bg-amber-500/10 text-amber-200">OOS: {lead.ownerMailingState}</Badge>
          )}
          {lead.signals.outOfCountyOwner && (
            <Badge cls="border-orange-500/40 bg-orange-500/10 text-orange-200">Out-of-county</Badge>
          )}
        </div>
        {lead.reasons.length > 0 && <p className="text-xs text-gray-500 italic mt-0.5">{lead.reasons.join(' · ')}</p>}
      </td>
      <td className="py-2 px-3 align-top text-gray-300">
        {lead.address ?? <span className="text-gray-600">No situs address</span>}
        <p className="text-xs text-gray-500">
          {[lead.city, lead.zip].filter(Boolean).join(' ')}
          {lead.landUseLabel ? ` · ${lead.landUseLabel.replace(/_/g, ' ')}` : ''}
        </p>
      </td>
      <td className="py-2 px-3 align-top text-right text-gray-200">
        {lead.lotAcres != null ? lead.lotAcres.toFixed(2) : '—'}
      </td>
      <td className="py-2 px-3 align-top text-right text-gray-300">
        {lead.signals.yearsHeld != null ? `${lead.signals.yearsHeld}y` : '∞'}
      </td>
      <td className="py-2 px-3 align-top">
        {best ? (
          best.pass ? (
            <div>
              <Badge cls="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                {best.box.builderName} pays {fmtMoney(best.builderPrice)}
              </Badge>
              <p className="text-xs text-emerald-300 mt-1">
                Offer ~{fmtMoney(best.suggestedOffer)} → {fmtMoney(best.builderPrice - best.suggestedOffer)} spread
              </p>
            </div>
          ) : (
            <div>
              <Badge cls="border-gray-600 bg-gray-800/60 text-gray-400">Near miss: {best.box.builderName}</Badge>
              <p className="text-xs text-gray-500 mt-1">{best.failures.join(' · ')}</p>
            </div>
          )
        ) : (
          <span className="text-xs text-gray-600">No box covers {lead.zip ?? 'this zip'}</span>
        )}
      </td>
      <td className="py-2 px-3 align-top text-right whitespace-nowrap">
        <div className="flex flex-col gap-1 items-end text-xs">
          <button onClick={onSave} className={saved ? 'text-gray-500' : 'text-blue-400 hover:text-blue-300'}>
            {saved ? 'Saved ✓' : 'Save to CRM →'}
          </button>
          <button onClick={onScripts} className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
            <MessageSquareText size={11} /> Scripts →
          </button>
          <Link
            to={`/app/land/contract?${contractParams(lead, best)}`}
            className="text-purple-400 hover:text-purple-300"
          >
            Contract →
          </Link>
          <button onClick={onDeal} className="text-amber-400 hover:text-amber-300">
            New deal →
          </button>
        </div>
      </td>
    </tr>
  )
}

// ---- map view: score-colored pins ----

function LeadsMap({ leads, center }: { leads: LandLeadScored[]; center?: [number, number] }) {
  const mapDiv = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!MAPS_KEY) {
        setMapError('Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY.')
        return
      }
      try {
        const maps = await loadGoogleMaps(MAPS_KEY)
        if (cancelled || !mapDiv.current) return
        const map =
          mapRef.current ??
          new maps.Map(mapDiv.current, {
            zoom: 10,
            styles: DARK_MAP_STYLE,
            clickableIcons: false,
          })
        mapRef.current = map
        if (center) map.setCenter({ lat: center[1], lng: center[0] })

        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        const info = new maps.InfoWindow()
        const bounds = new maps.LatLngBounds()

        for (const lead of leads) {
          const [lng, lat] = lead.centroid
          const marker = new maps.Marker({
            map,
            position: { lat, lng },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: pinColor(lead.score),
              fillOpacity: 0.9,
              strokeColor: '#0f172a',
              strokeWeight: 1,
            },
            title: lead.owner ?? lead.parcelId ?? '',
          })
          marker.addListener('click', () => {
            info.setContent(
              `<div style="color:#111;font-size:12px;max-width:220px">` +
                `<strong>${esc(lead.owner ?? 'Unknown owner')}</strong><br/>` +
                `${esc(lead.address ?? 'No situs address')}<br/>` +
                `${lead.lotAcres != null ? `${lead.lotAcres.toFixed(2)} ac · ` : ''}` +
                `${lead.signals.yearsHeld != null ? `held ${lead.signals.yearsHeld}y · ` : ''}score ${lead.score}` +
                `</div>`
            )
            info.open({ map, anchor: marker })
          })
          markersRef.current.push(marker)
          bounds.extend({ lat, lng })
        }
        if (leads.length > 0) map.fitBounds(bounds, 40)
      } catch (e) {
        if (!cancelled) setMapError((e as Error).message)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [leads, center])

  if (mapError) {
    return <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{mapError}</div>
  }
  return <div ref={mapDiv} className="w-full h-[520px] rounded-xl border" style={bd} />
}

// ---- small helpers ----

function contactNotes(lead: LandLeadScored, marketLabel?: string): string {
  return [
    `Vacant-lot lead${marketLabel ? ` (${marketLabel})` : ''} — score ${lead.score}`,
    lead.parcelId ? `Parcel: ${lead.parcelId}` : null,
    lead.address ? `Lot: ${lead.address}` : null,
    lead.lotAcres != null ? `${lead.lotAcres.toFixed(2)} acres` : null,
    lead.signals.yearsHeld != null ? `Held ${lead.signals.yearsHeld} years` : 'No recorded sale (likely decades-held)',
    lead.ownerMailingAddress ? `Mailing: ${lead.ownerMailingAddress}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function contractParams(lead: LandLeadScored, best?: BuyBoxMatch): string {
  const p = new URLSearchParams()
  if (lead.address) p.set('address', lead.address)
  if (lead.parcelId) p.set('parcelId', lead.parcelId)
  if (lead.owner) p.set('seller', lead.owner)
  if (best?.pass) p.set('price', String(best.suggestedOffer))
  return p.toString()
}

function numOrUndef(s: string): number | undefined {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-300'
  if (score >= 80) return 'text-lime-300'
  if (score >= 60) return 'text-amber-200'
  if (score >= 40) return 'text-orange-300'
  return 'text-gray-400'
}

function pinColor(score: number): string {
  if (score >= 90) return '#6ee7b7'
  if (score >= 80) return '#bef264'
  if (score >= 60) return '#fde68a'
  if (score >= 40) return '#fdba74'
  return '#9ca3af'
}

const OWNER_TIERS: Record<LandLeadScored['signals']['ownerType'], { label: string; cls: string }> = {
  individual: { label: 'Individual/Trust', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  llc: { label: 'LLC', cls: 'border-lime-500/40 bg-lime-500/10 text-lime-200' },
  institutional: { label: 'Institutional', cls: 'border-gray-600 bg-gray-700/40 text-gray-300' },
  unknown: { label: 'Unknown', cls: 'border-gray-600 bg-gray-800/60 text-gray-400' },
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-xs text-gray-500">
      <span className="mb-1">{label}</span>
      {children}
    </label>
  )
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
        active ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'text-gray-500 hover:text-gray-300'
      }`}
      style={active ? undefined : bd}
    >
      {icon} {label}
    </button>
  )
}

function ZLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
    >
      {label} <ExternalLink size={11} />
    </a>
  )
}
