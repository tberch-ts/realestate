import { Router } from 'express';
import { getSetting, setSetting } from '../db/appSettingsRepo.js';
import {
  createLetter, createLetterFromPdfBuffer,
  getLetter, isConfigured, liveConfigured, testConfigured, currentMode,
  type PostGridAddress,
} from '../providers/postgridClient.js';
import type { DealInput, LoiInput } from '@mfa/shared';
import { renderLoiPdf } from '../loi.js';
import { createLetterRecord, listLettersForContact, updateLetterStatus } from '../db/lettersRepo.js';
import { getContact } from '../db/contactsRepo.js';
import { createInteraction } from '../db/interactionsRepo.js';

export const postgridRouter = Router();

// ---- Config status ----
postgridRouter.get('/status', async (_req, res) => {
  const sender = await getSetting<PostGridAddress>('postgrid_from');
  res.json({
    apiKey: isConfigured(),
    liveConfigured: liveConfigured(),
    testConfigured: testConfigured(),
    mode: currentMode(),
    senderConfigured: !!sender,
    sender,
  });
});

// ---- Sender address settings ----
postgridRouter.get('/sender', async (_req, res) => {
  const sender = await getSetting<PostGridAddress>('postgrid_from');
  res.json({ data: sender });
});

postgridRouter.put('/sender', async (req, res) => {
  try {
    const body = req.body as PostGridAddress;
    // Basic validation
    if (!body?.addressLine1 || !body?.city || !body?.provinceOrState || !body?.postalOrZip) {
      res.status(400).json({ error: 'addressLine1, city, provinceOrState, postalOrZip required' });
      return;
    }
    await setSetting<PostGridAddress>('postgrid_from', { ...body, countryCode: body.countryCode ?? 'US' });
    res.json({ ok: true, data: body });
  } catch (err) {
    res.status(500).json({ error: 'save_sender_failed', message: (err as Error).message });
  }
});

// ---- Send a letter to a contact ----
postgridRouter.post('/letters/from-contact', async (req, res) => {
  try {
    if (!isConfigured()) {
      res.status(400).json({ error: 'postgrid_not_configured', message: 'POSTGRID_API_KEY env var is not set' });
      return;
    }
    const { contactId, html, subject, color, doubleSided, description } = (req.body ?? {}) as {
      contactId?: number;
      html?: string;
      subject?: string;
      color?: boolean;
      doubleSided?: boolean;
      description?: string;
    };
    if (!contactId || !html) {
      res.status(400).json({ error: 'contactId and html required' });
      return;
    }

    const contact = await getContact(Number(contactId));
    if (!contact) { res.status(404).json({ error: 'contact_not_found' }); return; }

    if (!contact.addressLine1 || !contact.city || !contact.stateCode || !contact.zip) {
      res.status(400).json({
        error: 'contact_address_incomplete',
        message: 'Contact must have addressLine1, city, stateCode, and zip before mailing.',
      });
      return;
    }

    const sender = await getSetting<PostGridAddress>('postgrid_from');
    if (!sender) {
      res.status(400).json({
        error: 'sender_not_configured',
        message: 'Configure POST sender address via PUT /api/postgrid/sender first.',
      });
      return;
    }

    // Derive PostGrid recipient from contact
    const parts = contact.name.trim().split(/\s+/);
    const isFirm = contact.kind === 'firm';
    const recipient: PostGridAddress = {
      firstName: isFirm ? undefined : parts[0],
      lastName:  isFirm ? undefined : parts.slice(1).join(' ') || undefined,
      companyName: isFirm ? contact.name : contact.firmName,
      addressLine1: contact.addressLine1,
      addressLine2: contact.addressLine2,
      city: contact.city,
      provinceOrState: contact.stateCode,
      postalOrZip: contact.zip,
      countryCode: 'US',
    };

    const letter = await createLetter({
      to: recipient,
      from: sender,
      html,
      color: color ?? false,
      doubleSided: doubleSided ?? false,
      description: description ?? subject ?? `To ${contact.name}`,
      metadata: { contactId: String(contact.id), kind: 'outreach' },
    });

    // Log an interaction so it shows up on the contact's timeline
    const interaction = await createInteraction({
      contactId: contact.id,
      kind: 'outreach_sent',
      subject: subject ?? 'Postal letter',
      body: `Sent via PostGrid.\nLetter ID: ${letter.id}\nMode: ${letter.live ? 'LIVE' : 'TEST'}\nStatus: ${letter.status}\n\n--- content ---\n${html.slice(0, 2000)}`,
    });

    // Store letter record
    const rec = await createLetterRecord({
      contactId: contact.id,
      interactionId: interaction.id,
      provider: 'postgrid',
      providerId: letter.id,
      live: letter.live,
      subject,
      html,
      status: letter.status,
      carrierTracking: letter.carrierTracking ?? undefined,
      sendDate: letter.sendDate ?? undefined,
      expectedDelivery: letter.expectedDeliveryDate ?? undefined,
      senderSnapshot: sender,
      recipientSnapshot: recipient,
    });

    res.status(201).json({
      letter: rec,
      postgrid: { id: letter.id, status: letter.status, live: letter.live },
      mode: currentMode(),
    });
  } catch (err) {
    res.status(500).json({ error: 'send_letter_failed', message: (err as Error).message });
  }
});

