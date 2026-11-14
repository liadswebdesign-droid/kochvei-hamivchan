import { describe, it, expect, beforeEach } from 'vitest';
import { accuracy, bucketOf, minutesPerDay, sessionsOn, recentMistakes, withTrend, describeItem, passageOf } from './stats.js';
import { hashPin, setPin, checkPin, hasPin, makeGate, resetProfileData, deleteProfile } from './parentData.js';
import {
  createProfile, getProfiles, getActiveId, logAttempt, getLog, saveProgress, getProgress, saveReview, getReview,
  getSettings, saveSettings, isSoundOn, save, load, countFinishedSession,
} from './storage.js';
import { awardSticker, getRewards } from './rewards.js';
import { addSim, getSims, bestScores, getRun, saveRun, clearRun, currentDefs } from './simStore.js';
import { historyEntry } from './sim.js';

const DAY = 86400000;
const NOW = new Date(2026, 10, 20, 15, 0, 0).getTime();

describe('accuracy buckets', () => {
  it('mini-game taps (T5, tagged game) count as time but not as accuracy or mistakes', () => {
    const now = NOW;
    const log = [
      { t: now - 60000, skill: 'reading', id: 'game:detective:inf-05:3', game: 'detective', correct: false, ms: 30000 },
      { t: now - 50000, skill: 'missing', id: 'g:iq:2:77', game: 'catch', correct: false, ms: 30000 },
      { t: now - 40000, skill: 'exercises', id: 'g:ex:2:5', correct: false, ms: 30000 },
    ];
    expect(accuracy(log, {}).map((a) => a.key)).toEqual(['exercises']);
    expect(recentMistakes(log, 20).map((e) => e.id)).toEqual(['g:ex:2:5']);
    expect(sessionsOn(log, [], now)).toBe(1);
    expect(minutesPerDay(log, [], 14, now).at(-1).minutes).toBe(2); // 90 s of play, games included
  });
  it('splits reading by question type and missing-number from inequalities', () => {
    const log = [
      { skill: 'reading', id: 'inf-01-q1', correct: true, type: 'detail' },
      { skill: 'reading', id: 'inf-01-q2', correct: false },          // no type in the log line: looked up
      { skill: 'reading', id: 'inf-01-q3', correct: false },          // not found anywhere
      { skill: 'missing', id: 'g:mn:2:5', correct: true },
      { skill: 'missing', id: 'g:iq:2:9', correct: false },
      { skill: 'exercises', id: 'g:ex:2:1', correct: true },
      { skill: 'riddles', id: 'pr-01', correct: true },
    ];
    const rows = accuracy(log, { 'inf-01-q2': 'why' });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by['reading:detail']).toMatchObject({ correct: 1, total: 1, pct: 100 });
    expect(by['reading:why']).toMatchObject({ correct: 0, total: 1, pct: 0 });
    expect(by['reading:other'].total).toBe(1);
    expect(by.missing.pct).toBe(100);
    expect(by.inequality.pct).toBe(0);
    expect(rows.map((r) => r.key).slice(0, 4)).toEqual(['exercises', 'missing', 'inequality', 'riddles']);
    expect(bucketOf({ skill: 'bonus', id: 'x' })).toBe('bonus');
    expect(passageOf('story-05-q3')).toBe('story-05');
  });
});

describe('minutes per day', () => {
  it('covers 14 days oldest first, caps idle time, and counts simulations by their duration', () => {
    const log = [
      { t: NOW, ms: 60000 }, { t: NOW - 1000, ms: 30 * 60000 },       // second one is capped to 2 min
      { t: NOW - 3 * DAY, ms: 120000 },
      { t: NOW - 20 * DAY, ms: 60000 },                                // outside the window
      { t: NOW, ms: 0, sim: 'sim-1' },                                 // sim log lines carry no time
    ];
    const sims = [{ t: NOW - DAY, ms: 40 * 60000 }];
    const d = minutesPerDay(log, sims, 14, NOW);
    expect(d).toHaveLength(14);
    expect(d[13].minutes).toBe(3);
    expect(d[12].minutes).toBe(40);
    expect(d[10].minutes).toBe(2);
    expect(d[0].minutes).toBe(0);
    expect(d[0].date < d[13].date).toBe(true);
  });
  it('estimates sessions today by 15 minute gaps', () => {
    const log = [{ t: NOW }, { t: NOW + 60000 }, { t: NOW + 3600000 }, { t: NOW - DAY }];
    expect(sessionsOn(log, [{ t: NOW }], NOW + 7200000)).toBe(3);
  });
  it('counts the sessions FINISHED today from progress.days, plus simulations; old data falls back to the estimate', () => {
    const log = [{ t: NOW }, { t: NOW + 60000 }, { t: NOW + 3600000 }]; // the gap estimate would say 2
    const p = { stars: 0, skills: {} };
    countFinishedSession(p, new Date(NOW - DAY));
    countFinishedSession(p, new Date(NOW));
    countFinishedSession(p, new Date(NOW + 3600000));
    expect(sessionsOn(log, [{ t: NOW }], NOW + 7200000, p.days)).toBe(3); // 2 finished today + 1 simulation
    expect(sessionsOn(log, [], NOW + DAY, p.days)).toBe(0); // the next day starts at 0
    expect(sessionsOn(log, [], NOW + 7200000, undefined)).toBe(2); // no record yet: the gap estimate
  });
  it('keeps the finished-session record to the last 31 days, through a saved progress', () => {
    const p = getProgress('pdays');
    expect(p.days).toBeUndefined(); // the empty progress shape is unchanged
    for (let i = 40; i >= 0; i--) countFinishedSession(p, new Date(NOW - i * DAY));
    saveProgress('pdays', p);
    const keys = Object.keys(getProgress('pdays').days);
    expect(keys).toHaveLength(31);
    expect(keys.at(-1)).toBe('2026-11-20');
  });
});

