import { Router, urlencoded } from 'express';
import type { SmsSendInput } from '@mfa/shared';
import { sendSms, twilioConfigured, validateTwilioSignature } from '../providers/twilioClient.js';
import { getAdminApp } from '../middleware/firebaseAuth.js';

// ---------- Outbound (behind the auth gate) ----------
//
// ONE recipient per call, by design — this is a personal outreach tool,
// not a bulk blaster. Cold SMS is TCPA-sensitive: single-lead sends with
// self-identification and honored opt-outs (use a Twilio Messaging
// Service with Advanced Opt-Out) are the only supported mode.
export const smsRouter = Router();

const E164 = /^\+[1-9]\d{6,14}$/;

smsRouter.post('/send', async (req, res, next) => {
  try {
    if (!twilioConfigured()) {
      return res.status(503).json({
        provider: 'twilio',
        status: 'needs_credentials',
        message:
          'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID).',
      });
    }

    const input = req.body as SmsSendInput;
    const to = String(input?.to ?? '').trim();
    const body = String(input?.body ?? '').trim();
    if (!E164.test(to)) {
      return res.status(400).json({ error: 'invalid_to', message: '`to` must be E.164, e.g. +19195551234' });
    }
    if (!body || body.length > 1600) {
      return res.status(400).json({ error: 'invalid_body', message: '`body` required, max 1600 chars' });
    }

    const result = await sendSms({ to, body });
    res.json({ provider: 'twilio', status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// ---------- Inbound webhook (mounted BEFORE the auth gate) ----------
//
// Twilio POSTs form-encoded params for every inbound message on the
// number/Messaging Service. Signature-validated against PUBLIC_API_URL +
// the mount path; on a valid reply we find the CRM contact by phone and
// write a `reply_received` interaction via firebase-admin (bypasses
// Firestore rules — same trust level as the API's other admin usage).
export const smsInboundRouter = Router();

smsInboundRouter.post('/inbound', urlencoded({ extended: false }), async (req, res) => {
  const publicBase = (process.env.PUBLIC_API_URL ?? 'https://mfa-api.fly.dev').replace(/\/$/, '');
  const url = `${publicBase}/api/sms/inbound`;
  const params = req.body as Record<string, string>;
  const signature = req.header('x-twilio-signature');

  if (!validateTwilioSignature(url, params, signature)) {
    return res.status(403).send('invalid signature');
  }

  const from = params.From ?? '';
  const text = params.Body ?? '';

  // Best-effort CRM logging; the webhook always 200s so Twilio doesn't
  // retry-storm us over a Firestore hiccup.
  try {
    const app = getAdminApp();
    if (app && from) {
      // Lazily loaded: firebase-admin/firestore pulls in the optional
      // @google-cloud/firestore package. Importing it at module load would
      // crash the entire API on boot if that optional dep is ever missing
      // from the install (see infra/Dockerfile.api.prod). Only the inbound
      // webhook needs it, so load it here and let a missing module degrade
      // this one handler instead of taking down the server.
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore(app);
      const snap = await db.collection('contacts').where('phone', '==', from).get();
      const now = new Date();
      await Promise.all(
        snap.docs.map((doc) =>
          doc.ref.collection('interactions').add({
            ownerId: doc.get('ownerId'),
            kind: 'reply_received',
            subject: 'SMS reply',
            body: text,
            occurredAt: now,
            createdAt: now,
          })
        )
      );
      if (snap.empty) console.log(`[sms:inbound] no contact matches ${from}`);
    }
  } catch (e) {
    console.error('[sms:inbound] failed to log reply:', (e as Error).message);
  }

  res.type('text/xml').send('<Response/>');
});