// ---- List letters for a contact ----
postgridRouter.get('/letters', async (req, res) => {
  try {
    const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
    if (!contactId) { res.status(400).json({ error: 'contactId required' }); return; }
    const rows = await listLettersForContact(contactId);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'list_letters_failed', message: (err as Error).message });
  }
});

// ---- Mail an LOI directly via PostGrid ----
// Renders the LOI PDF using the same pipeline as /api/loi, then mails it via
// PostGrid (multipart upload). If contactId is provided we link the letter and
// log an interaction; otherwise the letter is sent without a CRM link.
postgridRouter.post('/letters/loi', async (req, res) => {
  try {
    if (!isConfigured()) {
      res.status(400).json({ error: 'postgrid_not_configured' });
      return;
    }
    const { deal, loi, contactId, draftId, recipient } = (req.body ?? {}) as {
      deal?: DealInput;
      loi?: LoiInput;
      contactId?: number;
      draftId?: number;
      // Recipient may come from the LOI form's seller fields directly, OR be derived
      // from contactId if a contact already has the address on file.
      recipient?: PostGridAddress;
    };
    if (!deal || !loi) { res.status(400).json({ error: 'deal and loi required' }); return; }

    // Resolve recipient
    let to: PostGridAddress | null = recipient ?? null;
    let resolvedContact: Awaited<ReturnType<typeof getContact>> | null = null;
    if (!to && contactId) {
      resolvedContact = await getContact(contactId);
      if (!resolvedContact?.addressLine1 || !resolvedContact?.city || !resolvedContact?.stateCode || !resolvedContact?.zip) {
        res.status(400).json({ error: 'contact_address_incomplete' });
        return;
      }
      const isFirm = resolvedContact.kind === 'firm';
      const parts = resolvedContact.name.trim().split(/\s+/);
      to = {
        firstName: isFirm ? undefined : parts[0],
        lastName:  isFirm ? undefined : parts.slice(1).join(' ') || undefined,
        companyName: isFirm ? resolvedContact.name : resolvedContact.firmName,
        addressLine1: resolvedContact.addressLine1,
        addressLine2: resolvedContact.addressLine2,
        city: resolvedContact.city,
        provinceOrState: resolvedContact.stateCode,
        postalOrZip: resolvedContact.zip,
        countryCode: 'US',
      };
    }
    if (!to) {
      res.status(400).json({ error: 'recipient_required',
        message: 'Provide either contactId (with full address) or an explicit recipient object.' });
      return;
    }

    const sender = await getSetting<PostGridAddress>('postgrid_from');
    if (!sender) { res.status(400).json({ error: 'sender_not_configured' }); return; }

    // Render the LOI PDF with the same generator the download button uses.
    const pdf = await renderLoiPdf(deal, loi);

    const letter = await createLetterFromPdfBuffer({
      to,
      from: sender,
      pdf,
      pdfFilename: `LOI-${deal.address.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.pdf`,
      description: `LOI for ${deal.address}`,
      metadata: {
        kind: 'loi',
        ...(contactId ? { contactId: String(contactId) } : {}),
        ...(draftId ? { draftId: String(draftId) } : {}),
      },
    });

    // CRM linkage (optional — only if we have a contact)
    let interactionId: number | undefined;
    if (resolvedContact) {
      const interaction = await createInteraction({
        contactId: resolvedContact.id,
        kind: 'outreach_sent',
        subject: `LOI mailed for ${deal.address}`,
        body: `Sent via PostGrid (${letter.live ? 'LIVE' : 'TEST'}).\nLetter ID: ${letter.id}\nStatus: ${letter.status}\n\nLOI for: ${deal.address}\nPurchase price: $${(deal.underwriting?.purchasePrice ?? 0).toLocaleString()}`,
      });
      interactionId = interaction.id;
    }

    const rec = await createLetterRecord({
      contactId: resolvedContact?.id,
      interactionId,
      draftId,
      provider: 'postgrid',
      providerId: letter.id,
      live: letter.live,
      subject: `LOI for ${deal.address}`,
      status: letter.status,
      carrierTracking: letter.carrierTracking ?? undefined,
      sendDate: letter.sendDate ?? undefined,
      expectedDelivery: letter.expectedDeliveryDate ?? undefined,
      senderSnapshot: sender,
      recipientSnapshot: to,
    });

    res.status(201).json({
      letter: rec,
      postgrid: { id: letter.id, status: letter.status, live: letter.live },
      mode: currentMode(),
    });
  } catch (err) {
    res.status(500).json({ error: 'mail_loi_failed', message: (err as Error).message });
  }
});

