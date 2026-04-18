import { Router } from 'express';
import {
  createContact, getContact, listContacts, patchContact, deleteContact, findContactBySource,
} from '../db/contactsRepo.js';
import type { ContactCreate, ContactSource, ContactStatus } from '../db/contactsRepo.js';
import {
  createInteraction, listInteractionsForContact, deleteInteraction,
} from '../db/interactionsRepo.js';
import {
  createFollowUp, listFollowUps, patchFollowUp, deleteFollowUp,
} from '../db/followUpsRepo.js';
import type { FollowUpStatus } from '../db/followUpsRepo.js';
import {
  linkContactProperty, unlinkContactProperty, listPropertiesForContact, listContactsForProperty,
  linkContactFiling, listFilingsForContact,
} from '../db/contactLinksRepo.js';
import type { PropertyRelation, FilingRelation } from '../db/contactLinksRepo.js';
import { getFormDDetail } from '../providers/edgarFormD.js';
import { fetchDenverOwners } from '../providers/denverPortfolio.js';
import { matchScore } from '../providers/nameMatch.js';

export const crmRouter = Router();

// ---- Contacts ----
crmRouter.get('/contacts', async (req, res) => {
  try {
    const status = (req.query.status as ContactStatus | 'all' | undefined) ?? 'active';
    const source = req.query.source as ContactSource | undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = Number(req.query.limit ?? 200);
    const rows = await listContacts({ status, source, search, limit });
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'list_contacts_failed', message: (err as Error).message });
  }
});

crmRouter.post('/contacts', async (req, res) => {
  try {
    const body = req.body as ContactCreate;
    if (!body.name || !body.kind) {
      res.status(400).json({ error: 'name and kind are required' });
      return;
    }
    const contact = await createContact(body);
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'create_contact_failed', message: (err as Error).message });
  }
});

crmRouter.get('/contacts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contact = await getContact(id);
    if (!contact) { res.status(404).json({ error: 'not_found' }); return; }
    const [interactions, followUps, properties, filings] = await Promise.all([
      listInteractionsForContact(id),
      listFollowUps({ contactId: id, status: 'all', limit: 100 }),
      listPropertiesForContact(id),
      listFilingsForContact(id),
    ]);
    res.json({ contact, interactions, followUps, properties, filings });
  } catch (err) {
    res.status(500).json({ error: 'get_contact_failed', message: (err as Error).message });
  }
});

crmRouter.patch('/contacts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contact = await patchContact(id, req.body);
    if (!contact) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'patch_contact_failed', message: (err as Error).message });
  }
});

crmRouter.delete('/contacts/:id', async (req, res) => {
  try {
    const ok = await deleteContact(Number(req.params.id));
    if (!ok) { res.status(404).json({ error: 'not_found' }); return; }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'delete_contact_failed', message: (err as Error).message });
  }
});

// ---- Interactions ----
crmRouter.post('/contacts/:id/interactions', async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    const { kind, occurredAt, subject, body } = req.body ?? {};
    if (!kind) { res.status(400).json({ error: 'kind required' }); return; }
    const row = await createInteraction({ contactId, kind, occurredAt, subject, body });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'create_interaction_failed', message: (err as Error).message });
  }
});

crmRouter.delete('/interactions/:id', async (req, res) => {
  try {
    const ok = await deleteInteraction(Number(req.params.id));
    if (!ok) { res.status(404).json({ error: 'not_found' }); return; }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'delete_interaction_failed', message: (err as Error).message });
  }
});

// ---- Follow-ups ----
crmRouter.get('/follow-ups', async (req, res) => {
  try {
    const status = (req.query.status as FollowUpStatus | 'all' | undefined) ?? 'open';
    const dueBefore = typeof req.query.dueBefore === 'string' ? req.query.dueBefore : undefined;
    const limit = Number(req.query.limit ?? 200);
    const rows = await listFollowUps({ status, dueBefore, limit });
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'list_follow_ups_failed', message: (err as Error).message });
  }
});

crmRouter.post('/contacts/:id/follow-ups', async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    const { dueDate, subject, notes } = req.body ?? {};
    if (!dueDate || !subject) { res.status(400).json({ error: 'dueDate and subject required' }); return; }
    const fu = await createFollowUp({ contactId, dueDate, subject, notes });
    res.status(201).json(fu);
  } catch (err) {
    res.status(500).json({ error: 'create_follow_up_failed', message: (err as Error).message });
  }
});

