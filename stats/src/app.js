// kochvei-stats (all logic; src/worker.js is the entry): counts which devices use the כוכבי המבחן PWA, and serves the owner's private dashboard.
//
//   POST /ping          from the app (CORS: ALLOWED_ORIGIN only). Device id + open/beat + active minutes. No IP is
//                       stored, no raw User-Agent, nothing about answers, scores or names.
//   GET  /api/stats     owner only (Authorization: Bearer OWNER_KEY)
//   POST /api/label     owner only: name a device
//   GET  /              the dashboard (public page, no data in it; it fetches /api/stats with the owner key)
import { parseJsonBody, parsePing, parseLabel, MAX_BODY } from './validate.js';
import { deviceKind } from './ua.js';
import { israelDay, addDays } from './time.js';
import { INDEX_HTML, APP_JS, APP_CSS, MANIFEST, ICON_PNG_B64 } from './dashboard.gen.js';

export const LIMITS = {
  maxDevices: 500, // new devices past this many are ignored
  pingsPerDay: 300, // per device per Israel-local day; later pings are ignored
  minutesPerDay: 600, // per device per day
};

// ---- headers -----------------------------------------------------------------------------------------------------------
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const CSP_NONE = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// The dashboard: no inline script or style at all; JS and CSS come from this Worker ('self').
export const CSP_PAGE = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "connect-src 'self'",
  "manifest-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

function respond(body, { status = 200, type, csp = CSP_NONE, cache = 'no-store', extra = {} } = {}) {
  const h = new Headers({ ...BASE_HEADERS, 'Content-Security-Policy': csp, 'Cache-Control': cache, ...extra });
  if (type) h.set('Content-Type', type);
  return new Response(body, { status, headers: h });
}
const json = (obj, status = 200, extra) => respond(JSON.stringify(obj), { status, type: 'application/json; charset=utf-8', extra });
const fail = (status, error, extra) => json({ error }, status, extra);

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Vary': 'Origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------
// Reads at most `max` bytes of the body; null when it is longer (without buffering the rest).
export async function readCapped(request, max = MAX_BODY) {
  const len = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(len) && len > max) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

const isJsonish = (request, allowText) => {
  const t = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  return t === 'application/json' || (allowText && t === 'text/plain');
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));

// Constant-time comparison: both sides are hashed first, so the compare never depends on length or content.
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(x, y);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

// Cloudflare's rate-limit binding (in-memory counters at the edge). Keyed by a hash of the IP, so not even the
// limiter sees the address itself. Missing binding (tests) = no limit.
async function rateLimited(limiter, request) {
  if (!limiter || typeof limiter.limit !== 'function') return false;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const { success } = await limiter.limit({ key: hex(await sha256('kochvei:' + ip)).slice(0, 32) });
    return !success;
  } catch {
    return false;
  }
}

const str = (v, max = 80) => (typeof v === 'string' && v ? v.slice(0, max) : null);

