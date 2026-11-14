// Service-worker updates. The worker (vite-plugin-pwa generateSW, skipWaiting + clientsClaim) takes over as soon as a
// new deploy is installed; this page then reloads onto the new build at a safe moment, never mid-question: right away
// while the app is hidden, otherwise the next time it is hidden or the child is back on the map. Progress lives in
// localStorage, so such a reload loses nothing. The fullscreen PWA stays open for days, so updates are also checked
// whenever the app comes back into view and once an hour.
const CHECK_EVERY = 60 * 60 * 1000;
const GUARD_KEY = 'kh:sw-reload';
const GUARD_MS = 60 * 1000;

let pending = false; // a new worker took control; this page still runs the old build
let safe = false; // App: the map screen is showing

function reload() {
  pending = false;
  // Loop guard: at most one update reload a minute. A second takeover inside that minute waits for the next launch.
  try {
    if (Date.now() - (Number(sessionStorage.getItem(GUARD_KEY)) || 0) < GUARD_MS) return;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    /* no sessionStorage: `pending` still allows one reload per takeover */
  }
  window.location.reload();
}
function maybeReload() {
  if (pending && (document.visibilityState === 'hidden' || safe)) reload();
}

// App calls this with true while the map is showing and false everywhere else.
export function setSafeToReload(v) {
  safe = v;
  maybeReload();
}

export function initServiceWorker(url, scope) {
  const sw = navigator.serviceWorker;
  let controller = sw.controller;
  sw.addEventListener('controllerchange', () => {
    const had = controller;
    controller = sw.controller;
    if (!had) return; // first install: the worker just claimed a page that already runs the current build
    pending = true;
    maybeReload();
  });
  window.addEventListener('load', () => {
    sw.register(url, { scope })
      .then((reg) => {
        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, CHECK_EVERY);
      })
      .catch(() => {});
  });
  document.addEventListener('visibilitychange', maybeReload);
}
