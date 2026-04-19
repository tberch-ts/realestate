// Firebase Auth middleware — verifies a Firebase ID token from the
// `Authorization: Bearer <token>` header and attaches the decoded user to
// req.firebaseUser.
//
// Set up by Phase 1 of the TalkStudio convergence. Replaces the legacy
// basic-auth gate with the same Firebase Auth that powers talkstud.io,
// so the analyzer doesn't ask for a separate password.
//
// Auth model:
//   - Frontend obtains an ID token via firebase/auth (Google sign-in)
//   - Sends `Authorization: Bearer <id-token>` on every /api/* request
//   - Backend verifies via firebase-admin
//   - Optional: enforce isAdmin / specific tier via DECODE_ONLY=false
//
// Required env (provided via DigitalOcean App Platform secrets):
//   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON, base64- or
//                                    raw-encoded. Get from Firebase Console
//                                    → Project Settings → Service accounts
//                                    → Generate new private key.
//
// Optional env:
//   FIREBASE_AUTH_BYPASS=true      — for local dev without a service account
//                                    key. Treats every request as anon.
//   FIREBASE_ADMINS_ONLY=true      — restrict access to users where
//                                    isAdmin custom claim is true. Default
//                                    is "any signed-in Firebase user".
//
// /health stays unauthed for DO probes.

import type { Request, Response, NextFunction } from 'express';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

const UNAUTHED_PATHS = new Set(['/health']);

// Module-level singletons.
let adminApp: App | null = null;
let initError: Error | null = null;

function loadServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  // Accept either raw JSON or base64-encoded JSON. The latter is friendlier
  // when pasting into DO App Platform secret fields (no newline issues).
  let jsonStr = raw.trim();
  if (!jsonStr.startsWith('{')) {
    try {
      jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON looks neither like JSON nor base64');
    }
  }
  return JSON.parse(jsonStr);
}

function getAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (initError) return null;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }
  try {
    const sa = loadServiceAccount();
    if (!sa) {
      // No service account configured — middleware will run in bypass mode if
      // explicitly allowed, otherwise everything 503s.
      return null;
    }
    adminApp = initializeApp({
      credential: cert(sa as any),
    });
    console.log('[firebase-auth] admin SDK initialized');
    return adminApp;
  } catch (e) {
    initError = e as Error;
    console.error('[firebase-auth] init failed:', initError.message);
    return null;
  }
}

// Augment Express Request type so route handlers can read req.firebaseUser.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      firebaseUser?: DecodedIdToken;
    }
  }
}

export async function firebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (UNAUTHED_PATHS.has(req.path)) return next();

  // Local dev / kill-switch: opt-in bypass.
  if (process.env.FIREBASE_AUTH_BYPASS === 'true') return next();

  const app = getAdminApp();
  if (!app) {
    // Return 401 (auth required) rather than 503 (server unavailable).
    // DO App Platform treats persistent 503s as "upstream unhealthy" and
    // replaces the body with their generic HTML error page, hiding our
    // actual JSON message. 401 is semantically correct anyway: from the
    // client's perspective, auth is mandatory and unavailable to them.
    res
      .status(401)
      .set('x-mfa-auth', 'firebase-not-configured')
      .json({
        error: 'unauthorized',
        message:
          'Firebase Admin SDK not configured on the API. Set FIREBASE_SERVICE_ACCOUNT_JSON env or use basic-auth (AUTH_MODE=both keeps both paths live).',
      });
    return;
  }

  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing Bearer token' });
    return;
  }
  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'unauthorized', message: 'Empty Bearer token' });
    return;
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);

    // Optional admin-only gate. By default any signed-in Firebase user is
    // admitted (the frontend handles tier-based feature gating). Flip
    // FIREBASE_ADMINS_ONLY=true to restrict the whole API to admins.
    if (process.env.FIREBASE_ADMINS_ONLY === 'true' && decoded.isAdmin !== true) {
      res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
      return;
    }

    req.firebaseUser = decoded;
    return next();
  } catch (e) {
    const msg = (e as Error).message || 'token verification failed';
    res.status(401).json({ error: 'unauthorized', message: msg });
    return;
  }
}
