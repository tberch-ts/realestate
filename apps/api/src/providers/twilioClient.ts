// Minimal Twilio Programmable Messaging wrapper — plain fetch, no SDK,
// mirroring postgridClient.ts's approach.
//
// Env:
//   TWILIO_ACCOUNT_SID              — ACxxxx (or test credentials ACxxxx)
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER              — E.164 sending number, OR
//   TWILIO_MESSAGING_SERVICE_SID    — MGxxxx (preferred: create a Messaging
//                                     Service with Advanced Opt-Out enabled
//                                     so STOP/HELP/UNSTOP are handled by
//                                     Twilio before our webhook ever sees
//                                     them)
//
// Compliance posture (deliberate): the API exposes single-recipient sends
// only — no bulk endpoint. Cold SMS to skip-traced owners is TCPA-sensitive;
// one-to-one, self-identified messages with honored opt-outs are the only
// mode this tool supports. See the Land Playbook step 3 guidance.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SmsSendResult } from '@mfa/shared';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

function creds(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, token };
}

export function twilioConfigured(): boolean {
  return !!creds() && !!(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID);
}

export async function sendSms(input: { to: string; body: string }): Promise<SmsSendResult> {
  const c = creds();
  if (!c) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');

  const params = new URLSearchParams({ To: input.to, Body: input.body });
  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (messagingService) params.set('MessagingServiceSid', messagingService);
  else if (from) params.set('From', from);
  else throw new Error('Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');

  const res = await fetch(`${TWILIO_API}/Accounts/${encodeURIComponent(c.sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const body = (await res.json()) as {
    sid?: string;
    status?: string;
    to?: string;
    from?: string;
    message?: string;
    code?: number;
  };
  if (!res.ok) {
    throw new Error(body.message ? `Twilio ${body.code ?? res.status}: ${body.message}` : `Twilio HTTP ${res.status}`);
  }
  return {
    sid: body.sid ?? '',
    status: body.status ?? 'queued',
    to: body.to ?? input.to,
    from: body.from ?? messagingService ?? from ?? '',
  };
}

// Validates X-Twilio-Signature on inbound webhooks: HMAC-SHA1 over the full
// request URL + each POST param appended as key+value in sorted-key order,
// base64-encoded, compared timing-safe. https://www.twilio.com/docs/usage/security
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined
): boolean {
  const c = creds();
  if (!c || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  const expected = createHmac('sha1', c.token).update(Buffer.from(data, 'utf8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
