# SmartInvestorCRM — manual QA checklist

Working list for verifying `smartinvestorcrm.com` (apps/crm) against the live
Firebase project after each deploy. None of this was verified in a real
browser session with a signed-in user during development — this dev sandbox
has no Firebase emulator or test credentials, so everything below needs a
pass by a human with real sign-in access. Check items off as confirmed;
strike through anything that's expected-broken (e.g. still a `ComingSoon`
placeholder) rather than deleting the line, so we don't re-litigate it later.

Legend: **[existing]** = should already have worked before this round of
changes — if it's broken, that's a regression. **[new]** = added/ported in
this PR, never verified live.

## Auth

- [ ] **[existing]** Sign up with email/password creates a `users/{uid}` doc with `plan`
- [ ] **[new]** Sign up with email/password also captures `displayName` from the new "Full name" field
- [ ] **[existing]** Sign up with Google works, `displayName` comes from the Google account
- [ ] **[existing]** Sign in (email/password and Google) redirects to `/app`
- [ ] **[existing]** Forgot-password email actually arrives and resets
- [ ] **[existing]** Sign out returns to `/`
- [ ] **[existing]** Hitting `/app/*` while signed out redirects to `/sign-in`, no flash of dashboard content

## Dashboard

- [ ] **[new]** Greeting shows "Good morning/afternoon/evening, {first name}" (time-based, not static "Welcome back")
- [ ] **[existing]** Active deals / contacts / LOI counts match what's actually in Firestore
- [ ] **[existing]** Recent deals list links to the right deal detail pages

## Deal Board (`/app/deals`)

- [ ] **[existing]** Create a deal, confirm it appears in the list
- [ ] **[new]** List sorts by `updatedAt desc` (edit an older deal, confirm it jumps to the top)
- [ ] **[new]** New deals get `members: []` (check the Firestore doc, or just confirm nothing errors)
- [ ] **[existing]** Deal detail page loads/edits correctly

## Contacts (`/app/contacts`, `/app/contacts/:id`)

- [ ] **[existing]** Create/edit/delete a contact
- [ ] **[existing]** Interaction timeline: add a call/email/note, confirm it shows up in order
- [ ] **[new]** Filings → Add to CRM contacts show up here too (see Filings section)

## LOIs (`/app/loi`)

- [ ] **[existing]** Create an LOI manually, fill out the full form, save
- [ ] **[existing]** Download PDF produces a real, correctly-filled document
- [ ] **[existing]** Mail via PostGrid succeeds when sender + contact address are both set
- [ ] **[new]** Arriving via `/app/loi?address=...&units=...` (from Owner/Followup "Start LOI →") pre-fills the address, opens the form automatically, and the created LOI has the right `units`

## Property Search (`/app/property-search`)

- [ ] **[existing]** Manual address search returns assessor/census/HUD/buy-box data
- [ ] **[new]** Arriving via `/app/property-search?address=...` (from Owner/Followup "Analyze →") auto-runs the search on page load

## Hotspots (`/app/hotspots`)

- [ ] **[existing]** Map loads, neighborhoods are clickable, score colors look right
- [ ] **[existing]** Clicking a neighborhood shows a "Follow-up candidates in this zone →" link, and it goes to a populated Followup page
- [ ] **[new]** Market picker defaults to Denver on first visit; switching markets reloads the map centered on that market and clears the selected-neighborhood panel
- [ ] **[new]** Market picker shows Denver/Phoenix/Nashville/Charlotte/Tampa as selectable and Austin/Raleigh as disabled "(coming soon)" options
- [ ] **[new]** Phoenix map loads all 15 Urban Villages; clicking one shows income/rent/population/rent-burden (may be blank if `CENSUS_API_KEY` isn't set — that's an existing Census-key requirement, not new)
- [ ] **[new]** Nashville map loads all 14 Community Planning Areas
- [ ] **[new]** Charlotte map loads all 15 Community Planning Areas
- [ ] **[new]** Tampa map loads ~107 active neighborhood associations (inactive ones are filtered out)
- [ ] **[new]** "Follow-up candidates in this zone →" link for a non-Denver market's neighborhood goes to Followup and shows the "not available for this market yet" message instead of an error/blank page