describe('mistakes and trend', () => {
  it('lists the 20 most recent first-try mistakes, one per item, newest first', () => {
    const log = [];
    for (let i = 0; i < 30; i++) log.push({ id: 'a' + i, correct: false, t: i });
    log.push({ id: 'a29', correct: false, t: 99 }, { id: 'ok', correct: true, t: 100 });
    const r = recentMistakes(log, 20);
    expect(r).toHaveLength(20);
    expect(r[0].id).toBe('a29');
    expect(new Set(r.map((x) => x.id)).size).toBe(20);
  });
  it('trend compares with the previous simulation', () => {
    const t = withTrend([{ score: 10, max: 24 }, { score: 15, max: 24 }, { score: 15, max: 24 }, { score: 9, max: 24 }]).map((x) => x.trend);
    expect(t).toEqual([null, 'up', 'same', 'down']);
  });
  it('describes items of every kind as one line', () => {
    const ctx = { wordProblems: [{ id: 'wp-1', stem: 'שאלה' }], pictureRiddles: [{ id: 'pr-1', rows: [{ terms: ['flower', 'flower'], total: 6 }], ask: 'flower' }], bonus: [], questions: { 'inf-01-q1': 'מה?' } };
    expect(describeItem('wp-1', ctx).text).toBe('שאלה');
    expect(describeItem('pr-1', ctx).text).toContain('=6');
    expect(describeItem('inf-01-q1', ctx).text).toBe('מה?');
    expect(describeItem('g:ex:2:123', ctx).text).toMatch(/^\d+ [+−×] \d+ = __$/);
  });
});

describe('parent data (memory storage)', () => {
  beforeEach(() => {
    for (const p of getProfiles()) deleteProfile(p.id);
  });
  it('PIN: unset, set, check; the stored value is not the PIN', () => {
    expect(hashPin('1234')).not.toBe('1234');
    setPin('4821');
    expect(hasPin()).toBe(true);
    expect(checkPin('4821')).toBe(true);
    expect(checkPin('4822')).toBe(false);
    setPin('1111'); // "forgot" path sets a new one
    expect(checkPin('4821')).toBe(false);
    expect(checkPin('1111')).toBe(true);
  });
  it('PIN: a leading zero is part of the PIN (the PIN pad keeps it)', () => {
    setPin('0123');
    expect(checkPin('0123')).toBe(true);
    expect(checkPin('123')).toBe(false);
    setPin('1111');
  });
  it('the forgot gate is two-digit × two-digit (13-29, no 20) with a three-digit answer', () => {
    for (let i = 0; i < 200; i++) {
      const g = makeGate();
      expect(g.a >= 13 && g.a <= 29 && g.b >= 13 && g.b <= 29 && g.a !== 20 && g.b !== 20).toBe(true);
      expect(g.answer).toBe(g.a * g.b);
      expect(g.answer >= 100 && g.answer <= 999).toBe(true);
    }
  });
  it('settings are one store per profile, with defaults, and merge', () => {
    const a = createProfile('א', 'fox');
    const b = createProfile('ב', 'owl');
    expect(getSettings(a)).toEqual({ timeMode: 'timed', sound: true, dailyGoal: 3 });
    saveSettings(a, { dailyGoal: 5 });
    expect(saveSettings(a, { sound: false })).toEqual({ timeMode: 'timed', sound: false, dailyGoal: 5 });
    expect(getSettings(a)).toEqual({ timeMode: 'timed', sound: false, dailyGoal: 5 });
    expect(isSoundOn(a)).toBe(false); // the parent toggle is what lib/sound.js reads
    expect(isSoundOn(b)).toBe(true);
    expect(getSettings(b).dailyGoal).toBe(3);
  });
  it('the old device-wide kh:settings seeds every profile once and is removed', () => {
    const a = createProfile('א', 'fox');
    const b = createProfile('ב', 'owl');
    saveSettings(b, { dailyGoal: 7 }); // b already has its own: kept as is
    save('settings', { timeMode: 'free', sound: false, dailyGoal: 4 });
    expect(getSettings(a)).toEqual({ timeMode: 'free', sound: false, dailyGoal: 4 });
    expect(getSettings(b)).toEqual({ timeMode: 'timed', sound: true, dailyGoal: 7 });
    expect(load('settings', null)).toBeNull();
    const c = createProfile('ג', 'owl'); // created after the migration: plain defaults
    expect(getSettings(c)).toEqual({ timeMode: 'timed', sound: true, dailyGoal: 3 });
  });
  it('reset removes one profile\'s progress, log, review and simulations but keeps the profile; delete removes it all', () => {
    const a = createProfile('א', 'fox');
    const b = createProfile('ב', 'owl');
    for (const pid of [a, b]) {
      logAttempt(pid, { skill: 'exercises', id: 'g:ex:2:1', correct: true });
      saveProgress(pid, { stars: 7, skills: {} });
      saveReview(pid, [{ id: 'x', skill: 'reading' }]);
      addSim(pid, { sim: 'sim-1', t: 1, score: 3, max: 4, mode: 'free', tasks: {}, ms: 0, minutes: 0 });
      saveRun(pid, { simId: 'sim-1' });
      awardSticker(pid, 'mock');
      saveSettings(pid, { sound: false });
    }
    resetProfileData(a);
    expect(getRewards(a).stickers).toEqual({});
    expect(isSoundOn(a)).toBe(false); // reset keeps the parent's settings
    expect(getLog(a)).toEqual([]);
    expect(getProgress(a).stars).toBe(0);
    expect(getReview(a)).toEqual([]);
    expect(getSims(a)).toEqual([]);
    expect(getRun(a)).toBeNull();
    expect(getProfiles().map((p) => p.id)).toEqual([a, b]);
    expect(getLog(b)).toHaveLength(1);
    expect(getProgress(b).stars).toBe(7);

    deleteProfile(b); // b is the active one: the other becomes active
    expect(getProfiles().map((p) => p.id)).toEqual([a]);
    expect(getLog(b)).toEqual([]);
    expect(isSoundOn(b)).toBe(true); // delete removes the settings too
    expect(getRewards(b).stickers).toEqual({});
    expect(getActiveId()).toBe(a);
    deleteProfile(a);
    expect(getProfiles()).toEqual([]);
    expect(getActiveId()).toBeNull();
  });
});

