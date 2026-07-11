# Roadmap — Deferred work

Live app: https://re.talkstud.io · Repo: `tberch-ts/realestate` · App ID: `181c506b-52e2-43b8-848b-2bd46dca9a15`

## Phase 9d — Geographic expansion beyond Denver

**Status: deferred** (deferred 2026-04-18). Revisit when time/budget allow.

### What's done already (reusable)

- [apps/api/src/providers/marketCompare.ts](../apps/api/src/providers/marketCompare.ts) — scores 20 metros vs Denver (Census + FBI). Ready to ingest per-city portfolio data once we have it.
- [apps/api/src/providers/fbiUcr.ts](../apps/api/src/providers/fbiUcr.ts) — FBI UCR works for ANY US state (not just CO) via dynamic agency index lookup. Cached per-state 30d.
- Census ACS, BLS CES, HUD FMR, landlord-friendliness all work US-wide today.

### What's NOT done (this is the work)

Denver-specific integrations that need per-city replacements:
- [apps/api/src/providers/denverAssessor.ts](../apps/api/src/providers/denverAssessor.ts) — Denver Open Data ArcGIS only
- [apps/api/src/providers/denverPortfolio.ts](../apps/api/src/providers/denverPortfolio.ts) — Denver-only
- [apps/api/src/providers/denverNeighborhoods.ts](../apps/api/src/providers/denverNeighborhoods.ts) — Denver's 78 statistical neighborhoods
- [apps/api/src/providers/denverFollowup.ts](../apps/api/src/providers/denverFollowup.ts) — derived from Denver portfolio

### Paths forward (pick one when resuming)

| Path | Effort | Cost | Coverage |
|---|---|---|---|
| **A. RentCast paid integration** | ~2 hrs | $49/mo for 10k req | All 20 markets in marketCompare at once |
| **B. Per-city free integration** (Maricopa/King/Multnomah first) | 3-5 hrs per city | $0 | One new market per effort block |
| **C. Hybrid** — RentCast as universal fallback + free sources for top 3-5 cities | ~4 hrs | $49/mo | All 20 covered, best-of-breed on top cities |

### Key research already done

The 20-city panel ranked by **Investability vs Denver baseline (50)**:

1. Raleigh (96) · Austin (94) · Boise (89) · San Antonio (88) · Tucson (87) · Tampa (87)
2. Charlotte (84) · Reno (77) · Las Vegas (76) · Phoenix (73) · Boulder (72) · Fort Collins (72) · SLC (71)
3. Nashville (64) · Colorado Springs (61) · Albuquerque (60) · Aurora (57) · Seattle (55)
4. **Denver (50 baseline)** · Portland (49)

`/api/markets/compare` returns this live. Cached 7d in `.cache/markets_compare.json`.

### Investigation gates before implementation

A subagent probed Maricopa/King/Multnomah and confirmed **none are simple drop-in ArcGIS replacements for Denver's pattern**:
- Maricopa has an `mcassessor` API but likely requires token signup + the exact endpoint isn't in the subagent's training data — needs real network probing
- King County: REST parcels are polygon-only; attribute data (owner, units, year) lives in bulk CSV/Access extracts, not REST
- Multnomah / Portland: similar — taxlot geometry via RLIS, but detailed assessor fields via PortlandMaps scrape or DART

### When resuming

**Run this first** to reset context:
```bash
# Verify app health
curl --ssl-no-revoke -u mfa:Sunrise-Crane-Altitude-8421 https://re.talkstud.io/healthz
# Re-check current market scoring
curl --ssl-no-revoke -u mfa:Sunrise-Crane-Altitude-8421 "https://re.talkstud.io/api/markets/compare?force=1" | head -c 500
```

Then decide on Path A/B/C and grant the assistant **network access / WebFetch** for the chosen path so it can probe endpoints live instead of guessing.

---

## Phase 9f — HUD_API_TOKEN + BLS_API_KEY

**Status: waiting on user signup.** Both free, ~90 sec total.

1. Register at https://www.huduser.gov/portal/dataset/fmr-api.html → paste `HUD_API_TOKEN` to me
2. Register at https://data.bls.gov/registrationEngine/ → paste `BLS_API_KEY` to me

When supplied, inject via:
```bash
# Pull a temp spec, edit in the secrets, apply. DO NOT commit the temp spec.
doctl apps spec get 181c506b-52e2-43b8-848b-2bd46dca9a15 > /tmp/mfa.yaml
# edit /tmp/mfa.yaml to fill HUD_API_TOKEN and BLS_API_KEY values
doctl apps update 181c506b-52e2-43b8-848b-2bd46dca9a15 --spec /tmp/mfa.yaml
rm /tmp/mfa.yaml
```

Impact: HUD turns `needs_credentials` → `ok` (Fair Market Rents on every property page). BLS goes from anonymous 25/day → registered 500/day.

---

## Other candidate work (from Phase 8 handoff, not yet started)

- **Smaller-operator portfolio dataset** — current Denver portfolio is filtered to 100+ units, which misses small syndicators like ALL PRO. Add a lower-threshold variant so sponsor-portfolio auto-linking catches more.
- **Gmail OAuth + IMAP reply sync** — upgrade 9e from mailto fire-and-forget to real SMTP send + auto-detect replies.
- **CRM deduplication** — when "ALL PRO CAPITAL LLC" appears in multiple Form D filings, current code creates a fresh contact per filing's source_ref. Should collapse onto a single contact entity.
- **Form D dashboard widgets on Home** — "this week's new sponsors in CO" tile.
- **Property page: show matched contacts** — when viewing a property whose owner is already in CRM, surface the contact card inline.
