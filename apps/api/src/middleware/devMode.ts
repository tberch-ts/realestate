import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

// Per-request dev-mode flag, set from the x-mfa-dev-mode header the client sends
// on every API call. When true, providers like PostGrid use their test credentials.
//
// This is request-scoped (not process-scoped) so a single deployed server handles
// both live and test traffic concurrently — the live re.talkstud.io site can have
// a user flipped into dev mode for a single tab without affecting other users.

interface DevModeCtx { devMode: boolean; }

const store = new AsyncLocalStorage<DevModeCtx>();

export function devModeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('x-mfa-dev-mode');
  const devMode = header === 'true' || header === '1';
  store.run({ devMode }, () => next());
}

// Query dev mode from anywhere downstream of the middleware.
export function isDevMode(): boolean {
  return store.getStore()?.devMode ?? false;
}