describe('simulation store', () => {
  it('keeps the best score per simulation and the run in progress', () => {
    const pid = createProfile('ג', 'owl');
    const sim = { id: 'sim-2' };
    addSim(pid, historyEntry(sim, { score: 10, max: 24, byTask: { reading: { score: 5, max: 10 }, A: { score: 1, max: 3 }, B: { score: 2, max: 5 }, C: { score: 1, max: 3 }, D: { score: 1, max: 3 } } }, { mode: 'timed', ms: 60000 }));
    addSim(pid, historyEntry(sim, { score: 19, max: 24, byTask: { reading: { score: 5, max: 10 }, A: { score: 1, max: 3 }, B: { score: 2, max: 5 }, C: { score: 1, max: 3 }, D: { score: 1, max: 3 } } }, { mode: 'free', ms: 60000 }));
    addSim(pid, historyEntry(sim, { score: 12, max: 24, byTask: { reading: { score: 5, max: 10 }, A: { score: 1, max: 3 }, B: { score: 2, max: 5 }, C: { score: 1, max: 3 }, D: { score: 1, max: 3 } } }, { mode: 'free', ms: 60000 }));
    expect(bestScores(pid)['sim-2']).toEqual({ score: 19, max: 24 });
    saveRun(pid, { simId: 'sim-2', pageIdx: 4, answers: { a: 1 } });
    expect(getRun(pid).pageIdx).toBe(4);
    clearRun(pid);
    expect(getRun(pid)).toBeNull();
  });
  it('pins the six plans, then keeps them when new passages arrive; a short plan is replaced once content is enough', () => {
    const mk = (n, kind) => Array.from({ length: n }, (_, i) => ({ id: `${kind[0]}-${i + 1}`, kind, level: 2, title: 't', questions: 5 }));
    const wp = Array.from({ length: 30 }, (_, i) => ({ id: 'wp-' + i, level: 2, topic: 't' + (i % 5), stem: 's', options: [1, 2, 3, 4], answer: 0 }));
    const base = { wordProblems: wp, pictureRiddles: [], bonus: [] };
    const few = { ...base, passages: [...mk(2, 'informational'), ...mk(2, 'story')] };
    const d1 = currentDefs(few);
    expect(d1.map((d) => d.short)).toEqual([false, false, true, true, true, true]); // 2 passages of each kind cover only #1 and #2
    const many = { ...base, passages: [...mk(8, 'informational'), ...mk(8, 'story')] };
    const d2 = currentDefs(many);
    expect(d2.every((d) => !d.short)).toBe(true);
    const more = { ...base, passages: [...mk(12, 'informational'), ...mk(12, 'story')] };
    expect(currentDefs(more)).toEqual(d2); // pinned: a later batch of content does not change #1–#6
  });
});
