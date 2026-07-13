import { Router, type Request, type Response, type NextFunction } from 'express';
import { stripe } from '../stripe/client.js';

// In-person card payments for SmartInvestorCRM's own billing (e.g. taking a
// card at a sales event or office for onboarding fees). This is the ONE
// approved place in the whole integration where payment_method_types is set
// explicitly — Terminal requires ['card_present'], everywhere else it must
// be omitted so Stripe's dynamic payment methods can do their thing.

export const terminalRouter = Router();

function requireFirebaseUser(req: Request, res: Response, next: NextFunction): void {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Terminal endpoints require a Firebase Bearer token.' });
    return;
  }
  next();
}

terminalRouter.use(requireFirebaseUser);

// The Terminal SDK (JS/mobile) calls this to authenticate a physical or
// simulated reader. One connection token per reader session.
terminalRouter.post('/connection-token', async (_req, res, next) => {
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (err) {
    next(err);
  }
});

terminalRouter.get('/locations', async (_req, res, next) => {
  try {
    const locations = await stripe.terminal.locations.list({ limit: 20 });
    res.json({ data: locations.data });
  } catch (err) {
    next(err);
  }
});

// Creates the PaymentIntent the reader will collect payment against. The
// client (Terminal SDK) then calls collectPaymentMethod + processPayment
// with this PaymentIntent's client_secret against the physical/simulated
// reader.
terminalRouter.post('/payment-intents', async (req, res, next) => {
  try {
    const { amountCents, currency, description } = req.body as {
      amountCents?: number;
      currency?: string;
      description?: string;
    };
    if (!amountCents || amountCents <= 0) {
      res.status(400).json({ error: 'a positive amountCents is required' });
      return;
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountCents),
      currency: currency ?? 'usd',
      description,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
    });

    res.status(201).json({ id: intent.id, clientSecret: intent.client_secret });
  } catch (err) {
    next(err);
  }
});
