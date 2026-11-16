# kochvei-stats

A tiny Cloudflare Worker + D1 database that counts **which devices** use the כוכבי המבחן app, so the owner can see
whether the link has spread beyond the families it was shared with, plus a private dashboard for the owner's iPhone.

## What it stores, and what it never stores

Per device (a random id the app makes on first run, `kh:device` in the tablet's localStorage):
first/last seen, city/region/country from Cloudflare's `request.cf`, a coarse device label from the User-Agent
("Android tablet · Chrome"), app build id, **number** of profiles, installed-or-browser, and a name the owner can give it.
Per device per Israel-local day: opens and active minutes.

Never: IP addresses, the raw User-Agent, profile names, companions, answers, scores, or anything else a child did.
The app sends exactly `{d, ev, min, v, p, standalone}` (see `app/src/lib/telemetry.js`); the Worker refuses anything else.
Parents can switch it off on the parent screen ("שליחת נתוני שימוש"). Worker logs (`observability`) are off.

Limits: 300 pings and 600 minutes per device per day, 500 devices in total, and a per-IP rate limit (Cloudflare's
in-memory rate-limit binding, keyed by a hash of the IP).

## Files

| File | |
|---|---|
| `src/app.js` | all routes: `POST /ping`, `GET /api/stats`, `POST /api/label`, the dashboard |
| `src/worker.js` | the entry (the runtime allows only the handler as an export) |
| `src/validate.js`, `src/ua.js`, `src/time.js` | request validation, device label, Israel dates |
| `dashboard/` | the dashboard page (HTML, CSS, JS, icon); `scripts/bundle-dashboard.mjs` inlines it into the git-ignored `src/dashboard.gen.js` |
| `schema.sql` | the D1 tables (idempotent) |
| `set-owner-key.sh` | makes the owner key: Keychain + Worker secret + dashboard link on the clipboard |

## Deploy (once)

Needs `npx wrangler login` done first (interactive, in Terminal). All commands run in `stats/`.

```sh
cd "$HOME/Documents/Smart Girls/stats"
npm ci

# 1. Database. Copy the printed database_id into wrangler.toml (replaces REPLACE_WITH_D1_DATABASE_ID).
npx wrangler d1 create kochvei-stats
npx wrangler d1 execute kochvei-stats --remote --file=schema.sql

# 2. Worker. Prints the URL, e.g. https://kochvei-stats.<account-subdomain>.workers.dev
#    (first deploy on an account with no workers.dev subdomain asks to register one).
npx wrangler deploy

# 3. Owner key (never printed): Keychain item "kochvei-stats-owner-key", Worker secret OWNER_KEY,
#    and the dashboard link https://<host>/#k=<key> on the clipboard.
./set-owner-key.sh kochvei-stats.<account-subdomain>.workers.dev

# 4. Point the app at it: a repo VARIABLE (public URL, not a secret), read by .github/workflows/pages.yml.
export PATH="/opt/homebrew/bin:$PATH"
gh variable set STATS_URL --repo liadswebdesign-droid/kochvei-hamivchan --body "https://kochvei-stats.<account-subdomain>.workers.dev"

# 5. Rebuild the app so the build picks the variable up (or just push to main).
gh workflow run pages.yml --repo liadswebdesign-droid/kochvei-hamivchan
```

`STATS_URL` must be the bare origin (`https://host`, no path); `app/vite.config.js` fails the build otherwise.
Without the variable the app builds with usage pings fully off.

### Check it

```sh
H=https://kochvei-stats.<account-subdomain>.workers.dev
# CORS preflight from the app origin: 204
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS -H 'Origin: https://liadswebdesign-droid.github.io' $H/ping
# stats without the key: 401
curl -s -o /dev/null -w '%{http_code}\n' $H/api/stats
# stats with the key (read from the Keychain, never echoed): 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(security find-generic-password -s kochvei-stats-owner-key -a liad -w)" $H/api/stats
```

Then open the app on a tablet, open the parent screen, note the 4-character device code, and find it on the dashboard.

## Add the dashboard to the iPhone

1. After step 3 the link is on the Mac's clipboard; with Universal Clipboard it pastes on the iPhone too. Open it in Safari.
   The page saves the key and removes it from the address bar.
2. Share → Add to Home Screen.
3. Open the new home-screen icon. iOS gives home-screen apps their own storage, so it asks for the key once:
   paste the same link into the box and tap כניסה.

To copy the link again later without making a new key: `./set-owner-key.sh <host> --copy`.
A new key (running the script without `--copy`) logs out every device that saved the old one.

## Develop locally

```sh
npm test                                   # vitest, real SQL on node:sqlite (Node 22.5+)
npx wrangler d1 execute kochvei-stats --local --file=schema.sql
printf 'OWNER_KEY=%s\nALLOWED_ORIGIN=http://localhost:4173\n' "$(openssl rand -hex 32)" > .dev.vars   # git-ignored
npx wrangler dev --local                   # http://localhost:8787
```

App against the local Worker (the override is needed because the app never sends from localhost or in dev):

```sh
cd ../app
VITE_STATS_URL=http://localhost:8787 VITE_STATS_ALLOW_LOCAL=1 npm run build:preview && npx vite preview --port 4173
```

Never set `VITE_STATS_ALLOW_LOCAL` in CI.

## Data

Wipe one device: `npx wrangler d1 execute kochvei-stats --remote --command "DELETE FROM daily WHERE device='<ID>'; DELETE FROM devices WHERE id='<ID>'"`.
There is no automatic retention limit; old `daily` rows can be removed the same way by `day`.
