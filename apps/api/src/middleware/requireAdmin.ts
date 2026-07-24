// Gates admin-only routes (routes/admin.ts) behind the `admin` Firebase
// custom claim — the same claim key firestore.rules' isAdmin() checks
// (request.auth.token.admin), so a user granted admin access here can also
// pass the market_signals write rule directly from the client SDK.
//
// Mount after the global auth gate in index.ts (firebaseAuth / basicAuth /
// the AUTH_MODE=both branch) so req.firebaseUser is already populated.
// Under basic-auth mode req.firebaseUser is never set, so this always
// 403s — the admin panel requires a real Firebase identity.
import type { Request, Response, NextFunction } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.firebaseUser?.admin !== true) {
    res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    return;
  }
  next();
}
