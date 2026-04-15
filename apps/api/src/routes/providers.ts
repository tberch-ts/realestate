import { Router } from 'express';

export const providersRouter = Router();

// Lightweight status endpoint so the UI can show which providers are wired up
// and which are gated on credentials/credits, without making actual data calls.
providersRouter.get('/status', (_req, res) => {
  res.json({
    google_geocoding: {
      status: process.env.GOOGLE_MAPS_API_KEY ? 'ok' : 'needs_credentials',
      cost: 'free tier',
      required: true,
    },
    denver_assessor: { status: 'ok', cost: 'free' },
    census_acs: { status: 'ok', cost: 'free' },
    hud_fmr: {
      status: process.env.HUD_API_TOKEN ? 'ok' : 'needs_credentials',
      cost: 'free (token required)',
    },
    bls_ces: {
      status: 'ok',
      cost: process.env.BLS_API_KEY ? 'free (registered, 500/day)' : 'free (anonymous, 25/day)',
    },
    fbi_ucr: {
      status: process.env.FBI_API_KEY ? 'needs_credits' : 'needs_credentials',
      cost: 'free (api.data.gov key)',
    },
    landlord_friendliness: { status: 'ok', cost: 'free (static table)' },
    attom: {
      status: process.env.ATTOM_API_KEY ? 'ok' : 'needs_credentials',
      cost: 'paid',
    },
    rentcast: {
      status: process.env.RENTCAST_API_KEY ? 'ok' : 'needs_credentials',
      cost: 'paid',
    },
  });
});