## Portfolio (`/app/portfolio`) — new page

- [ ] **[existing]** Owner list loads (Denver 100+ unit clusters)
- [ ] **[existing]** Search-by-owner-name filter works
- [ ] **[existing]** "Out-of-state owners only" checkbox filters correctly
- [ ] **[existing]** Clicking an owner name goes to `/app/owner?name=...&market=denver` with the right owner
- [ ] **[new]** Market picker only allows Denver — every other market is disabled "(coming soon)" since portfolio ownership rollups are Denver-only today
- [ ] **[new]** Header/subtitle read "{Market} ownership clusters" instead of a hardcoded "Denver ownership clusters"

## Owner (`/app/owner`) — new page, reached only via Portfolio/Followup links

- [ ] **[existing]** Portfolio stats (properties, units, avg year, mailing state) render for a real owner name
- [ ] **[existing]** "Unmask owner" button hits the Colorado SOS lookup and shows entity/registered-agent info (or the correct "no match" message)
- [ ] **[existing]** Property table rows link to Property Search and LOI correctly
- [ ] **[new]** Arriving via `?name=...&market=denver` (from Portfolio/Followup) carries the market through; "← All owners" link returns to `/app/portfolio?market=denver`

## Filings (`/app/filings`) — new page

- [ ] SEC Form D search returns results for the default "real estate" / CO filter
- [ ] Changing state/date/keyword filters and re-searching works
- [ ] Expanding a row loads offering + issuer + related-persons detail
- [ ] **"Add to CRM" creates real Firestore contacts** for the issuer + each related person — confirm they show up in `/app/contacts` with the right `ownerId`, since this is a from-scratch reimplementation (apps/web's original wrote through Postgres; this one writes Firestore directly and was never live-tested)
- [ ] Button correctly shows "Added N contacts" afterward and disables re-import

## Followup (`/app/followup`) — new page, reached only via Hotspots zone link

- [ ] **[existing]** Arriving with `?zone=...` loads candidates for that neighborhood
- [ ] **[existing]** Min units / min year filters narrow the list
- [ ] **[existing]** Column sorting (score, units, built, years held, sale price, owner) works both directions
- [ ] **[existing]** Analyze/Start LOI/Owner links all go to the right places
- [ ] **[new]** Arriving with `?market=denver&zone=...` shows candidates for that market/zone; the market picker only allows Denver (others disabled "(coming soon)")
- [ ] **[new]** Switching the market picker on this page navigates back to `/app/hotspots?market=<new>` (since zone names don't carry across markets)

## Playbook (`/app/playbook`) — new page

- [ ] All 10 stages render with checklists and watch-outs
- [ ] "Jump to stage" anchor links scroll correctly
- [ ] CTA links (hotspots, property search, LOI, capital, followup, deals) all resolve

## Cross-cutting / security

- [ ] Sign in as two different users, confirm neither can see the other's deals/contacts/LOIs (Firestore rules isolation, not just a UI hide)
- [ ] Add a second user's uid to a deal's `members` array directly in Firestore console, confirm that user can now read/update (not delete) that deal — the one bit of new `firestore.rules` logic that has no UI to test through yet
- [ ] `market_signals` collection: confirm a signed-in user can read it (once it has data) and a client write is rejected

## Known not-yet-built (don't file these as bugs)

- Market Intel, Capital Raise, Learn, Settings/Billing are `ComingSoon` placeholders, not broken pages
- No invite UI for adding a `members` teammate to a deal/LOI — the field and rules exist, but only reachable by hand-editing Firestore for now
- No standalone underwriting calculator (apps/web's `/deal` page) in apps/crm — Playbook's old CTA for that now points at the Deal Board instead
