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

// Import-from-filing: given a Form D accession, auto-create contacts for each related person
// plus the issuer, link them to the filing. Idempotent via (source, source_ref).
crmRouter.post('/contacts/from-form-d', async (req, res) => {
  try {
    const { accession, cik } = req.body ?? {};
    if (!accession || !cik) { res.status(400).json({ error: 'accession and cik required' }); return; }
    const detail = await getFormDDetail(accession, cik);
    if (!detail) { res.status(404).json({ error: 'filing not found' }); return; }

    const created: { contactId: number; name: string; relation: FilingRelation }[] = [];

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
      created.push({ contactId: issuer.id, name: issuer.name, relation: 'issuer' });
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
      created.push({ contactId: c.id, name: c.name, relation });
    }

    res.status(201).json({ created });
  } catch (err) {
    res.status(500).json({ error: 'from_form_d_failed', message: (err as Error).message });
  }
});
