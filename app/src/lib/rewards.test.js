import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyStreak, currentStreak, prevDay, localDay, nextSticker, emptyRewards, practiceRewards,
  awardSticker, onPracticeComplete, onMockComplete, onGameComplete, getRewards, streakDays,
} from './rewards.js';
import { STICKER_COUNT } from '../config.js';

// Local-time dates (the streak is counted in the device's calendar, never UTC).
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
let pid = 0;
const freshProfile = () => ({ id: 'test-' + ++pid });

describe('local calendar days', () => {
  it('formats the local date, not UTC', () => {
    expect(localDay(at(2026, 11, 14, 0))).toBe('2026-11-14'); // just after local midnight
    expect(localDay(at(2026, 11, 14, 23))).toBe('2026-11-14');
  });
  it('steps back across month, year and DST boundaries', () => {
    expect(prevDay('2026-12-01')).toBe('2026-11-30');
    expect(prevDay('2027-01-01')).toBe('2026-12-31');
    expect(prevDay('2026-03-01')).toBe('2026-02-28');
    expect(prevDay('2026-03-28')).toBe('2026-03-27'); // Israel DST starts late March
    expect(prevDay('2026-10-26')).toBe('2026-10-25'); // and ends late October
  });
});

describe('streak', () => {
  it('counts consecutive days and pays 2/4/6 once each', () => {
    let s = null;
    const got = [];
    for (let d = 1; d <= 8; d++) {
      const r = applyStreak(s, `2026-11-${String(d).padStart(2, '0')}`);
      s = r.streak;
      got.push(r.milestone);
    }
    expect(s.days).toBe(8);
    expect(got).toEqual([null, 2, null, 4, null, 6, null, null]);
  });
  it('a second activity on the same day changes nothing', () => {
    const a = applyStreak(null, '2026-11-14').streak;
    const b = applyStreak(a, '2026-11-15');
    expect(b.milestone).toBe(2);
    const c = applyStreak(b.streak, '2026-11-15');
    expect(c.milestone).toBe(null);
    expect(c.streak.days).toBe(2);
  });
  it('a missed day restarts the run, and milestones can be earned again', () => {
    let s = applyStreak(null, '2026-11-10').streak;
    s = applyStreak(s, '2026-11-11').streak; // 2 → paid
    const r = applyStreak(s, '2026-11-13'); // skipped the 12th
    expect(r.streak.days).toBe(1);
    expect(r.streak.hit).toEqual([]);
    expect(applyStreak(r.streak, '2026-11-14').milestone).toBe(2);
  });
  it('shows yesterday’s run until today ends, then 0', () => {
    const s = { last: '2026-11-14', days: 3, hit: [2] };
    expect(currentStreak(s, '2026-11-14')).toBe(3);
    expect(currentStreak(s, '2026-11-15')).toBe(3);
    expect(currentStreak(s, '2026-11-16')).toBe(0);
    expect(currentStreak(null, '2026-11-16')).toBe(0);
  });
});

describe('sticker rules', () => {
  it('stickers come in album order and stop when the album is full', () => {
    expect(nextSticker({})).toBe(1);
    expect(nextSticker({ 1: {}, 2: {}, 4: {} })).toBe(3);
    const full = Object.fromEntries(Array.from({ length: STICKER_COUNT }, (_, i) => [i + 1, {}]));
    expect(nextSticker(full)).toBe(null);
  });
  it('3 stars earns a sticker; 1–2 stars does not', () => {
    const r = emptyRewards();
    r.streak = { last: '2026-11-14', days: 1, hit: [] };
    const now = at(2026, 11, 14);
    expect(practiceRewards(r, { rating: 2 }, now)).toEqual([]);
    expect(practiceRewards(r, { rating: 3 }, now).map((s) => s.reason)).toEqual(['three-stars']);
  });
  it('every 5th session earns a sticker, whatever the stars', () => {
    const r = emptyRewards();
    r.streak = { last: '2026-11-14', days: 1, hit: [] };
    const now = at(2026, 11, 14);
    const reasons = [];
    for (let i = 0; i < 10; i++) reasons.push(practiceRewards(r, { rating: 1 }, now).map((s) => s.reason));
    expect(reasons.map((x) => x.join())).toEqual(['', '', '', '', 'five-sessions', '', '', '', '', 'five-sessions']);
  });
  it('a 3-star 5th session on a streak day earns three stickers', () => {
    const r = emptyRewards();
    r.sessions = 4;
    r.streak = { last: '2026-11-13', days: 1, hit: [] };
    const got = practiceRewards(r, { rating: 3 }, at(2026, 11, 14));
    expect(got.map((s) => s.reason)).toEqual(['three-stars', 'five-sessions', 'streak']);
    expect(got.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(got[2].days).toBe(2);
    expect(r.unseen).toEqual([1, 2, 3]);
  });
});

describe('storage-backed API', () => {
  let p;
  beforeEach(() => (p = freshProfile()));
  it('awardSticker accepts a profile object or an id', () => {
    expect(awardSticker(p, 'mock')).toMatchObject({ n: 1, reason: 'mock' });
    expect(awardSticker(p.id, 'mock')).toMatchObject({ n: 2, reason: 'mock' });
    expect(Object.keys(getRewards(p).stickers)).toEqual(['1', '2']);
  });
  it('onMockComplete gives the mock sticker and counts the day', () => {
    onPracticeComplete(p, { rating: 1 }, at(2026, 11, 13));
    const got = onMockComplete(p, at(2026, 11, 14));
    expect(got.map((s) => s.reason)).toEqual(['mock', 'streak']);
    expect(streakDays(p, at(2026, 11, 14))).toBe(2);
  });
  it('games keep a personal best and count toward the streak', () => {
    const a = onGameComplete(p, 'race', 7, at(2026, 11, 14));
    expect(a).toMatchObject({ best: 7, prevBest: 0, record: true, stickers: [] });
    const b = onGameComplete(p, 'race', 5, at(2026, 11, 15));
    expect(b.record).toBe(false);
    expect(b.best).toBe(7);
    expect(b.stickers.map((s) => s.reason)).toEqual(['streak']);
    expect(getRewards(p).games.race).toEqual({ best: 7, plays: 2 });
  });
});
