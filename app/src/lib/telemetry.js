// Anonymous usage pings to the owner's stats Worker (stats/ in this repo). What is sent, and nothing else:
//   d           a random device id made on this device (localStorage kh:device)
//   ev          'open' (app start, or back after 30+ minutes away) or 'beat' (every 5 minutes while visible)
//   min         whole minutes the app was visible since the last ping (0–10)
//   v           the app build id
//   p           how many profiles exist on the device (a count; never names)
//   standalone  whether the app runs installed (home screen) or in a browser tab
// Never answers, scores, names, companions or anything else from a profile.
//
// Off when: the build has no VITE_STATS_URL, a dev server, a page served from localhost (unless the build sets
// VITE_STATS_ALLOW_LOCAL=1 for a local check), or the parent turned it off (localStorage kh:telemetry-off = '1').
// Fire and forget: offline means nothing is sent, nothing is queued, and every error is swallowed.

export const DEVICE_KEY = 'kh:device';
export const OFF_KEY = 'kh:telemetry-off';
export const BEAT_MS = 5 * 60 * 1000;
export const AWAY_MS = 30 * 60 * 1000;
const MIN_MS = 60 * 1000;
const MAX_MIN = 10;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ID_RE = /^[A-Z2-7]{16}$/;
const LOCAL_HOST = /^(localhost|127(\.\d+){3}|\[::1\]|::1|0\.0\.0\.0)$|\.localhost$/i;

// ---- config (build time) -------------------------------------------------------------------------------------------
const ENV = import.meta.env || {};
const RAW_URL = import.meta.env.VITE_STATS_URL;
export const STATS_URL = typeof RAW_URL === 'string' ? RAW_URL.trim() : '';
const ALLOW_LOCAL = import.meta.env.VITE_STATS_ALLOW_LOCAL === '1';
// eslint-disable-next-line no-undef
const BUILD_ID = typeof __KH_BUILD__ === 'string' ? __KH_BUILD__ : 'dev';

// The /ping URL, or '' when the endpoint is missing or not http(s).
export function pingUrl(base) {
  if (!base) return '';
  try {
    const u = new URL('/ping', base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

// ---- storage (guarded: private mode or blocked storage must never crash the app) -------------------------------------
function lsGet(storage, k) {
  try {
    return storage ? storage.getItem(k) : null;
  } catch {
    return null;
  }
}
function lsSet(storage, k, v) {
  try {
    if (storage) storage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function lsDel(storage, k) {
  try {
    if (storage) storage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function newDeviceId(rand) {
  const bytes = new Uint8Array(16);
  rand(bytes);
  return Array.from(bytes, (b) => B32[b & 31]).join('');
}

const defaultStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};
const defaultRand = (bytes) => crypto.getRandomValues(bytes);

let memoryId = null; // when storage is unavailable, one id per app run
export function getDeviceId({ storage = defaultStorage(), rand = defaultRand } = {}) {
  const have = lsGet(storage, DEVICE_KEY);
  if (have && ID_RE.test(have)) return have;
  if (!storage && memoryId) return memoryId;
  const id = newDeviceId(rand);
  lsSet(storage, DEVICE_KEY, id);
  memoryId = id;
  return id;
}
// The first 4 characters, shown on the parent screen and on the owner's dashboard.
export const deviceCode = (opts) => getDeviceId(opts).slice(0, 4);

export const isTelemetryOff = (storage = defaultStorage()) => lsGet(storage, OFF_KEY) === '1';
export function setTelemetryOff(off, storage = defaultStorage()) {
  if (off) lsSet(storage, OFF_KEY, '1');
  else lsDel(storage, OFF_KEY);
}

// True when this build has an endpoint at all (the parent screen shows its section only then).
export const telemetryConfigured = (url = STATS_URL) => !!pingUrl(url);

// ---- the pinger --------------------------------------------------------------------------------------------------------
// Everything it touches comes in through `deps`, so tests can drive it with fakes.
export function createTelemetry(deps) {
  const {
    url, dev = false, allowLocal = false, build = 'dev', hostname = '',
    doc, storage, fetchFn, now = () => Date.now(), setIntervalFn = setInterval,
    rand = defaultRand, profiles = () => 0, standalone = () => false,
  } = deps;
  const endpoint = pingUrl(url);
  const blocked = !endpoint || ((dev || LOCAL_HOST.test(hostname)) && !allowLocal);

  let visibleSince = null; // ms, while visible
  let carry = 0; // visible ms not yet reported
  let hiddenAt = null;

  const visible = () => doc.visibilityState === 'visible';
  const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));

  function send(ev, min) {
    if (blocked || isTelemetryOff(storage)) return false;
    let body;
    try {
      body = JSON.stringify({
        d: getDeviceId({ storage, rand }),
        ev,
        min: clampInt(min, 0, MAX_MIN),
        v: String(build).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'unknown',
        p: clampInt(profiles(), 0, 10),
        standalone: !!standalone(),
      });
      // text/plain keeps it a CORS "simple" request: no preflight, so keepalive works everywhere.
      const p = fetchFn(endpoint, {
        method: 'POST',
        body,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  // Whole visible minutes since the last report (at most 10); the remainder carries over. A gap longer than 10 minutes
  // since the last tick (device asleep while "visible") counts as 10 at most.
  function takeMinutes() {
    const t = now();
    if (visibleSince != null) {
      carry += Math.max(0, Math.min(t - visibleSince, MAX_MIN * MIN_MS));
      visibleSince = t;
    }
    const min = Math.min(MAX_MIN, Math.floor(carry / MIN_MS));
    carry = Math.min(carry - min * MIN_MS, MIN_MS - 1);
    return min;
  }

  function onVisibility() {
    if (visible()) {
      const t = now();
      const longAway = hiddenAt == null || t - hiddenAt > AWAY_MS;
      visibleSince = t;
      hiddenAt = null;
      if (longAway) send('open', takeMinutes());
    } else if (visibleSince != null) {
      // Leaving: report whole minutes now (keepalive lets it finish after the page is gone).
      const min = takeMinutes();
      visibleSince = null;
      hiddenAt = now();
      if (min > 0) send('beat', min);
    }
  }

  function tick() {
    if (visible() && visibleSince != null) send('beat', takeMinutes());
  }

  function start() {
    if (blocked) return false;
    if (visible()) {
      visibleSince = now();
      send('open', 0);
    }
    doc.addEventListener('visibilitychange', onVisibility);
    setIntervalFn(tick, BEAT_MS);
    return true;
  }

  return { start, tick, onVisibility, send, get blocked() { return blocked; } };
}

// Browser wiring, called once from main.jsx. `profiles` returns the number of profiles on the device.
export function initTelemetry({ profiles } = {}) {
  try {
    if (typeof document === 'undefined' || typeof fetch !== 'function') return null;
    const mq = (q) => {
      try {
        return window.matchMedia(q).matches;
      } catch {
        return false;
      }
    };
    const t = createTelemetry({
      url: STATS_URL,
      dev: !!ENV.DEV,
      allowLocal: ALLOW_LOCAL,
      build: BUILD_ID,
      hostname: location.hostname,
      doc: document,
      storage: defaultStorage(),
      fetchFn: (u, o) => fetch(u, o),
      profiles,
      // The manifest asks for fullscreen; iOS reports the home-screen app through navigator.standalone.
      standalone: () => mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navigator.standalone === true,
    });
    t.start();
    return t;
  } catch {
    return null;
  }
}
