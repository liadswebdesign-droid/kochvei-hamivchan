import { describe, it, expect, beforeEach } from 'vitest';
import { setPin, checkPin, makeGate, checkGate, lockAfter, lockedFor } from './parentData.js';
import { remove, save, load } from './storage.js';

const T = new Date(2026, 10, 20, 15, 0, 0).getTime();
const SEC = 1000;
const MIN = 60 * SEC;

describe('parent gate: "forgot" question', () => {
  it('covers the whole 13-29 range except 20, at both ends of random()', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(makeGate(() => i / 1000).a);
    expect([...seen].sort((x, y) => x - y)).toEqual([13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(makeGate(() => 0)).toEqual({ a: 13, b: 13, answer: 169 });
    expect(makeGate(() => 0.9999999)).toEqual({ a: 29, b: 29, answer: 841 });
  });
});

describe('parent gate: lockout', () => {
  beforeEach(() => {
    remove('pin-lock');
    setPin('4821');
  });
  it('schedule: every third wrong answer locks, 30 s, 2 min, then 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 30].map(lockAfter)).toEqual([0, 0, 30 * SEC, 0, 0, 2 * MIN, 0, 0, 10 * MIN, 10 * MIN, 10 * MIN]);
  });
  it('three wrong PINs lock; while locked even the right PIN is refused and not counted; then it opens', () => {
    expect(checkPin('0000', T)).toBe(false);
    expect(checkPin('0000', T)).toBe(false);
    expect(lockedFor(T)).toBe(0);
    expect(checkPin('0000', T)).toBe(false);
    expect(lockedFor(T)).toBe(30 * SEC);
    expect(lockedFor(T + 10 * SEC)).toBe(20 * SEC);
    expect(checkPin('4821', T + 10 * SEC)).toBe(false);
    expect(load('pin-lock', null).fails).toBe(3);
    expect(checkPin('4821', T + 30 * SEC)).toBe(true);
    expect(load('pin-lock', null)).toBe(null); // a right answer clears the count
  });
  it('escalates across rounds, shared by PIN and "forgot" question', () => {
    let now = T;
    for (let i = 0; i < 3; i++) checkPin('0000', now);
    now += 30 * SEC;
    const g = makeGate(() => 0.5);
    checkGate(g, g.answer + 1, now);
    checkPin('1111', now);
    checkGate(makeGate(), -1, now);
    expect(lockedFor(now)).toBe(2 * MIN);
    now += 2 * MIN;
    for (let i = 0; i < 3; i++) checkPin('0000', now);
    expect(lockedFor(now)).toBe(10 * MIN);
    now += 10 * MIN;
    expect(checkGate(g, String(g.answer), now)).toBe(true); // the NumPad hands over a string
    expect(lockedFor(now)).toBe(0);
  });
  it('the lock is read from storage (a reload keeps it); a day without wrong answers forgets the count', () => {
    save('pin-lock', { fails: 5, until: 0, last: T });
    checkPin('0000', T + MIN);
    expect(lockedFor(T + MIN)).toBe(2 * MIN);
    save('pin-lock', { fails: 5, until: 0, last: T });
    checkPin('0000', T + 25 * 60 * MIN);
    expect(lockedFor(T + 25 * 60 * MIN)).toBe(0);
    expect(load('pin-lock', null).fails).toBe(1);
  });
  it('a clock moved back opens the lock; a broken stored value is ignored', () => {
    for (let i = 0; i < 3; i++) checkPin('0000', T);
    expect(lockedFor(T - MIN)).toBe(0);
    for (const bad of [[], 'x', 7, { fails: 'a' }, null]) {
      save('pin-lock', bad);
      expect(lockedFor(T)).toBe(0);
      expect(checkPin('4821', T)).toBe(true);
    }
  });
});
