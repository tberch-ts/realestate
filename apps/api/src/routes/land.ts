import { Router } from 'express';
import type { AssignmentContractInput, LandContractInput, LandLeadFilters, MarketKey } from '@mfa/shared';
import { fetchLandLeads } from '../providers/landDispatcher.js';
import { fetchLandSaturation } from '../providers/landSaturation.js';
import { renderAssignmentContractPdf, renderLandContractPdf } from '../landContract.js';

export const landRouter = Router();

// POST /api/land/contract — 1-page vacant-land Purchase & Sale Agreement
// PDF ("Buyer and/or assigns"). Mounted before the :market GETs so the
// literal path wins. Template only — the PDF itself carries the
// attorney-review disclaimer.
landRouter.post('/contract', async (req, res, next) => {
  try {
    const input = req.body as LandContractInput;
    if (!input?.sellerNames || !input?.buyerName || !input?.purchasePrice) {
      return res.status(400).json({ error: 'sellerNames, buyerName, and purchasePrice are required' });
    }
    const pdf = await renderLandContractPdf({
      ...input,
      feasibilityDays: input.feasibilityDays ?? 30,
      earnestMoney: input.earnestMoney ?? 0,
      effectiveDate: input.effectiveDate || new Date().toISOString().slice(0, 10),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="land-purchase-agreement.pdf"');
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// POST /api/land/contract/assignment — the buyer-side contract: assigns
// the P&S agreement to the builder for the assignment fee, paid through
// the closing agent (title company) at closing.
landRouter.post('/contract/assignment', async (req, res, next) => {
  try {
    const input = req.body as AssignmentContractInput;
    if (
      !input?.assignorName || !input?.assigneeName || !input?.sellerNames ||
      input?.originalPrice == null || input?.assignmentFee == null || !input?.closingAgentName
    ) {
      return res.status(400).json({
        error: 'assignorName, assigneeName, sellerNames, originalPrice, assignmentFee, and closingAgentName are required',
      });
    }
    const pdf = await renderAssignmentContractPdf({
      ...input,
      effectiveDate: input.effectiveDate || new Date().toISOString().slice(0, 10),
      originalAgreementDate: input.originalAgreementDate || new Date().toISOString().slice(0, 10),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="assignment-of-contract.pdf"');
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// GET /api/land/:market/leads — vacant-lot owner leads with ReplySmart-style
// filters. Server applies the strategy's key default: minYearsHeld = 10
// (exclude recent purchasers) — see landCommon.ts LAND_FILTER_DEFAULTS.
landRouter.get('/:market/leads', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const q = req.query;

    const filters: LandLeadFilters = {
      zips: strList(q.zips),
      city: strOrUndef(q.city),
      minAcres: numOrUndef(q.minAcres),
      maxAcres: numOrUndef(q.maxAcres),
      minYearsHeld: numOrUndef(q.minYearsHeld),
      includeUnknownSaleDate: boolOrUndef(q.includeUnknownSaleDate),
      outOfStateOwner: boolOrUndef(q.outOfState),
      outOfCountyOwner: boolOrUndef(q.outOfCounty),
      landUseIn: strList(q.landUse),
      landUseNotIn: strList(q.excludeLandUse),
      limit: numOrUndef(q.limit),
    };

    const result = await fetchLandLeads(market, filters);
    if (result.status !== 'ok' || !result.data) {
      return res.status(result.status === 'not_available' ? 200 : 502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/land/:market/saturation — builder-activity choropleth
// (GeoJSON FeatureCollection, same envelope as /api/hotspots/:market).
landRouter.get('/:market/saturation', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const result = await fetchLandSaturation(market);
    if (result.status !== 'ok' || !result.data) {
      return res.status(result.status === 'not_available' ? 200 : 502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

function strOrUndef(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

function strList(v: unknown): string[] | undefined {
  const s = strOrUndef(v);
  if (!s) return undefined;
  const items = s.split(',').map((x) => x.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function numOrUndef(v: unknown): number | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function boolOrUndef(v: unknown): boolean | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  return v === '1' || v.toLowerCase() === 'true';
}
