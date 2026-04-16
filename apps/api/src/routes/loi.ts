import { Router } from 'express';
import type { DealInput, LoiInput } from '@mfa/shared';
import { renderLoiPdf } from '../loi.js';

export const loiRouter = Router();

loiRouter.post('/', async (req, res) => {
  try {
    const body = req.body as { deal?: DealInput; loi?: LoiInput };
    if (!body?.deal || !body?.loi) {
      return res.status(400).json({ error: 'deal and loi required' });
    }
    const pdf = await renderLoiPdf(body.deal, body.loi);
    const filename = `LOI-${sanitize(body.deal.address)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: 'loi_render_failed', message: (err as Error).message });
  }
});

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
}
