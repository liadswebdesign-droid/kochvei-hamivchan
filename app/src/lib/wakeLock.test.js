import { describe, it, expect, vi } from 'vitest';
import { initWakeLock, IDLE_MS } from './wakeLock.js';

function setup({ refuse = false } = {}) {
  let t = 0;
  const timers = [];
  const listeners = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  const sentinels = [];
  const nav = {
    wakeLock: {
      request: vi.fn(async () => {
        if (refuse) throw new Error('NotAllowedError');
        const l = [];
        const s = {
          released: false,
          addEventListener: (ev, fn) => l.push(fn),
          release: vi.fn(async () => { s.released = true; l.forEach((fn) => fn()); }),
        };
        sentinels.push(s);
        return s;
      }),
    },
  };
  const fire = (ev) => (listeners[ev] || []).forEach((fn) => fn());
  const wl = initWakeLock({
    nav, doc, now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms, live: true }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.live = false; },
  });
  const advance = (ms) => { t += ms; timers.filter((h) => h.live && h.at <= t).forEach((h) => { h.live = false; h.fn(); }); };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { wl, nav, doc, fire, advance, flush, sentinels };
}

describe('wakeLock', () => {
  it('does nothing without the API', () => {
    expect(initWakeLock({ nav: {}, doc: {} })).toBe(null);
  });

  it('takes the lock on start', async () => {
    const s = setup();
    await s.flush();
    expect(s.nav.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(s.wl.held).toBe(true);
  });

  it('releases after the idle time and re-takes on the next touch', async () => {
    const s = setup();
    await s.flush();
    s.advance(IDLE_MS);
    await s.flush();
    expect(s.sentinels[0].released).toBe(true);
    expect(s.wl.held).toBe(false);
    s.fire('pointerdown');
    await s.flush();
    expect(s.wl.held).toBe(true);
    expect(s.nav.wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('a touch postpones the idle release', async () => {
    const s = setup();
    await s.flush();
    s.advance(IDLE_MS - 1000);
    s.fire('pointerdown');
    await s.flush();
    s.advance(5000);
    expect(s.wl.held).toBe(true);
    expect(s.nav.wakeLock.request).toHaveBeenCalledTimes(1); // still held, no second request
  });

  it('re-takes the lock when the app becomes visible again', async () => {
    const s = setup();
    await s.flush();
    s.doc.visibilityState = 'hidden';
    await s.sentinels[0].release(); // the browser drops it when hidden
    expect(s.wl.held).toBe(false);
    s.doc.visibilityState = 'visible';
    s.fire('visibilitychange');
    await s.flush();
    expect(s.wl.held).toBe(true);
  });

  it('survives a refused request', async () => {
    const s = setup({ refuse: true });
    await s.flush();
    expect(s.wl.held).toBe(false);
    s.fire('pointerdown');
    await s.flush();
    expect(s.wl.held).toBe(false);
  });
});
