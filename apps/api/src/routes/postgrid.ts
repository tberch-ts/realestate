import { Router } from 'express';
import { getSetting, setSetting } from '../db/appSettingsRepo.js';
import {
  createLetter, getLetter, isConfigured, liveConfigured, testConfigured, currentMode,
  type PostGridAddress,
} from '../providers/postgridClient.js';
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
