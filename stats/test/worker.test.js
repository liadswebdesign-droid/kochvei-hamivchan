import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker, { handlePing, handleStats, LIMITS, safeEqual, CSP_PAGE } from '../src/app.js';
import { MAX_BODY } from '../src/validate.js';
import { parsePing, parseLabel, parseJsonBody } from '../src/validate.js';
import { deviceKind } from '../src/ua.js';
import { israelDay, addDays } from '../src/time.js';
import { fakeD1 } from './fake-d1.js';

const ORIGIN = 'https://liadswebdesign-droid.github.io';
const KEY = 'k'.repeat(10) + 'TestOwnerKey_0123456789-abcdefghij';
const BASE = 'https://stats.example.workers.dev';
const IP = '203.0.113.77';
const UA_TAB = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEV_A = 'ABCDEFGHJKLMNP23';
const DEV_B = 'QRSTUVWXYZ234567';
const ping = (over = {}) => ({ d: DEV_A, ev: 'open', min: 0, v: 'abc1234', p: 2, standalone: true, ...over });

let env;
beforeEach(() => {
  env = { DB: fakeD1(), ALLOWED_ORIGIN: ORIGIN, OWNER_KEY: KEY };
});

function pingReq(body, { origin = ORIGIN, type = 'text/plain;charset=UTF-8', cf = { city: 'Haifa', region: 'Haifa District', country: 'IL' }, ua = UA_TAB } = {}) {
  const headers = { 'User-Agent': ua, 'CF-Connecting-IP': IP };
  if (origin) headers.Origin = origin;
  if (type) headers['Content-Type'] = type;
  const req = new Request(BASE + '/ping', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  Object.defineProperty(req, 'cf', { value: cf });
  return req;
}
const call = (req) => worker.fetch(req, env);
const get = (path, headers = {}) => call(new Request(BASE + path, { headers }));
const auth = { Authorization: 'Bearer ' + KEY };
const rows = (sql, ...a) => env.DB.raw.prepare(sql).all(...a);

// ---- validation ------------------------------------------------------------------------------------------------------------
describe('parsePing', () => {
  it('accepts exactly the documented shape', () => {
    expect(parsePing(ping())).toEqual({ ...ping(), names: null, touch: null }); // an older build: no names, no touch flag
    expect(parsePing(ping({ ev: 'beat', min: 10, p: 0, standalone: false }))).not.toBeNull();
  });
  it.each([
    ['extra key', { ...ping(), name: 'x' }],
    ['missing key', (({ p, ...r }) => r)(ping())],
    ['lower-case id', ping({ d: DEV_A.toLowerCase() })],
    ['short id', ping({ d: DEV_A.slice(1) })],
    ['non-base32 id', ping({ d: 'ABCDEFGH1JKLMNP0' })],
    ['bad event', ping({ ev: 'answer' })],
    ['negative minutes', ping({ min: -1 })],
    ['too many minutes', ping({ min: 11 })],
    ['fractional minutes', ping({ min: 1.5 })],
    ['minutes as string', ping({ min: '3' })],
    ['too many profiles', ping({ p: 11 })],
    ['standalone as string', ping({ standalone: 'true' })],
    ['build id with spaces', ping({ v: 'a b' })],
    ['long build id', ping({ v: 'x'.repeat(41) })],
  ])('refuses %s', (_, body) => expect(parsePing(body)).toBeNull());
  it('refuses non-objects', () => {
    for (const v of [null, [], 'x', 1, true]) expect(parsePing(v)).toBeNull();
  });
});

describe('parseJsonBody', () => {
  const enc = (s) => new TextEncoder().encode(s).buffer;
  it('parses a small JSON object', () => expect(parseJsonBody(enc('{"a":1}'))).toEqual({ a: 1 }));
  it('refuses > 2 KB, empty, arrays, invalid JSON and invalid UTF-8', () => {
    expect(parseJsonBody(enc(JSON.stringify({ a: 'x'.repeat(2100) })))).toBeNull();
    expect(parseJsonBody(new ArrayBuffer(0))).toBeNull();
    expect(parseJsonBody(enc('[1]'))).toBeNull();
    expect(parseJsonBody(enc('{a:1}'))).toBeNull();
    expect(parseJsonBody(new Uint8Array([0x7b, 0xff, 0x7d]).buffer)).toBeNull();
  });
});

describe('parseLabel', () => {
  it('trims and collapses spaces; empty or null clears', () => {
    expect(parseLabel({ d: DEV_A, label: '  טאבלט   סלון ' })).toEqual({ d: DEV_A, label: 'טאבלט סלון' });
    expect(parseLabel({ d: DEV_A, label: '' })).toEqual({ d: DEV_A, label: null });
    expect(parseLabel({ d: DEV_A, label: null })).toEqual({ d: DEV_A, label: null });
  });
  it('allows 40 characters, refuses 41, control/bidi characters and extra keys', () => {
    expect(parseLabel({ d: DEV_A, label: 'א'.repeat(40) })).not.toBeNull();
    expect(parseLabel({ d: DEV_A, label: 'א'.repeat(41) })).toBeNull();
    expect(parseLabel({ d: DEV_A, label: 'a\nb' })).toBeNull();
    expect(parseLabel({ d: DEV_A, label: 'a‮b' })).toBeNull();
    expect(parseLabel({ d: DEV_A, label: 'x', extra: 1 })).toBeNull();
    expect(parseLabel({ d: 'nope', label: 'x' })).toBeNull();
  });
});

describe('deviceKind', () => {
  it.each([
    [UA_TAB, 'Android tablet · Chrome'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Android phone · Chrome'],
    ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36', 'Android tablet · Samsung Internet'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1', 'iPhone · Safari'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', 'iPad · Chrome'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15', 'iPad/Mac · Safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Mac · Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0', 'Windows · Edge'],
    ['curl/8.0', 'Other'],
    ['', 'Unknown'],
  ])('%s', (ua, kind) => expect(deviceKind(ua)).toBe(kind));
});

describe('Israel-local dates', () => {
  it('rolls over at Israeli midnight, winter and summer', () => {
    expect(israelDay(Date.UTC(2026, 10, 15, 21, 59))).toBe('2026-11-15'); // 23:59 IST (UTC+2)
    expect(israelDay(Date.UTC(2026, 10, 15, 22, 0))).toBe('2026-11-16'); // 00:00 IST
    expect(israelDay(Date.UTC(2026, 6, 1, 20, 59))).toBe('2026-07-01'); // 23:59 IDT (UTC+3)
    expect(israelDay(Date.UTC(2026, 6, 1, 21, 0))).toBe('2026-07-02');
  });
  it('addDays crosses months', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
});

describe('safeEqual', () => {
  it('compares by value', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('', 'abc')).toBe(false);
  });
});