crmRouter.patch('/follow-ups/:id', async (req, res) => {
  try {
    const fu = await patchFollowUp(Number(req.params.id), req.body);
    if (!fu) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(fu);
  } catch (err) {
    res.status(500).json({ error: 'patch_follow_up_failed', message: (err as Error).message });
  }
});

crmRouter.delete('/follow-ups/:id', async (req, res) => {
  try {
    const ok = await deleteFollowUp(Number(req.params.id));
    if (!ok) { res.status(404).json({ error: 'not_found' }); return; }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'delete_follow_up_failed', message: (err as Error).message });
  }
});

// ---- Property + filing links ----
crmRouter.post('/contacts/:id/properties', async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    const { propertyRef, relation, notes } = req.body ?? {};
    if (!propertyRef || !relation) { res.status(400).json({ error: 'propertyRef and relation required' }); return; }
    await linkContactProperty(contactId, propertyRef, relation as PropertyRelation, notes);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'link_property_failed', message: (err as Error).message });
  }
});

crmRouter.delete('/contacts/:id/properties/:propertyRef/:relation', async (req, res) => {
  try {
    await unlinkContactProperty(
      Number(req.params.id),
      decodeURIComponent(req.params.propertyRef),
      req.params.relation as PropertyRelation,
    );
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'unlink_property_failed', message: (err as Error).message });
  }
});

crmRouter.get('/properties/:propertyRef/contacts', async (req, res) => {
  try {
    const rows = await listContactsForProperty(decodeURIComponent(req.params.propertyRef));
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'list_property_contacts_failed', message: (err as Error).message });
  }
});

// Helper: scan Denver portfolio for owners whose name matches a contact name,
// return matching properties (parcelId + address + units). Best-effort: silently
// returns empty on fetch failure.
async function matchContactToPortfolio(contactName: string): Promise<
  Array<{ propertyRef: string; ownerName: string; score: number; units: number; address: string }>
> {
  try {
    const data = await fetchDenverOwners({ limit: 500 });
    if (data.status !== 'ok' || !data.data) return [];
    const clusters = data.data.clusters;
    const matches: Array<{ propertyRef: string; ownerName: string; score: number; units: number; address: string }> = [];
    for (const c of clusters) {
      const score = matchScore(contactName, c.owner);
      if (score >= 80) {
        for (const p of c.properties) {
          const ref = p.parcelId ? `parcel:${p.parcelId}` : `addr:${p.address.toLowerCase()}`;
          matches.push({ propertyRef: ref, ownerName: c.owner, score, units: p.units ?? 0, address: p.address });
        }
      }
    }
    return matches;
  } catch { return []; }
}

