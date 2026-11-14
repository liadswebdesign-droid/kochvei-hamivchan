import { describe, it, expect } from 'vitest';
import {
  save, getProfiles, getReview, getLog, logAttempt, getProgress, skillState, getSettings, getRewardsRaw, withDefaults,
} from './storage.js';
import { getRewards } from './rewards.js';
import { getSims, getRun, bestScores, currentDefs } from './simStore.js';

// Valid JSON of the wrong shape (a hand-edited or half-migrated key) must fall back to defaults, never crash.
const WRONG = [{}, [], 'x', 7, true, null];

describe('storage shape guards', () => {
  it('profiles: a non-list or junk entries read as no profiles', () => {
    for (const bad of WRONG) {
      save('profiles', bad);
      expect(getProfiles()).toEqual([]);
    }
    save('profiles', [null, 3, 'p', [], { name: 'no id' }, { id: 'p1', name: 'דנה', companion: 'fox' }, { id: 'p2', name: 5 }]);
    expect(getProfiles().map((p) => [p.id, p.name])).toEqual([['p1', 'דנה'], ['p2', '']]);
  });
  it('review, log, sims: lists of objects; anything else is dropped', () => {
    for (const bad of WRONG) {
      save('p:x:review', bad);
      save('p:x:log', bad);
      save('p:x:sims', bad);
      expect(getReview('x')).toEqual([]);
      expect(getLog('x')).toEqual([]);
      expect(getSims('x')).toEqual([]);
      expect(bestScores('x')).toEqual({});
    }
    save('p:x:log', { 0: 'not a list' });
    logAttempt('x', { skill: 'missing', id: 'a', correct: true });
    expect(getLog('x')).toHaveLength(1);
    save('p:x:review', [null, { id: 'r', skill: 'missing', due: 1, box: 0 }]);
    expect(getReview('x')).toEqual([{ id: 'r', skill: 'missing', due: 1, box: 0 }]);
  });
  it('progress, settings, rewards, run: objects merged over defaults by field kind', () => {
    for (const bad of WRONG) {
      save('p:x:progress', bad);
      save('p:x:settings', bad);
      save('p:x:rewards', bad);
      save('p:x:simrun', bad);
      expect(getProgress('x')).toEqual({ stars: 0, skills: {} });
      expect(skillState(getProgress('x'), 'missing')).toEqual({ level: 1, best: 0, sessions: 0 });
      expect(getSettings('x')).toEqual({ sound: true, timeMode: 'timed', dailyGoal: 3 });
      expect(getRewardsRaw('x')).toEqual(bad === WRONG[0] ? {} : null); // {} is a (blank) object: fine
      expect(getRewards('x').stickers).toEqual({});
      expect(getRun('x')).toBe(null);
    }
    save('p:x:progress', { stars: '9', skills: { missing: 4, exercises: { level: 3, best: 2, sessions: 7, readingDone: 1 } } });
    const p = getProgress('x');
    expect(p.stars).toBe(0);
    expect(skillState(p, 'missing')).toEqual({ level: 1, best: 0, sessions: 0 });
    expect(skillState(p, 'exercises')).toEqual({ level: 3, best: 2, sessions: 7, readingDone: 1 });
    save('p:x:settings', { sound: false, dailyGoal: 'lots' });
    expect(getSettings('x')).toEqual({ sound: false, timeMode: 'timed', dailyGoal: 3 });
    save('p:x:simrun', { simId: 'sim-2', answers: {} });
    expect(getRun('x')).toEqual({ simId: 'sim-2', answers: {} });
    save('p:x:rewards', { stickers: null, unseen: {}, gold: 2, starsSeen: 14 });
    expect(getRewards('x')).toMatchObject({ stickers: {}, unseen: [], gold: 2, starsSeen: 14 });
  });
  it('withDefaults keeps unknown fields and fields the default leaves null', () => {
    expect(withDefaults({ a: 1, b: null }, { a: 'x', b: 'y', c: [1] })).toEqual({ a: 1, b: 'y', c: [1] });
  });
  it('pinned simulation plans of the wrong shape are replaced', () => {
    const content = { passages: [], wordProblems: [], pictureRiddles: [] };
    for (const bad of [[], 'x', null, { 1: { v: 1, passageIds: 'nope', C: [], D: [] } }]) {
      save('sim-defs', bad);
      expect(() => currentDefs(content)).not.toThrow();
    }
  });
});