// ---- POST /ping ------------------------------------------------------------------------------------------------------------
describe('POST /ping', () => {
  it('stores the device with geo and a coarse kind, answers 204 with CORS for the app origin', async () => {
    const res = await call(pingReq(ping()));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const [d] = rows('SELECT * FROM devices');
    expect(d).toMatchObject({ id: DEV_A, city: 'Haifa', region: 'Haifa District', country: 'IL', kind: 'Android tablet · Chrome', version: 'abc1234', profiles: 2, standalone: 1, label: null });
    expect(d.first_seen).toBe(d.last_seen);
    expect(rows('SELECT opens, minutes, pings FROM daily')).toEqual([{ opens: 1, minutes: 0, pings: 1 }]);
  });

  it('never stores the IP address or the raw User-Agent', async () => {
    await call(pingReq(ping()));
    await call(pingReq(ping({ ev: 'beat', min: 5 })));
    const dump = JSON.stringify([rows('SELECT * FROM devices'), rows('SELECT * FROM daily')]);
    expect(dump).not.toContain(IP);
    expect(dump).not.toContain('SM-X710');
    expect(dump).not.toContain('Mozilla');
  });

  it('adds opens and minutes per Israel-local day', async () => {
    const t = Date.UTC(2026, 10, 15, 21, 0); // 23:00 in Israel
    await handlePing(pingReq(ping()), env, t);
    await handlePing(pingReq(ping({ ev: 'beat', min: 5 })), env, t + 5 * 60000);
    await handlePing(pingReq(ping({ ev: 'beat', min: 4 })), env, t + 65 * 60000); // 00:05 next day
    expect(rows('SELECT day, opens, minutes, pings FROM daily ORDER BY day')).toEqual([
      { day: '2026-11-15', opens: 1, minutes: 5, pings: 2 },
      { day: '2026-11-16', opens: 0, minutes: 4, pings: 1 },
    ]);
    expect(rows('SELECT first_seen, last_seen FROM devices')).toEqual([{ first_seen: t, last_seen: t + 65 * 60000 }]);
  });

  it('caps pings at 300 and minutes at 600 per device per day', async () => {
    const t = Date.UTC(2026, 10, 16, 8, 0);
    for (let i = 0; i < 310; i++) await handlePing(pingReq(ping({ ev: i % 2 ? 'beat' : 'open', min: 10 })), env, t + i);
    expect(rows('SELECT opens, minutes, pings FROM daily')).toEqual([{ opens: 150, minutes: 600, pings: 300 }]);
  });

  it('refuses new devices past the device cap, keeps counting known ones', async () => {
    const saved = LIMITS.maxDevices;
    LIMITS.maxDevices = 1;
    try {
      await call(pingReq(ping()));
      expect((await call(pingReq(ping({ d: DEV_B })))).status).toBe(204);
      await call(pingReq(ping({ ev: 'beat', min: 3 })));
      expect(rows('SELECT id FROM devices')).toEqual([{ id: DEV_A }]);
      expect(rows('SELECT device, minutes FROM daily')).toEqual([{ device: DEV_A, minutes: 3 }]);
    } finally {
      LIMITS.maxDevices = saved;
    }
  });

  it('refuses other origins, bad content types, bad JSON, bad shapes and big bodies', async () => {
    expect((await call(pingReq(ping(), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await call(pingReq(ping(), { origin: null }))).status).toBe(403);
    expect((await call(pingReq(ping(), { type: 'application/x-www-form-urlencoded' }))).status).toBe(400);
    expect((await call(pingReq('{nope', {}))).status).toBe(400);
    expect((await call(pingReq(ping({ min: 99 })))).status).toBe(400);
    expect((await call(pingReq({ ...ping(), pad: 'x'.repeat(1100) }))).status).toBe(400);
    expect(rows('SELECT * FROM devices')).toEqual([]);
  });

  it('refuses a big streamed body without Content-Length', async () => {
    const big = new TextEncoder().encode(JSON.stringify({ ...ping(), pad: 'x'.repeat(5000) }));
    const body = new ReadableStream({
      start(c) {
        for (let i = 0; i < big.length; i += 256) c.enqueue(big.slice(i, i + 256));
        c.close();
      },
    });
    const req = new Request(BASE + '/ping', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body, duplex: 'half' });
    expect((await call(req)).status).toBe(400);
  });

  it('accepts application/json too', async () => {
    expect((await call(pingReq(ping(), { type: 'application/json' }))).status).toBe(204);
  });

  it('answers the CORS preflight only for the app origin', async () => {
    const ok = await call(new Request(BASE + '/ping', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    const bad = await call(new Request(BASE + '/ping', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /ping is 405', async () => expect((await get('/ping')).status).toBe(405));

  it('honours the rate limiter, keyed by a hash and never by the raw IP', async () => {
    const keys = [];
    env.PING_LIMIT = { limit: async ({ key }) => (keys.push(key), { success: keys.length <= 2 }) };
    expect((await call(pingReq(ping()))).status).toBe(204);
    expect((await call(pingReq(ping()))).status).toBe(204);
    expect((await call(pingReq(ping()))).status).toBe(429);
    expect(keys.every((k) => /^[0-9a-f]{32}$/.test(k) && !k.includes(IP))).toBe(true);
  });
});

// ---- owner API ------------------------------------------------------------------------------------------------------------------
describe('GET /api/stats', () => {
  it('needs the owner key', async () => {
    expect((await get('/api/stats')).status).toBe(401);
    expect((await get('/api/stats', { Authorization: 'Bearer ' + KEY + 'x' })).status).toBe(401);
    expect((await get('/api/stats', { Authorization: KEY })).status).toBe(401);
    expect((await get('/api/stats', { Authorization: 'Bearer ' + KEY })).status).toBe(200);
  });
  it('fails closed when no key is configured', async () => {
    delete env.OWNER_KEY;
    expect((await get('/api/stats', { Authorization: 'Bearer ' })).status).toBe(503);
    env.OWNER_KEY = 'short';
    expect((await get('/api/stats', { Authorization: 'Bearer short' })).status).toBe(503);
  });
  it('returns devices newest-seen first with totals, 14 recent days and a 30-day summary', async () => {
    const now = Date.UTC(2026, 10, 16, 10, 0);
    const day = 86400000;
    await handlePing(pingReq(ping()), env, now - 20 * day);
    await handlePing(pingReq(ping({ ev: 'beat', min: 7 })), env, now - 20 * day + 60000);
    await handlePing(pingReq(ping({ d: DEV_B, standalone: false }), { cf: { city: 'Tel Aviv', country: 'IL' } }), env, now - 2 * day);
    await handlePing(pingReq(ping({ ev: 'beat', min: 4 })), env, now - day);
    const s = await handleStats(env, now);
    expect(s.today).toBe('2026-11-16');
    expect(s.devices.map((d) => d.id)).toEqual([DEV_A, DEV_B]);
    const a = s.devices[0];
    expect(a).toMatchObject({ code: 'ABCD', days_active: 2, total_opens: 1, total_minutes: 11, standalone: true, label: null });
    expect(a.recent).toHaveLength(14);
    expect(a.recent[0].day).toBe('2026-11-03');
    expect(a.recent[13]).toEqual({ day: '2026-11-16', opens: 0, minutes: 0 });
    expect(a.recent[12]).toEqual({ day: '2026-11-15', opens: 0, minutes: 4 });
    expect(s.devices[1]).toMatchObject({ city: 'Tel Aviv', standalone: false, days_active: 1 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily.find((d) => d.day === '2026-11-14')).toEqual({ day: '2026-11-14', devices: 1, opens: 1, minutes: 0 });
    expect(s.daily.find((d) => d.day === '2026-10-27')).toEqual({ day: '2026-10-27', devices: 1, opens: 1, minutes: 7 });
  });
});

describe('POST /api/label', () => {
  const label = (body, headers = auth) =>
    call(new Request(BASE + '/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  it('sets and clears a label', async () => {
    await call(pingReq(ping()));
    expect((await label({ d: DEV_A, label: 'טאבלט סלון' })).status).toBe(200);
    expect(rows('SELECT label FROM devices')).toEqual([{ label: 'טאבלט סלון' }]);
    expect((await label({ d: DEV_A, label: '' })).status).toBe(200);
    expect(rows('SELECT label FROM devices')).toEqual([{ label: null }]);
  });
  it('refuses without the key, unknown devices and bad labels', async () => {
    await call(pingReq(ping()));
    expect((await label({ d: DEV_A, label: 'x' }, {})).status).toBe(401);
    expect((await label({ d: DEV_B, label: 'x' })).status).toBe(404);
    expect((await label({ d: DEV_A, label: 'x'.repeat(41) })).status).toBe(400);
    expect(rows('SELECT label FROM devices')).toEqual([{ label: null }]);
  });
});

// ---- headers and dashboard ---------------------------------------------------------------------------------------------------
describe('security headers', () => {
  it('are on every response', async () => {
    const responses = [
      await get('/'),
      await get('/app.js'),
      await get('/app.css'),
      await get('/icon.png'),
      await get('/manifest.webmanifest'),
      await get('/api/stats'),
      await get('/api/stats', auth),
      await get('/nope'),
      await get('/ping'),
      await call(pingReq(ping())),
      await call(pingReq(ping(), { origin: 'https://evil.example' })),
    ];
    for (const r of responses) {
      expect(r.headers.get('Content-Security-Policy')).toMatch(/default-src 'none'/);
      expect(r.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/);
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(r.headers.get('Strict-Transport-Security')).toMatch(/max-age=/);
    }
  });
  it('the page policy allows no inline code, and the page has none', async () => {
    expect(CSP_PAGE).not.toMatch(/unsafe|nonce|data:|\*/);
    const res = await get('/');
    expect(res.headers.get('Content-Security-Policy')).toBe(CSP_PAGE);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
    const html = await res.text();
    expect(html).toMatch(/<script src="\/app\.js" defer><\/script>/);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/\sstyle=|<style|\son[a-z]+=/i);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });
  it('the dashboard page carries no data', async () => {
    await call(pingReq(ping()));
    const html = await (await get('/')).text();
    expect(html).not.toContain(DEV_A);
    expect(html).not.toContain('Haifa');
  });
  it('API responses are never cached', async () => {
    expect((await get('/api/stats', auth)).headers.get('Cache-Control')).toBe('no-store');
  });
});

// ---- 2026-11-20: profile names, provider, scanners, tablets in desktop mode -------------------------------------------------
const ping2 = (over = {}) => ({ ...ping(), n: ['נועה', 'מאיה'], t: true, ...over });
const UA_DESKTOP_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('ping with names (builds from 2026-11-20)', () => {
  it('parses names and the touch flag; trims and collapses spaces', () => {
    expect(parsePing(ping2({ n: ['  נועה  לוי '] }))).toMatchObject({ names: ['נועה לוי'], touch: true });
    expect(parsePing(ping2({ n: [] }))).toMatchObject({ names: [] });
  });
  it.each([
    ['a name over 24 letters', ping2({ n: ['א'.repeat(25)] })],
    ['an empty name', ping2({ n: ['  '] })],
    ['a bidi override', ping2({ n: ['נועה\u202e'] })],
    ['a non-string name', ping2({ n: [3] })],
    ['11 names', ping2({ n: Array(11).fill('א') })],
    ['touch as a string', ping2({ t: 'yes' })],
    ['names without touch', (({ t, ...o }) => o)(ping2())],
  ])('refuses %s', (_, body) => expect(parsePing(body)).toBeNull());

  it('ten long Hebrew names fit in the body limit', () => {
    expect(new TextEncoder().encode(JSON.stringify(ping2({ n: Array(10).fill('א'.repeat(24)) }))).length).toBeLessThan(MAX_BODY);
  });

  it('stores the names and the provider; a ping from an older build keeps the stored names', async () => {
    await call(pingReq(ping2(), { cf: { city: 'Rehovot', country: 'IL', asn: 8551, asOrganization: 'Bezeq International' } }));
    await call(pingReq(ping({ ev: 'beat', min: 5 })));
    const s = await handleStats(env);
    expect(s.devices[0]).toMatchObject({ names: ['נועה', 'מאיה'], bot: false });
    expect(rows('SELECT net FROM devices')[0].net).toBe(null); // the last ping had no provider
    await call(pingReq(ping2({ n: ['נועה'] }), { cf: { city: 'Rehovot', country: 'IL', asn: 8551, asOrganization: 'Bezeq International' } }));
    expect((await handleStats(env)).devices[0]).toMatchObject({ names: ['נועה'], net: 'Bezeq International' });
  });

  it('a Linux desktop User-Agent with a touch screen is an Android tablet in desktop mode', async () => {
    expect(deviceKind(UA_DESKTOP_LINUX, true)).toBe('Android tablet · Chrome');
    expect(deviceKind(UA_DESKTOP_LINUX, false)).toBe('Linux · Chrome');
    await call(pingReq(ping2(), { ua: UA_DESKTOP_LINUX }));
    expect(rows('SELECT kind FROM devices')[0].kind).toBe('Android tablet · Chrome');
  });
});

describe('scanners from cloud networks', () => {
  it('are flagged and kept out of the daily summary; a person is never turned into a scanner', async () => {
    const now = Date.UTC(2026, 10, 19, 12, 0);
    await handlePing(pingReq(ping2({ d: DEV_B, p: 0, n: [] }), { cf: { city: 'Moncks Corner', country: 'US', asn: 15169, asOrganization: 'Google LLC' } }), env, now);
    await handlePing(pingReq(ping2(), { cf: { city: 'Rehovot', country: 'IL', asn: 8551 } }), env, now);
    await handlePing(pingReq(ping2({ ev: 'beat', min: 5 }), { cf: { city: 'Ashburn', country: 'US', asn: 16509 } }), env, now + 60000); // a VPN
    const s = await handleStats(env, now + 120000);
    const byId = Object.fromEntries(s.devices.map((d) => [d.id, d]));
    expect(byId[DEV_B].bot).toBe(true);
    expect(byId[DEV_A].bot).toBe(false);
    expect(s.daily.find((d) => d.day === '2026-11-19')).toMatchObject({ devices: 1, minutes: 5 });
  });
});