// Import-from-filing: given a Form D accession, auto-create contacts for each related person
// plus the issuer, link them to the filing. Idempotent via (source, source_ref).
// Also scans the Denver portfolio for matching owner names and auto-creates property links.
crmRouter.post('/contacts/from-form-d', async (req, res) => {
  try {
    const { accession, cik } = req.body ?? {};
    if (!accession || !cik) { res.status(400).json({ error: 'accession and cik required' }); return; }
    const detail = await getFormDDetail(accession, cik);
    if (!detail) { res.status(404).json({ error: 'filing not found' }); return; }

    const created: { contactId: number; name: string; relation: FilingRelation; portfolioMatches: number }[] = [];

    async function autoLinkPortfolio(contactId: number, name: string): Promise<number> {
      const matches = await matchContactToPortfolio(name);
      for (const m of matches) {
        await linkContactProperty(contactId, m.propertyRef, 'owner',
          `Auto-matched from Denver portfolio (score ${m.score}). ${m.units} units at ${m.address}.`);
      }
      return matches.length;
    }

    // Issuer: firm contact
    const issuerRef = `form_d:${accession}:issuer`;
    let issuer = await findContactBySource('form_d', issuerRef);
    if (!issuer && detail.issuerName) {
      issuer = await createContact({
        kind: 'firm',
        name: detail.issuerName,
        firmName: detail.issuerName,
        addressLine1: detail.issuerAddress?.street1,
        addressLine2: detail.issuerAddress?.street2,
        city: detail.issuerAddress?.city,
        stateCode: detail.issuerAddress?.state,
        zip: detail.issuerAddress?.zip,
        phone: detail.issuerPhone,
        notes: `Auto-imported from SEC Form D ${detail.form} ${accession}. Industry: ${detail.industryGroupType ?? '(n/a)'}. Offering: ${detail.totalOfferingAmount ?? '?'}. Sold: $${detail.totalAmountSold ?? 0}. Investors: ${detail.investorCount ?? '?'}.`,
        source: 'form_d',
        sourceRef: issuerRef,
        tags: ['form_d', 'issuer'],
      });
    }
    if (issuer) {
      await linkContactFiling(issuer.id, accession, cik, 'issuer');
      const portfolioMatches = await autoLinkPortfolio(issuer.id, issuer.name);
      created.push({ contactId: issuer.id, name: issuer.name, relation: 'issuer', portfolioMatches });
    }

    // Related persons: one contact per person/firm
    for (const p of detail.relatedPersons ?? []) {
      const ref = `form_d:${accession}:${p.name}`;
      let c = await findContactBySource('form_d', ref);
      if (!c) {
        const isFirm = /\b(LLC|LLP|LP|INC|CORP|CAPITAL|MANAGEMENT|HOLDINGS|PARTNERS|FUND|GROUP|COMPANY)\b/i.test(p.name);
        c = await createContact({
          kind: isFirm ? 'firm' : 'person',
          name: p.name,
          city: p.address?.city,
          stateCode: p.address?.state,
          zip: p.address?.zip,
          notes: `Imported from SEC Form D ${accession}. Relationship: ${p.relationship.join(', ')}${p.clarification ? ` (${p.clarification})` : ''}.`,
          source: 'form_d',
          sourceRef: ref,
          tags: ['form_d', ...p.relationship.map((r) => r.toLowerCase())],
        });
      }
      // Map relationship text to our enum
      const primary = (p.relationship[0] || '').toLowerCase();
      const relation: FilingRelation =
        primary.includes('promoter') ? 'promoter'
        : primary.includes('director') ? 'director'
        : primary.includes('officer')  ? 'officer'
        : 'other';
      await linkContactFiling(c.id, accession, cik, relation);
      // Only firms are likely to own properties; skip portfolio match for individuals to cut calls.
      const portfolioMatches = c.kind === 'firm' ? await autoLinkPortfolio(c.id, c.name) : 0;
      created.push({ contactId: c.id, name: c.name, relation, portfolioMatches });
    }

    res.status(201).json({ created });
  } catch (err) {
    res.status(500).json({ error: 'from_form_d_failed', message: (err as Error).message });
  }
});

// Retroactively match a single contact to Denver portfolio owners.
crmRouter.post('/contacts/:id/match-portfolio', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contact = await getContact(id);
    if (!contact) { res.status(404).json({ error: 'not_found' }); return; }
    const matches = await matchContactToPortfolio(contact.name);
    for (const m of matches) {
      await linkContactProperty(id, m.propertyRef, 'owner',
        `Matched from Denver portfolio (score ${m.score}). ${m.units} units at ${m.address}.`);
    }
    res.json({ contactId: id, matches: matches.length, details: matches });
  } catch (err) {
    res.status(500).json({ error: 'match_portfolio_failed', message: (err as Error).message });
  }
});

// Batch re-match all firm contacts (not just Form-D-sourced). Idempotent.
crmRouter.post('/match-portfolio-all', async (_req, res) => {
  try {
    const firms = await listContacts({ status: 'active', limit: 2000 });
    const onlyFirms = firms.filter((c) => c.kind === 'firm');
    let totalLinks = 0;
    const perContact: Array<{ id: number; name: string; matches: number }> = [];
    for (const c of onlyFirms) {
      const matches = await matchContactToPortfolio(c.name);
      for (const m of matches) {
        await linkContactProperty(c.id, m.propertyRef, 'owner',
          `Matched from Denver portfolio (score ${m.score}). ${m.units} units at ${m.address}.`);
      }
      totalLinks += matches.length;
      if (matches.length > 0) perContact.push({ id: c.id, name: c.name, matches: matches.length });
    }
    res.json({ firmsScanned: onlyFirms.length, totalLinks, perContact });
  } catch (err) {
    res.status(500).json({ error: 'batch_match_failed', message: (err as Error).message });
  }
});
