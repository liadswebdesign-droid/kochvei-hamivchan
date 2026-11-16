#!/usr/bin/env bash
# Makes (or re-copies) the owner key for the stats dashboard, without ever printing it.
#
#   ./set-owner-key.sh <worker-host>          new key: Keychain + `wrangler secret put OWNER_KEY` + dashboard link to clipboard
#   ./set-owner-key.sh <worker-host> --copy   no new key: copy the dashboard link for the key already in the Keychain
#
# <worker-host> is what `npx wrangler deploy` printed, without https://, e.g. kochvei-stats.example.workers.dev
# A new key replaces the old one: every device that saved the old key has to open the new link once.
set -euo pipefail
cd "$(dirname "$0")"

SERVICE="kochvei-stats-owner-key"
ACCOUNT="liad"
HOST="${1:-}"
MODE="${2:-}"
HOST="${HOST#https://}"
HOST="${HOST%%/*}"
if [[ -z "$HOST" || ! "$HOST" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "usage: $0 <worker-host> [--copy]   (e.g. kochvei-stats.example.workers.dev)" >&2
  exit 1
fi

if [[ "$MODE" == "--copy" ]]; then
  KEY="$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w)"
else
  # 32 random bytes, base64url without padding (43 chars, safe in a URL fragment).
  KEY="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  if [[ ${#KEY} -lt 43 ]]; then echo "key generation failed" >&2; exit 1; fi

  # Keychain. Fed through `security -i` on stdin so the key never appears in a process's argument list.
  printf 'add-generic-password -U -s %s -a %s -w %s\n' "$SERVICE" "$ACCOUNT" "$KEY" | security -i >/dev/null
  if [[ "$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w)" != "$KEY" ]]; then
    echo "Keychain write could not be verified; nothing was sent to Cloudflare." >&2
    exit 1
  fi
  echo "Saved in the Keychain as \"$SERVICE\"."

  # Worker secret (wrangler reads the value from stdin when it is piped).
  printf '%s' "$KEY" | npx wrangler secret put OWNER_KEY >/dev/null
  echo "Set as the Worker secret OWNER_KEY."
fi

printf 'https://%s/#k=%s' "$HOST" "$KEY" | pbcopy
unset KEY
echo "Dashboard link copied to the clipboard. Open it on the iPhone (README: \"Add the dashboard to the iPhone\")."
