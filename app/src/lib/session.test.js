import { describe, it, expect, vi, beforeEach } from 'vitest';

// Passage files: 'ok' loads, 'gone' is a 404, 'offline' fails like a fetch without network.
vi.mock('./content.js', () => ({
  loadPassage: vi.fn(async (id) => {
    if (id === 'p-ok') return { id: 'p-ok', level: 1, questions: [{ id: 'p-ok-q1', stem: 's', options: ['a', 'b'], answer: 0 }, { id: 'p-ok-q2', stem: 's', options: ['a', 'b'], answer: 1 }] };
    throw new Error(id === 'p-offline' ? 'Failed to fetch' : 'HTTP 404');
  }),
}));

import { buildSession, reviewCount } from './session.js';
import { saveReview, getReview } from './storage.js';

const wp = (id) => ({ id, level: 1, stem: 'q', options: ['1', '2'], answer: 0 });
const content = (over = {}) => ({ wordProblems: [wp('wp-a'), wp('wp-b'), wp('wp-c'), wp('wp-d'), wp('wp-e')], pictureRiddles: [], bonus: [], passages: [], ...over });
const due = (id, skill = 'wordProblems', ref = null) => ({ id, skill, ref, due: 1, box: 0 });

describe('review queue: entries whose question is gone', () => {
  const pid = 'ptest';
  beforeEach(() => saveReview(pid, []));

  it('stale ids neither fill the review slots nor stay in storage', async () => {
    // Three stale ids ahead of a real one: before the fix they took all 3 slots and the real one never came back.
    saveReview(pid, [due('wp-old1'), due('wp-old2'), due('wp-old3'), due('wp-b'), due('g:ex:2:5', 'exercises')]);
    const s = await buildSession({ pid, skill: 'wordProblems', level: 1, sessions: 1, content: content() });
    const review = s.items.filter((x) => x.review);
    expect(review.map((x) => x.id)).toEqual(['wp-b']);
    // Stale entries of THIS skill are dropped; other skills' entries are untouched.
    expect(getReview(pid).map((e) => e.id)).toEqual(['wp-b', 'g:ex:2:5']);
  });

  it('the map badge counts only entries that can still be shown', () => {
    saveReview(pid, [due('wp-old1'), due('wp-b'), due('g:ex:2:5', 'exercises'), due('p-gone-q1', 'reading', 'p-gone'), due('p-ok-q1', 'reading', 'p-ok')]);
    const c = content({ passages: [{ id: 'p-ok', level: 1 }] });
    expect(reviewCount(pid, 'wordProblems', c)).toBe(1);
    expect(reviewCount(pid, 'reading', c)).toBe(1);
    expect(reviewCount(pid, 'exercises', c)).toBe(1);
    expect(reviewCount(pid, 'wordProblems')).toBe(2); // without content: the raw queue, as before
  });

  it('a reading entry whose passage failed to LOAD is kept for later; one whose passage left the content is dropped', async () => {
    saveReview(pid, [due('p-offline-q1', 'reading', 'p-offline'), due('p-gone-q1', 'reading', 'p-gone'), due('p-ok-q9', 'reading', 'p-ok')]);
    const c = content({ passages: [{ id: 'p-ok', level: 1 }, { id: 'p-offline', level: 1 }] });
    const s = await buildSession({ pid, skill: 'reading', level: 1, sessions: 1, content: c });
    expect(s.passageId).toBe('p-ok');
    // p-gone: not in content → dropped. p-ok-q9: passage loads but the question is gone → dropped. p-offline: kept.
    expect(getReview(pid).map((e) => e.id)).toEqual(['p-offline-q1']);
  });
});

describe('reading session: a passage that fails to load', () => {
  const pid = 'ptest2';
  beforeEach(() => saveReview(pid, []));

  it('is skipped for the next passage', async () => {
    const c = content({ passages: [{ id: 'p-gone', level: 1 }, { id: 'p-offline', level: 1 }, { id: 'p-ok', level: 3 }] });
    const s = await buildSession({ pid, skill: 'reading', level: 1, sessions: 1, content: c });
    expect(s.passageId).toBe('p-ok');
    expect(s.items.map((x) => x.id)).toEqual(['p-ok-q1', 'p-ok-q2']);
  });

  it('rejects when no passage loads (Practice then shows its load error, not an endless loader)', async () => {
    const c = content({ passages: [{ id: 'p-gone', level: 1 }, { id: 'p-offline', level: 1 }] });
    await expect(buildSession({ pid, skill: 'reading', level: 1, sessions: 1, content: c })).rejects.toThrow();
  });
});