// ---- POST /ping ----------------------------------------------------------------------------------------------------------
export async function handlePing(request, env, now = Date.now()) {
  if (!env.ALLOWED_ORIGIN || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return fail(403, 'origin');
  const cors = corsHeaders(env);
  if (!isJsonish(request, true)) return fail(400, 'content-type', cors);
  if (await rateLimited(env.PING_LIMIT, request)) return fail(429, 'slow down', cors);
  const ping = parsePing(parseJsonBody(await readCapped(request)));
  if (!ping) return fail(400, 'bad ping', cors);

  const cf = request.cf || {};
  const day = israelDay(now);
  const kind = deviceKind(request.headers.get('User-Agent'));
  await env.DB.batch([
    // New device only while under the cap; a known device always updates.
    env.DB.prepare(
      `INSERT INTO devices (id, first_seen, last_seen, city, region, country, kind, version, profiles, standalone)
       SELECT ?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
       WHERE EXISTS (SELECT 1 FROM devices WHERE id = ?1) OR (SELECT COUNT(*) FROM devices) < ?10
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, city = excluded.city, region = excluded.region,
         country = excluded.country, kind = excluded.kind, version = excluded.version, profiles = excluded.profiles,
         standalone = excluded.standalone`,
    ).bind(ping.d, now, str(cf.city), str(cf.region), str(cf.country, 2), kind, ping.v, ping.p, ping.standalone ? 1 : 0, LIMITS.maxDevices),
    // Pings past the daily cap change nothing; minutes never pass the daily cap.
    env.DB.prepare(
      `INSERT INTO daily (device, day, opens, minutes, pings)
       SELECT ?1, ?2, ?3, MIN(?4, ?5), 1 WHERE EXISTS (SELECT 1 FROM devices WHERE id = ?1)
       ON CONFLICT(device, day) DO UPDATE SET opens = opens + excluded.opens,
         minutes = MIN(?5, minutes + excluded.minutes), pings = pings + 1
       WHERE pings < ?6`,
    ).bind(ping.d, day, ping.ev === 'open' ? 1 : 0, ping.min, LIMITS.minutesPerDay, LIMITS.pingsPerDay),
  ]);
  return respond(null, { status: 204, extra: cors });
}

function handlePreflight(request, env) {
  if (!env.ALLOWED_ORIGIN || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return fail(403, 'origin');
  return respond(null, {
    status: 204,
    extra: {
      ...corsHeaders(env),
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// ---- owner API --------------------------------------------------------------------------------------------------------------
async function authorize(request, env) {
  if (await rateLimited(env.API_LIMIT, request)) return fail(429, 'slow down');
  const key = env.OWNER_KEY;
  if (typeof key !== 'string' || key.length < 32) return fail(503, 'owner key not set');
  const m = /^Bearer ([\x21-\x7e]{1,256})$/.exec(request.headers.get('Authorization') || '');
  // Always compare (against a dummy when the header is malformed) so timing does not reveal which check failed.
  const ok = await safeEqual(m ? m[1] : '', key);
  return m && ok ? null : fail(401, 'unauthorized', { 'WWW-Authenticate': 'Bearer' });
}

export async function handleStats(env, now = Date.now()) {
  const today = israelDay(now);
  const from14 = addDays(today, -13);
  const from30 = addDays(today, -29);
  const [devs, totals, recent, summary] = await env.DB.batch([
    env.DB.prepare(
      'SELECT id, first_seen, last_seen, city, region, country, kind, version, profiles, standalone, label FROM devices ORDER BY last_seen DESC',
    ),
    env.DB.prepare('SELECT device, COUNT(*) AS days, SUM(opens) AS opens, SUM(minutes) AS minutes FROM daily GROUP BY device'),
    env.DB.prepare('SELECT device, day, opens, minutes FROM daily WHERE day >= ?1').bind(from14),
    env.DB.prepare(
      'SELECT day, COUNT(*) AS devices, SUM(opens) AS opens, SUM(minutes) AS minutes FROM daily WHERE day >= ?1 GROUP BY day',
    ).bind(from30),
  ]);
  const tot = new Map(totals.results.map((r) => [r.device, r]));
  const rec = new Map();
  for (const r of recent.results) {
    if (!rec.has(r.device)) rec.set(r.device, new Map());
    rec.get(r.device).set(r.day, r);
  }
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(from14, i));
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(from30, i));
  const sum = new Map(summary.results.map((r) => [r.day, r]));
  return {
    now,
    today,
    devices: devs.results.map((d) => {
      const t = tot.get(d.id) || {};
      const r = rec.get(d.id) || new Map();
      return {
        id: d.id,
        code: d.id.slice(0, 4),
        label: d.label,
        first_seen: d.first_seen,
        last_seen: d.last_seen,
        city: d.city,
        region: d.region,
        country: d.country,
        kind: d.kind,
        version: d.version,
        profiles: d.profiles,
        standalone: !!d.standalone,
        days_active: t.days || 0,
        total_opens: t.opens || 0,
        total_minutes: t.minutes || 0,
        recent: days14.map((day) => ({ day, opens: r.get(day)?.opens || 0, minutes: r.get(day)?.minutes || 0 })),
      };
    }),
    daily: days30.map((day) => ({ day, devices: sum.get(day)?.devices || 0, opens: sum.get(day)?.opens || 0, minutes: sum.get(day)?.minutes || 0 })),
  };
}

export async function handleLabel(request, env) {
  if (!isJsonish(request, false)) return fail(400, 'content-type');
  const body = parseLabel(parseJsonBody(await readCapped(request)));
  if (!body) return fail(400, 'bad label');
  const r = await env.DB.prepare('UPDATE devices SET label = ?1 WHERE id = ?2').bind(body.label, body.d).run();
  if (!r.meta || !r.meta.changes) return fail(404, 'no such device');
  return json({ ok: true, label: body.label });
}

// ---- dashboard assets ---------------------------------------------------------------------------------------------------------
let icon;
const iconBytes = () => (icon ||= Uint8Array.from(atob(ICON_PNG_B64), (c) => c.charCodeAt(0)));
const ASSETS = {
  '/': () => [INDEX_HTML, 'text/html; charset=utf-8'],
  '/app.js': () => [APP_JS, 'text/javascript; charset=utf-8'],
  '/app.css': () => [APP_CSS, 'text/css; charset=utf-8'],
  '/manifest.webmanifest': () => [MANIFEST, 'application/manifest+json; charset=utf-8'],
  '/icon.png': () => [iconBytes(), 'image/png'],
  '/apple-touch-icon.png': () => [iconBytes(), 'image/png'],
};

// ---- router -------------------------------------------------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname: path } = url;
    const method = request.method;
    try {
      if (path === '/ping') {
        if (method === 'OPTIONS') return handlePreflight(request, env);
        if (method === 'POST') return await handlePing(request, env);
        return fail(405, 'method', { Allow: 'POST, OPTIONS' });
      }
      if (path === '/api/stats') {
        if (method !== 'GET') return fail(405, 'method', { Allow: 'GET' });
        const denied = await authorize(request, env);
        if (denied) return denied;
        return json(await handleStats(env));
      }
      if (path === '/api/label') {
        if (method !== 'POST') return fail(405, 'method', { Allow: 'POST' });
        const denied = await authorize(request, env);
        if (denied) return denied;
        return await handleLabel(request, env);
      }
      const asset = ASSETS[path];
      if (asset) {
        if (method !== 'GET' && method !== 'HEAD') return fail(405, 'method', { Allow: 'GET, HEAD' });
        const [body, type] = asset();
        return respond(method === 'HEAD' ? null : body, { type, csp: CSP_PAGE, cache: 'no-cache' });
      }
      return fail(404, 'not found');
    } catch {
      // Never echo internals (or a request body) back.
      return fail(500, 'error');
    }
  },
};
