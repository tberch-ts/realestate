/**
 * Firebase Functions v1 — serves the Express API.
 *
 * Gen 1 is used deliberately: Firebase Hosting has an internal trust
 * relationship with Gen 1 functions that bypasses Cloud Run IAM
 * (no allUsers invoker binding required, works under org policies that
 * block public Cloud Run access).
 *
 * Build first:   bash scripts/build-functions.sh
 * Then deploy:   firebase deploy --only functions,hosting
 */
const functions = require('firebase-functions/v1');

// Lazy-load so cold-start stays fast
let _app;
function getApp() {
  if (!_app) {
    process.env.NODE_ENV = 'production';
    const mod = require('./api-bundle.cjs');
    _app = mod.app;
  }
  return _app;
}

exports.api = functions
  .region('us-central1')
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onRequest((req, res) => getApp()(req, res));
