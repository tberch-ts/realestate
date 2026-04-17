#!/bin/sh
# Runs on container start (nginx image auto-executes /docker-entrypoint.d/*.sh).
# - Writes /usr/share/nginx/html/env.js so the SPA can read runtime config without a rebuild.
# - Writes /etc/nginx/.htpasswd from BASIC_AUTH_USER / BASIC_AUTH_PASS.

set -eu

ENV_JS=/usr/share/nginx/html/env.js
HTPASSWD=/etc/nginx/.htpasswd

API_URL="${API_URL:-/api}"
GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY:-}"

cat > "$ENV_JS" <<EOF
window.__ENV__ = {
  API_URL: "${API_URL}",
  GOOGLE_MAPS_API_KEY: "${GOOGLE_MAPS_API_KEY}"
};
EOF

if [ -n "${BASIC_AUTH_USER:-}" ] && [ -n "${BASIC_AUTH_PASS:-}" ]; then
  htpasswd -bcB "$HTPASSWD" "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS" >/dev/null
  echo "[entrypoint] wrote htpasswd for user=${BASIC_AUTH_USER}"
else
  echo "[entrypoint] WARNING: BASIC_AUTH_USER / BASIC_AUTH_PASS not set — writing dummy credentials that will reject all requests"
  htpasswd -bcB "$HTPASSWD" "__disabled__" "$(head -c 32 /dev/urandom | base64)" >/dev/null
fi
