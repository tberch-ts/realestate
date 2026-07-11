# Firebase Auth deploy — realestate API

Replaces basic-auth with Firebase ID token verification so the integrated
TalkStudio frontend (talkstud.io/analyze) can hit this API using the same
Google sign-in users authenticate with there.

## What changed

- New: `apps/api/src/middleware/firebaseAuth.ts` — verifies `Authorization: Bearer <id-token>` via `firebase-admin`.
- New dep: `firebase-admin` in `apps/api/package.json`.
- Modified: `apps/api/src/index.ts` — CORS allowlist (talkstud.io + re.talkstud.io + localhost), `AUTH_MODE` switch.

## Auth modes

Set `AUTH_MODE` env var on the api service:

| `AUTH_MODE`        | Behavior                                                              |
|--------------------|-----------------------------------------------------------------------|
| `firebase`         | Bearer-only. Reject every request without a valid Firebase ID token.  |
| `basic`            | Legacy basic-auth only (existing behavior pre-this-change).           |
| `both` *(default)* | Use Firebase if a Bearer token is present, else fall through to basic.|

**Recommended:** ship as `both` first (zero risk to existing re.talkstud.io users), verify talkstud.io flows work, then flip to `firebase` to drop basic-auth entirely.

## Required env on DO App Platform

### `api` service

Add **one new SECRET**:

```
FIREBASE_SERVICE_ACCOUNT_JSON  =  <see "Service account key" below>
```

Optional:

```
AUTH_MODE                    = both       # default; switch to 'firebase' once verified
CORS_ALLOWED_ORIGINS         = (omit — defaults already cover talkstud.io)
FIREBASE_ADMINS_ONLY         = false      # set 'true' to require isAdmin custom claim
```

### Service account key

1. Open https://console.firebase.google.com/project/talkstudio-fb/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"** → confirm. A JSON file downloads.
3. The full JSON looks like:
   ```json
   {
     "type": "service_account",
     "project_id": "talkstudio-fb",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     "client_email": "firebase-adminsdk-...@talkstudio-fb.iam.gserviceaccount.com",
     ...
   }
   ```
4. **Easiest**: base64-encode the entire file (so the multiline `private_key` doesn't break DO's secret input):
   ```bash
   base64 -w0 < /path/to/talkstudio-fb-firebase-adminsdk-*.json
   ```
5. Paste the base64 output as the value for `FIREBASE_SERVICE_ACCOUNT_JSON`.
6. The middleware accepts both raw JSON and base64 — base64 is recommended for DO's UI.

## Deploy steps

```bash
# 1. From the realestate repo (this worktree merged into main):
git push origin main

# 2. Set the new secret via doctl
doctl apps spec get 181c506b-52e2-43b8-848b-2bd46dca9a15 > /tmp/spec.yaml
# edit /tmp/spec.yaml — under the api service envs block, add:
#   - key: FIREBASE_SERVICE_ACCOUNT_JSON
#     value: <base64 string from step 4 above>
#     type: SECRET
#   - key: AUTH_MODE
#     value: both
#     scope: RUN_TIME
doctl apps update 181c506b-52e2-43b8-848b-2bd46dca9a15 --spec /tmp/spec.yaml

# 3. Watch deploy
doctl apps get-deployment <app-id> <new-deploy-id> --format Phase,Progress
```

## Verifying

Once the new revision is live:

```bash
# 1. /health still works without auth
curl https://re.talkstud.io/health

# 2. /api without any token: 401 (firebase mode) or 401 with WWW-Authenticate
#    (basic mode) — should reject
curl -i https://re.talkstud.io/api/providers/status

# 3. With basic auth: still works in 'both' mode
curl -u 'mfa:Sunrise-Crane-Altitude-8421' https://re.talkstud.io/api/providers/status

# 4. With a bogus Bearer token: 401
curl -H 'Authorization: Bearer fake' https://re.talkstud.io/api/providers/status

# 5. From talkstud.io/analyze browser console (signed in as Google user):
#    Should be able to fetch /api/providers/status without prompting for password
```

## Rollback

If anything misbehaves:

```bash
# Force AUTH_MODE back to 'basic' — disables Firebase verification entirely
doctl apps update 181c506b-... --spec  # set AUTH_MODE=basic in spec
```

The legacy basic-auth middleware code stays in the repo for this purpose.

## Cutting over (when comfortable)

Once talkstud.io has been hitting the API successfully for a few days:

```bash
# Set AUTH_MODE=firebase to drop basic-auth entirely
# Optionally remove BASIC_AUTH_USER / BASIC_AUTH_PASS secrets from DO
```

At that point re.talkstud.io's nginx basic-auth gate becomes the only friction left — when ready, also remove `auth_basic` from `infra/nginx.conf` so the legacy URL works without prompting (the API is still protected by Firebase Auth, so this is safe).

## Pass 2 follow-ups

- Sync mechanism: a Firestore trigger (Cloud Function) that mirrors `users/{uid}.isAdmin` → custom claim `isAdmin: true`, so the API can check `auth.token.isAdmin` directly without a second admin list.
- Per-tier route gating: `/api/crm/*` requires `isCrmTier` claim, etc.
- Sentry / error tracking around 401s to catch token expiration loops.
