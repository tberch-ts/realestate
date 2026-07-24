// One-off CLI to bootstrap the first admin user. /api/admin/* (and the
// Admin panel's own Users tab, which calls it) requires an existing admin
// to grant the claim to anyone else — so the very first grant has to happen
// out-of-band, directly against Firebase Auth.
//
// Usage (run from apps/api, with the same FIREBASE_SERVICE_ACCOUNT_JSON the
// API itself uses — raw JSON or base64, see src/middleware/firebaseAuth.ts):
//
//   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
//     npm run grant-admin -- someone@example.com
//
// After the first admin exists, use the Admin panel's Users tab
// (grant/revoke) for everyone else instead of this script.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run grant-admin -- <email> [--revoke]');
    process.exit(1);
  }
  const revoke = process.argv.includes('--revoke');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
    process.exit(1);
  }
  let jsonStr = raw.trim();
  if (!jsonStr.startsWith('{')) {
    jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
  }
  const serviceAccount = JSON.parse(jsonStr);

  const app = initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);

  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: !revoke });
  // Forces any ID token they're currently holding to fail verification on
  // its next use (see firebaseAuth.ts's checkRevoked) instead of staying
  // valid with the OLD claim for up to ~1hr — same mechanism routes/admin.ts
  // uses for grant/revoke via the Admin panel.
  await auth.revokeRefreshTokens(user.uid);
  console.log(`${revoke ? 'Revoked' : 'Granted'} admin ${revoke ? 'from' : 'to'} ${email} (${user.uid}).`);
  console.log('They must sign in again for the change to take effect (their current session was just invalidated).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
