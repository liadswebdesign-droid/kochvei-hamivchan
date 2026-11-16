import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTelemetry, getDeviceId, deviceCode, newDeviceId, pingUrl, isTelemetryOff, setTelemetryOff, telemetryConfigured,
  DEVICE_KEY, OFF_KEY, BEAT_MS, AWAY_MS,
} from './telemetry.js';
import { statsOrigin } from './statsOrigin.js';

const MIN = 60000;
const URL_ = 'https://kochvei-stats.example.workers.dev';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  };
}
function fakeDoc(state = 'visible') {
  const listeners = [];
  return {
    visibilityState: state,
    addEventListener: (ev, fn) => ev === 'visibilitychange' && listeners.push(fn),
    set(s) {
      this.visibilityState = s;
      listeners.forEach((fn) => fn());
    },
  };
}

let clock, sent, storage, doc, intervals;
function make(over = {}) {
  return createTelemetry({
    url: URL_,
    dev: false,
    hostname: 'liadswebdesign-droid.github.io',
    build: 'f56d55d',
    doc,
    storage,
    fetchFn: (u, o) => {
      sent.push({ u, o, body: JSON.parse(o.body) });
      return Promise.resolve();
    },
    now: () => clock,
    setIntervalFn: (fn, ms) => intervals.push({ fn, ms }),
    rand: (b) => b.forEach((_, i) => (b[i] = i * 7)),
    profiles: () => 2,
    standalone: () => true,
    ...over,
  });
}
beforeEach(() => {
  clock = Date.UTC(2026, 10, 16, 8, 0);
  sent = [];
  storage = fakeStorage();
  doc = fakeDoc();
  intervals = [];
});

describe('telemetry: when nothing is sent', () => {
  it('without an endpoint URL', () => {
    const t = make({ url: '' });
    expect(t.start()).toBe(false);
    expect(t.send('open', 0)).toBe(false);
    expect(sent).toEqual([]);
    expect(intervals).toEqual([]);
    expect(telemetryConfigured('')).toBe(false);
    expect(telemetryConfigured('not a url')).toBe(false);
    expect(telemetryConfigured(URL_)).toBe(true);
  });
  it('in dev mode or from a localhost page, unless the explicit local override is set', () => {
    for (const over of [{ dev: true }, { hostname: 'localhost' }, { hostname: '127.0.0.1' }, { hostname: 'app.localhost' }]) {
      const t = make(over);
      expect(t.start()).toBe(false);
      expect(sent).toEqual([]);
    }
    expect(make({ dev: true, hostname: 'localhost', allowLocal: true }).start()).toBe(true);
    expect(sent).toHaveLength(1);
  });
  it('when the parent turned it off, also mid-session, and again after it is turned back on', () => {
    setTelemetryOff(true, storage);
    expect(storage.map.get(OFF_KEY)).toBe('1');
    const t = make();
    t.start();
    clock += BEAT_MS;
    t.tick();
    expect(sent).toEqual([]);
    setTelemetryOff(false, storage);
    expect(isTelemetryOff(storage)).toBe(false);
    clock += BEAT_MS;
    t.tick();
    expect(sent.map((s) => s.body.ev)).toEqual(['beat']);
    setTelemetryOff(true, storage);
    clock += BEAT_MS;
    t.tick();
    expect(sent).toHaveLength(1);
  });
});

describe('telemetry: payload', () => {
  it('has exactly the documented fields and nothing else, sent as a keepalive no-credentials POST', () => {
    make().start();
    expect(sent).toHaveLength(1);
    const { u, o, body } = sent[0];
    expect(u).toBe(URL_ + '/ping');
    expect(Object.keys(body).sort()).toEqual(['d', 'ev', 'min', 'p', 'standalone', 'v']);
    expect(body).toEqual({ d: getDeviceId({ storage }), ev: 'open', min: 0, v: 'f56d55d', p: 2, standalone: true });
    expect(body.d).toMatch(/^[A-Z2-7]{16}$/);
    expect(o).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
    expect(o.headers['Content-Type']).toMatch(/^text\/plain/); // a CORS simple request: no preflight
  });
  it('clamps the profile count and sanitises the build id', () => {
    make({ profiles: () => 37, build: 'a b/c', standalone: () => 0 }).start();
    expect(sent[0].body).toMatchObject({ p: 10, v: 'abc', standalone: false });
  });
  it('swallows a fetch that throws or rejects', () => {
    expect(() => make({ fetchFn: () => { throw new Error('offline'); } }).start()).not.toThrow();
    expect(() => make({ fetchFn: () => Promise.reject(new Error('offline')) }).start()).not.toThrow();
  });
});

