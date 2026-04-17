import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// Skip auth for health checks (DO App Platform polls this internally) and for the
// unauthed local dev case where no creds are configured.
const UNAUTHED_PATHS = new Set(['/health']);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  if (UNAUTHED_PATHS.has(req.path)) return next();

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;
  if (!expectedUser || !expectedPass) {
    // Local dev convenience: no creds configured → no enforcement.
    return next();
  }

  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="mfa"').status(401).end();
    return;
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) {
    res.set('WWW-Authenticate', 'Basic realm="mfa"').status(401).end();
    return;
  }
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);

  if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPass)) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="mfa"').status(401).end();
}
