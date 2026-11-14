// Builds practice sessions per island and applies the light spaced-repetition rules.
import { SESSION_SIZE, MAX_REVIEW_PER_SESSION } from '../config.js';
import { exercise, missing, inequality, pictureRiddle, digitRiddle, itemFromId, solveRiddle } from '../gen/index.js';
import { newSeed } from '../gen/rng.js';
import { loadPassage } from './content.js';
import { getReview, saveReview, getLog } from './storage.js';

const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// ---- content → internal item shapes --------------------------------------------
export const wpItem = (w) => ({ id: w.id, skill: 'wordProblems', kind: 'mc', level: w.level, stem: w.stem, options: w.options, answer: w.answer, explain: w.explain, hintText: w.hint });
export const passageQ = (p, q) => ({ id: q.id, skill: 'reading', kind: 'mc', type: q.type, passageId: p.id, passage: p, stem: q.stem, options: q.options, answer: q.answer, explain: q.explain, lineRef: q.lineRef || [] });
export const prItem = (r) => ({ id: r.id, skill: 'riddles', kind: 'mc', level: r.level, riddle: { rows: r.rows, ask: r.ask }, solution: solveRiddle(r.rows)[0] || null, options: r.options, answer: r.answer, hint: { key: 'hint.riddle' } });
const bonusItem = (b) => ({ id: b.id, skill: 'bonus', kind: 'mc', type: b.type, level: b.level, stem: b.stem, options: b.options, answer: b.answer, explain: b.explain });

// Fill `n` generated items with distinct signatures.
function generate(n, makers, level, taken) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const make = makers[out.length % makers.length];
    const it = make(level, newSeed());
    if (taken.has(it.sig)) continue;
    taken.add(it.sig);
    out.push(it);
  }
  return out;
}

// Items answered correctly on the first try, from the attempt log (used to prefer fresh hand-written items).
function mastered(pid) {
  const s = new Set();
  for (const e of getLog(pid)) if (e.correct && e.tries === 1) s.add(e.id);
  return s;
}

function pickContent(pool, n, level, pid) {
  const done = mastered(pid);
  const score = (x) => (done.has(x.id) ? 2 : 0) + Math.abs((x.level || level) - level) * 0.6 + Math.random() * 0.5;
  return pool.slice().sort((a, b) => score(a) - score(b)).slice(0, n);
}

// Review items due for this skill (resolved to full items). Content ids that no longer exist are dropped.
async function dueReview(pid, skill, sessions, content) {
  const q = getReview(pid).filter((e) => e.skill === skill && e.due <= sessions).slice(0, MAX_REVIEW_PER_SESSION);
  const out = [];
  for (const e of q) {
    let it = itemFromId(e.id);
    if (!it && skill === 'wordProblems') {
      const w = content.wordProblems.find((x) => x.id === e.id);
      it = w && wpItem(w);
    } else if (!it && skill === 'reading' && e.ref) {
      try {
        const p = await loadPassage(e.ref);
        const qq = p.questions.find((x) => x.id === e.id);
        it = qq && passageQ(p, qq);
      } catch {
        it = null;
      }
    } else if (!it && skill === 'riddles') {
      const r = content.pictureRiddles.find((x) => x.id === e.id);
      it = r && prItem(r);
    } else if (!it && skill === 'bonus') {
      const b = content.bonus.find((x) => x.id === e.id);
      it = b && bonusItem(b);
    }
    if (it) out.push({ ...it, review: true });
  }
  return out;
}

export function islandAvailable(skill, content) {
  if (skill === 'mock') return content.passages.length > 0 && content.wordProblems.length > 0;
  if (skill === 'bonus') return content.bonus.length > 0;
  if (skill === 'reading') return content.passages.length > 0;
  if (skill === 'wordProblems') return content.wordProblems.length > 0;
  return true;
}

export async function buildSession({ pid, skill, level, sessions, content, readingDone = [] }) {
  const review = await dueReview(pid, skill, sessions, content);
  const taken = new Set(review.map((r) => r.sig || r.id));
  const room = Math.max(SESSION_SIZE - review.length, 4);
  let fresh = [];

  if (skill === 'exercises') fresh = generate(room, [exercise], level, taken);
  else if (skill === 'missing') {
    const nIneq = Math.round(room * 0.375); // ~3 of 8, like the official task B mix
    fresh = shuffle([...generate(room - nIneq, [missing], level, taken), ...generate(nIneq, [inequality], level, taken)]);
  } else if (skill === 'riddles') {
    const hand = pickContent(content.pictureRiddles.filter((r) => !taken.has(r.id)), Math.floor(room / 4), level, pid).map(prItem);
    const nDigit = Math.round((room - hand.length) * 0.35);
    fresh = shuffle([...hand, ...generate(room - hand.length - nDigit, [pictureRiddle], level, taken), ...generate(nDigit, [digitRiddle], level, taken)]);
  } else if (skill === 'wordProblems') {
    fresh = pickContent(content.wordProblems.filter((w) => !taken.has(w.id)), room, level, pid).map(wpItem);
  } else if (skill === 'bonus') {
    fresh = pickContent(content.bonus.filter((b) => !taken.has(b.id)), room, level, pid).map(bonusItem);
  } else if (skill === 'reading') {
    // One passage per session: prefer passages not read yet, near the current level.
    const list = content.passages.slice().sort((a, b) => {
      const ra = readingDone.includes(a.id) ? 1 : 0;
      const rb = readingDone.includes(b.id) ? 1 : 0;
      return ra - rb || Math.abs(a.level - level) - Math.abs(b.level - level) || Math.random() - 0.5;
    });
    const p = await loadPassage(list[0].id);
    fresh = p.questions.map((q) => passageQ(p, q));
    return { items: [...fresh, ...review.filter((r) => r.passageId !== p.id)], passageId: p.id };
  }
  // Review items are spread through the session rather than bunched at the start.
  const items = fresh.slice();
  review.forEach((r, i) => items.splice(Math.min(items.length, 1 + i * 3), 0, r));
  return { items };
}

// ---- spaced repetition --------------------------------------------------------------
// A miss queues the item for the NEXT session of that skill (box 0). A first-try success on a review item moves it
// up a box; after two such successes it leaves the queue. Due = the skill's session counter value.
export function recordForReview(pid, item, firstTry, sessions) {
  const q = getReview(pid);
  const i = q.findIndex((e) => e.id === item.id);
  if (!firstTry) {
    const e = { id: item.id, skill: item.skill, ref: item.passageId || null, due: sessions + 1, box: 0 };
    if (i >= 0) q[i] = e;
    else q.push(e);
  } else if (i >= 0) {
    const box = q[i].box + 1;
    if (box >= 2) q.splice(i, 1);
    else q[i] = { ...q[i], box, due: sessions + 3 };
  }
  saveReview(pid, q.slice(-200));
}

export const reviewCount = (pid, skill) => getReview(pid).filter((e) => e.skill === skill).length;

export function sessionStars(mistakes) {
  return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
}