describe('telemetry: events and minutes', () => {
  it('beats every 5 minutes while visible, carrying the visible minutes', () => {
    const t = make();
    t.start();
    expect(intervals).toEqual([{ fn: expect.any(Function), ms: BEAT_MS }]);
    clock += BEAT_MS;
    intervals[0].fn();
    clock += BEAT_MS + 30000;
    intervals[0].fn();
    clock += BEAT_MS - 30000;
    intervals[0].fn();
    expect(sent.map((s) => [s.body.ev, s.body.min])).toEqual([['open', 0], ['beat', 5], ['beat', 5], ['beat', 5]]);
  });
  it('counts only visible time: hidden time is not counted, leftover seconds carry over', () => {
    const t = make();
    t.start();
    clock += 2.5 * MIN;
    doc.set('hidden'); // 2 whole minutes reported on leaving, 30 s carried
    clock += 10 * MIN;
    t.tick(); // hidden: nothing
    doc.set('visible'); // back after 10 min: not a new open
    clock += 3.5 * MIN;
    t.tick(); // 30 s + 3.5 min = 4 min
    expect(sent.map((s) => [s.body.ev, s.body.min])).toEqual([['open', 0], ['beat', 2], ['beat', 4]]);
  });
  it('sends open again after being hidden for more than 30 minutes', () => {
    const t = make();
    t.start();
    clock += 0.5 * MIN;
    doc.set('hidden'); // under a minute: nothing to report
    clock += AWAY_MS + 1;
    doc.set('visible');
    expect(sent.map((s) => [s.body.ev, s.body.min])).toEqual([['open', 0], ['open', 0]]);
  });
  it('a page that starts hidden sends open when it first becomes visible', () => {
    doc = fakeDoc('hidden');
    make().start();
    expect(sent).toEqual([]);
    doc.set('visible');
    expect(sent.map((s) => s.body.ev)).toEqual(['open']);
  });
  it('never reports more than 10 minutes in one ping (a device asleep while "visible")', () => {
    const t = make();
    t.start();
    clock += 3 * 60 * MIN;
    t.tick();
    clock += BEAT_MS;
    t.tick();
    expect(sent.map((s) => s.body.min)).toEqual([0, 10, 5]);
  });
});

describe('telemetry: device id', () => {
  it('is made once with the random source and persisted in kh:device', () => {
    const id = getDeviceId({ storage });
    expect(id).toMatch(/^[A-Z2-7]{16}$/);
    expect(storage.map.get(DEVICE_KEY)).toBe(id);
    expect(getDeviceId({ storage })).toBe(id);
    expect(deviceCode({ storage })).toBe(id.slice(0, 4));
  });
  it('replaces a malformed stored id', () => {
    storage = fakeStorage({ [DEVICE_KEY]: 'hello' });
    const id = getDeviceId({ storage, rand: (b) => b.fill(1) });
    expect(id).toBe('B'.repeat(16));
    expect(storage.map.get(DEVICE_KEY)).toBe(id);
  });
  it('maps each random byte to a base32 symbol', () => {
    expect(newDeviceId((b) => b.forEach((_, i) => (b[i] = i * 2 + 32)))).toBe('ACEGIKMOQSUWY246');
  });
  it('survives storage that throws', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(getDeviceId({ storage: bad })).toMatch(/^[A-Z2-7]{16}$/);
    expect(() => setTelemetryOff(true, bad)).not.toThrow();
    expect(isTelemetryOff(bad)).toBe(false);
  });
});

describe('endpoint URLs', () => {
  it('pingUrl joins /ping onto the origin', () => {
    expect(pingUrl(URL_)).toBe(URL_ + '/ping');
    expect(pingUrl(URL_ + '/')).toBe(URL_ + '/ping');
    expect(pingUrl('javascript:alert(1)')).toBe('');
  });
  it('statsOrigin (the build-time CSP value) takes only https origins, or http on localhost', () => {
    expect(statsOrigin('')).toBe('');
    expect(statsOrigin(undefined)).toBe('');
    expect(statsOrigin(URL_)).toBe(URL_);
    expect(statsOrigin(URL_ + '/')).toBe(URL_);
    expect(statsOrigin('http://localhost:8787')).toBe('http://localhost:8787');
    for (const bad of ['http://example.com', URL_ + '/ping', URL_ + '?x=1', 'nope', "https://a.dev; script-src *"]) expect(() => statsOrigin(bad)).toThrow();
  });
});