// ---- Inline send — no Postgres side effects ----
// For multi-tenant callers (apps/crm) whose contacts/deals/LOIs live in
// Firestore, not this API's Postgres tables. Sender and recipient are always
// passed explicitly in the body (no app_settings lookup, no contactId FK
// lookup), and nothing is written to contacts/interactions/letters here —
// the caller is responsible for recording the result (letter id/status) in
// its own data store after a successful response.
postgridRouter.post('/letters/inline', async (req, res) => {
  try {
    if (!isConfigured()) {
      res.status(400).json({ error: 'postgrid_not_configured', message: 'POSTGRID_API_KEY env var is not set' });
      return;
    }
    const { to, from, deal, loi, html, subject, color, doubleSided } = (req.body ?? {}) as {
      to?: PostGridAddress;
      from?: PostGridAddress;
      deal?: DealInput;
      loi?: LoiInput;
      html?: string;
      subject?: string;
      color?: boolean;
      doubleSided?: boolean;
    };
    if (!to?.addressLine1 || !to?.city || !to?.provinceOrState || !to?.postalOrZip) {
      res.status(400).json({ error: 'to_address_incomplete', message: 'to.addressLine1, city, provinceOrState, postalOrZip required' });
      return;
    }
    if (!from?.addressLine1 || !from?.city || !from?.provinceOrState || !from?.postalOrZip) {
      res.status(400).json({ error: 'from_address_incomplete', message: 'from.addressLine1, city, provinceOrState, postalOrZip required' });
      return;
    }
    if (!deal && !loi && !html) {
      res.status(400).json({ error: 'content_required', message: 'Provide either {deal, loi} to render an LOI PDF, or html for a plain letter.' });
      return;
    }

    const letter = deal && loi
      ? await createLetterFromPdfBuffer({
          to,
          from,
          pdf: await renderLoiPdf(deal, loi),
          pdfFilename: `LOI-${deal.address.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.pdf`,
          description: subject ?? `LOI for ${deal.address}`,
          color, doubleSided,
        })
      : await createLetter({
          to,
          from,
          html: html!,
          description: subject,
          color, doubleSided,
        });

    res.status(201).json({ id: letter.id, status: letter.status, live: letter.live });
  } catch (err) {
    res.status(500).json({ error: 'send_letter_failed', message: (err as Error).message });
  }
});

// ---- Refresh letter status from PostGrid ----
postgridRouter.post('/letters/:id/refresh', async (req, res) => {
  try {
    const providerId = req.params.id;
    const letter = await getLetter(providerId);
    await updateLetterStatus(letter.id, letter.status, letter.carrierTracking ?? undefined);
    res.json({ ok: true, status: letter.status, carrierTracking: letter.carrierTracking });
  } catch (err) {
    res.status(500).json({ error: 'refresh_letter_failed', message: (err as Error).message });
  }
});
