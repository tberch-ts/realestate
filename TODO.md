# Open items — consolidated 2026-07-13

Supersedes the previous contents of this file (a DigitalOcean App Platform
deploy plan from Phase 6 — abandoned; see [project-docs/DEPLOY_FLY.md](project-docs/DEPLOY_FLY.md)
for the current Fly.io + GitHub Pages topology, which is live). Pulls together
scattered open items from `project-docs/ROADMAP.md`, `QA_CHECKLIST.md`,
`HANDOFF.md`, and this session's work so there's one place to pick up from.

## 1. Land this session's work (Market Intel + Capital Raise)

Built in `apps/crm` on branch `claude/market-intel-capital-raise-9d68e9`, not yet committed:

- [ ] Review and commit: `apps/crm/src/pages/MarketIntel.tsx`, `CapitalRaise.tsx`,
      `CapitalRaiseDetail.tsx`, plus edits to `lib/api.ts`, `lib/collections.ts`,
      `main.tsx`, `firestore.indexes.json`, `project-docs/QA_CHECKLIST.md`
- [ ] Deploy the new Firestore index: `firebase deploy --only firestore:indexes --project smartinvestorcrm`
      (capital_raises: ownerId asc + updatedAt desc — first live query against it will
      otherwise fail with a "missing index" error and a console link)
- [ ] Rebuild `docs/` for GitHub Pages **with a real repo-root `.env`** (needs
      `VITE_GOOGLE_MAPS_API_KEY` at minimum) before merging — a build without it
      silently ships a broken bundle (see the incident noted in `runtimeEnv.ts`
      and DEPLOY_FLY.md). This worktree has no real `.env`, only `.env.example`,
      so the build was verified for compile-correctness only, not rebuilt into `docs/`.
- [ ] Live QA per the new checklist sections in `project-docs/QA_CHECKLIST.md`
      ("Market Intel" and "Capital Raise") — this dev sandbox has no Firebase
      emulator or test login, so someone with real sign-in access needs to
      click through both features once deployed.

## 2. Deploy / infra follow-ups

- [ ] **Reconcile `functions/index.js`** (Firebase Functions wrapping the Express
      API) vs. `mfa-api.fly.dev` (Fly.io, what `runtimeEnv.ts` actually points
      production builds at). The Functions path looks like a leftover from
      before the Fly.io migration — confirm whether it's still deployed/used
      anywhere, and delete it if not, or document why it's kept.
- [ ] **Phase 9f — HUD_API_TOKEN + BLS_API_KEY**: waiting on user signup (both
      free, ~90 sec each). See `project-docs/ROADMAP.md` for the exact signup
      links and the `fly secrets set` command to inject once obtained. Unlocks
      Fair Market Rents on every property page + raises BLS from 25/day to 500/day.

## 3. Feature backlog (from `project-docs/ROADMAP.md`)

- [ ] **Phase 9d — geographic expansion beyond Denver** (deferred 2026-04-18).
      Pick Path A (RentCast paid, ~2hrs/$49mo), B (per-city free, 3-5hrs/city),
      or C (hybrid) — see ROADMAP.md for the full 20-city investability ranking
      already computed and the per-city investigation notes (Maricopa/King/Multnomah).
- [ ] Smaller-operator portfolio dataset — current Denver portfolio filters to
      100+ unit buildings, missing small syndicators (e.g. ALL PRO). Add a
      lower-threshold variant.
- [ ] Gmail OAuth + IMAP reply sync — upgrade outreach from mailto fire-and-forget
      to real SMTP send + auto-detected replies.
- [ ] CRM deduplication — repeat sponsor names across Form D filings (e.g. "ALL
      PRO CAPITAL LLC") currently create a fresh contact per filing instead of
      collapsing onto one entity.
- [ ] Form D dashboard widget on Home — "this week's new sponsors in CO" tile.
- [ ] Property page: surface matched CRM contacts inline when the owner is
      already in the user's contacts.

## 4. Known gaps (from `QA_CHECKLIST.md`)

- [ ] `Learn` and parts of `Settings/Billing` are still `ComingSoon` placeholders.
- [ ] No invite UI for adding a `members` teammate to a deal/LOI/capital raise —
      the field and Firestore rules support it, only reachable by hand-editing
      Firestore today.
- [ ] No standalone underwriting calculator in `apps/crm` (existed as `apps/web`'s
      `/deal` page) — Playbook's CTA for it currently points at the Deal Board instead.

## 5. Stale docs worth reconciling

- [ ] `project-docs/ACQUISITION_CRITERIA.md` marks job growth (BLS), crime (FBI
      UCR), and landlord-friendliness as "not yet implemented — add in next
      phase" — all three are actually implemented (`apps/api/src/providers/bls.ts`,
      `fbiUcr.ts`, `landlordFriendliness.ts`). Update the doc to match reality.
- [ ] `project-docs/data-sources-by-msa.md` has per-MSA `deferred` markers
      (Phoenix/Austin/Nashville/Charlotte/Tampa/Raleigh — assessor/neighborhoods/
      followup/portfolio) that should be revisited alongside Phase 9d above.
