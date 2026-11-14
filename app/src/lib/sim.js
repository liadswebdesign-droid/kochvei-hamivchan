// Test-simulation ("מבחן דמה"): assembling a booklet from the content banks, laying it out as pages, and scoring it.
// Everything here is pure (no storage, no fetch) so it can be tested: the fixed simulations #1–#6 are a deterministic
// function of the content, and a `def` (the plan: ids only) can be pinned on the device by simStore.js so a simulation
// stays the same when new passages arrive later.
import { rng } from '../gen/rng.js';
import { itemFromId, pictureRiddle, digitRiddle, exercise, missing, inequality, checkInequality } from '../gen/index.js';
import { passageQ, wpItem, prItem } from './session.js';

export const FIXED_SIM_COUNT = 6;
export const ENDLESS = 'endless';
export const TIME_LIMIT_MS = 45 * 60 * 1000; // one lesson
export const DIGIT_SIM = 4; // the one of #1–#6 whose task D has a triangle-digit item
export const TASKS = ['reading', 'A', 'B', 'C', 'D'];
export const taskPart = (task) => (task === 'reading' ? 1 : 2);

// Task D picture-riddle levels per simulation (1 = easy). 'digit' = the triangle-digit item.
const D_LEVELS = [[1, 1, 2], [1, 2, 2], [1, 2, 3], [1, 2, 'digit'], [2, 2, 3], [2, 3, 3]];

export const simId = (n) => (n === ENDLESS ? ENDLESS : `sim-${n}`);
export const simNumber = (id) => (id === ENDLESS ? ENDLESS : Number(String(id).replace('sim-', '')));

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const inRange = (x) => x.level >= 2 && x.level <= 3;

// ---- picking -----------------------------------------------------------------
// Passages of one kind, best first: level 2–3 ascending (so #1 is the gentlest), then anything else.
export function rankPassages(passages, kind) {
  const of = passages.filter((p) => p.kind === kind);
  const good = of.filter(inRange).sort((a, b) => a.level - b.level || byId(a, b));
  const rest = of.filter((p) => !inRange(p)).sort((a, b) => b.level - a.level || byId(a, b));
  return [...good, ...rest].map((p) => p.id);
}

// Smallest seed at or after `base` for which make(level, seed) satisfies `ok` and has an unused signature.
function findSeed(make, level, base, ok, sigs) {
  for (let k = 0; k < 5000; k++) {
    const seed = base + k * 7919;
    const it = make(level, seed);
    if (ok(it) && !sigs.has(it.sig)) {
      sigs.add(it.sig);
      return it.id;
    }
  }
  throw new Error('sim: no generated item found');
}
const opOf = (it) => (it.kind === 'inequality' ? it.left[1] : it.expr[1]);

// Fill `k` word problems: unused ones first, different topics inside one simulation when possible.
function pickWordProblems(pool, used, k, r) {
  const out = [];
  const topics = new Set();
  let reused = false;
  const take = (ok) => {
    for (const w of pool) {
      if (out.length >= k) return;
      if (out.includes(w.id) || !ok(w)) continue;
      out.push(w.id);
      topics.add(w.topic);
    }
  };
  take((w) => !used.has(w.id) && !topics.has(w.topic));
  take((w) => !used.has(w.id));
  if (out.length < k) {
    reused = true;
    take((w) => !topics.has(w.topic));
    take(() => true);
  }
  out.forEach((id) => used.add(id));
  return { ids: out, reused };
}

function pickRiddle(bank, used, level, r) {
  const pool = r.shuffle(bank.filter((x) => x.level === level).sort(byId));
  const hit = pool.find((x) => !used.has(x.id));
  if (hit) {
    used.add(hit.id);
    return hit.id;
  }
  return null; // bank exhausted at this level → a generated riddle
}

// The plan for ONE simulation. `ctx` carries what must not repeat across simulations (fixed sims only).
function planOne(n, content, ctx, r, endlessSeed) {
  const random = endlessSeed != null;
  const seedBase = random ? 100000 + (endlessSeed % 800000) : 9100 + n * 131;
  let short = false;

  // Reading: one informational + one story passage.
  const rankInf = rankPassages(content.passages, 'informational');
  const rankStory = rankPassages(content.passages, 'story');
  const pickPassage = (rank) => {
    if (!rank.length) return null;
    if (random) return rank[Math.floor(r.next() * Math.min(rank.length, 12))];
    const free = rank.find((id) => !ctx.passages.has(id));
    if (!free) short = true;
    return free || rank[(n - 1) % rank.length];
  };
  let p1 = pickPassage(rankInf);
  let p2 = pickPassage(rankStory);
  if (!p1 || !p2) {
    short = true; // one kind is missing: fill from the other so there are still two passages when possible
    const other = rankInf.concat(rankStory).filter((id) => id !== p1 && id !== p2);
    if (!p1) p1 = other[0] || p2;
    else if (!p2) p2 = other[0] || null;
  }
  if (p1 && p1 === p2) p2 = null;
  const passageIds = [p1, p2].filter(Boolean);
  passageIds.forEach((id) => ctx.passages.add(id));

  // Task A: + − ×, Task B: three missing numbers + two inequalities (any valid number counts).
  const sigs = new Set();
  const A = [
    findSeed(exercise, 2, seedBase + 1, (it) => opOf(it) === '+', sigs),
    findSeed(exercise, 2, seedBase + 2, (it) => opOf(it) === '−', sigs),
    findSeed(exercise, 3, seedBase + 3, (it) => opOf(it) === '×', sigs),
  ];
  const B = [
    findSeed(missing, 2, seedBase + 4, (it) => opOf(it) === '+', sigs),
    findSeed(missing, 2, seedBase + 5, (it) => opOf(it) === '−', sigs),
    findSeed(missing, 3, seedBase + 6, (it) => opOf(it) === '×', sigs),
  ];
  const ineq = [
    findSeed(inequality, 2, seedBase + 7, (it) => opOf(it) === '+', sigs),
    findSeed(inequality, 2, seedBase + 8, (it) => opOf(it) === '−', sigs),
  ];

  // Task C: three word problems, level 2–3.
  const wpPool = content.wordProblems.filter(inRange).length >= 3 ? content.wordProblems.filter(inRange) : content.wordProblems;
  const wp = pickWordProblems(r.shuffle(wpPool.slice().sort(byId)), ctx.wp, Math.min(3, wpPool.length), r);
  if (wp.reused) short = true;

  // Task D: mostly picture riddles from the bank (generated ones when a level runs dry).
  const levels = random ? (r.chance(1 / FIXED_SIM_COUNT) ? [1, 2, 'digit'] : r.pick(D_LEVELS.filter((l) => !l.includes('digit')))) : D_LEVELS[(n - 1) % D_LEVELS.length];
  const D = levels.map((lv, i) => {
    if (lv === 'digit') return findSeed(digitRiddle, 2, seedBase + 20 + i, () => true, sigs);
    return pickRiddle(content.pictureRiddles, ctx.riddles, lv, r) || findSeed(pictureRiddle, lv, seedBase + 30 + i, () => true, sigs);
  });

  return { v: 1, n: random ? ENDLESS : n, seed: random ? endlessSeed : undefined, passageIds, A, B, ineq, C: wp.ids, D, short };
}

// The six fixed plans, deterministic in the content (and independent of the order the content arrived in).
export function planFixed(content) {
  const ctx = { passages: new Set(), wp: new Set(), riddles: new Set() };
  const r = rng(20261130);
  return Array.from({ length: FIXED_SIM_COUNT }, (_, i) => planOne(i + 1, content, ctx, r));
}
export const planSim = (n, content) => planFixed(content)[n - 1];

// A random simulation. Same seed → same simulation (used to resume an interrupted one).
export function planEndless(content, seed) {
  return planOne(ENDLESS, content, { passages: new Set(), wp: new Set(), riddles: new Set() }, rng(seed), seed);
}

// A pinned plan is still usable when every id it names exists.
export function defValid(def, content) {
  if (!def || def.v !== 1) return false;
  const has = (list, id) => list.some((x) => x.id === id);
  return (
    def.passageIds.every((id) => has(content.passages, id)) &&
    def.C.every((id) => has(content.wordProblems, id)) &&
    def.D.every((id) => id.startsWith('g:') || has(content.pictureRiddles, id))
  );
}

// ---- resolving a plan to items --------------------------------------------------
function resolveId(id, content) {
  const gen = itemFromId(id);
  if (gen) return gen;
  const w = content.wordProblems.find((x) => x.id === id);
  if (w) return wpItem(w);
  const r = content.pictureRiddles.find((x) => x.id === id);
  if (r) return prItem(r);
  throw new Error('sim: unknown item ' + id);
}
const tag = (items, task, from = 1) => items.map((it, i) => ({ ...it, task, part: taskPart(task), no: from + i }));

// Groups of up to `size`; a lone last item joins the previous page when `merge` is set (5 questions → 2 + 3).
export function chunk(arr, size, merge = false) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  if (merge && out.length > 1 && out[out.length - 1].length === 1) out[out.length - 2].push(...out.pop());
  return out;
}

// The booklet as a list of pages. `part` drives paging rules: you may page back only inside the same part, so after
// the "stop" page Part 1 is closed (as in the real test).
//   cover → [example, passage, questions…] ×2 → stop → [example, items…] for tasks A–D → end
//
// Every page has a stable `key` (it does not depend on how the questions were paged), so the app can find "the same
// place" again after re-paging. Item pages belong to a `run` (the questions of one passage, or of one task) with a
// preferred grouping `per` / `merge` (the chunk rule); this layout is that ESTIMATE. The app then re-pages each run by
// MEASURING with paginate() below, because how much fits depends on the screen and on the real text.
export function layoutSim(def, content, passages) {
  const items = [];
  const pages = [{ key: 'cover', type: 'cover', part: 0 }];
  const add = (p) => pages.push({ key: p.type === 'items' ? itemsKey(p.items) : [p.type, p.task, p.passage && p.passage.id].filter(Boolean).join('-'), ...p });
  const addRun = (base, list, per, merge) => chunk(list, per, merge).forEach((group, gi) => add({ ...base, type: 'items', items: group, first: gi === 0, per, merge }));
  add({ type: 'example', task: 'reading', part: 1 });
  passages.forEach((p, pi) => {
    const qs = tag(p.questions.map((q) => passageQ(p, q)), 'reading');
    items.push(...qs);
    add({ type: 'passage', part: 1, passage: p, first: pi === 0, story: p.kind === 'story' });
    addRun({ task: 'reading', part: 1, run: 'reading:' + p.id, passageId: p.id, ctxTitle: p.title }, qs, 2, true);
  });
  add({ type: 'stop', part: 1 });

  const A = tag(def.A.map((id) => resolveId(id, content)), 'A');
  const B = tag(def.B.map((id) => resolveId(id, content)), 'B');
  const Q = tag(def.ineq.map((id) => resolveId(id, content)), 'B', B.length + 1);
  const C = tag(def.C.map((id) => resolveId(id, content)), 'C');
  const D = tag(def.D.map((id) => resolveId(id, content)), 'D');
  items.push(...A, ...B, ...Q, ...C, ...D);

  add({ type: 'example', task: 'A', part: 2 });
  addRun({ task: 'A', part: 2, run: 'A' }, A, Math.max(1, A.length));
  add({ type: 'example', task: 'B', part: 2 });
  addRun({ task: 'B', part: 2, run: 'B' }, B, Math.max(1, B.length));
  // the inequalities have their own instruction, so they are their own run (never `first`)
  if (Q.length) chunk(Q, Q.length).forEach((g) => add({ type: 'items', task: 'B', part: 2, items: g, first: false, ineq: true, run: 'B:ineq', per: Q.length }));
  add({ type: 'example', task: 'C', part: 2 });
  addRun({ task: 'C', part: 2, run: 'C' }, C, 2);
  add({ type: 'example', task: 'D', part: 2 });
  addRun({ task: 'D', part: 2, run: 'D' }, D, 1);
  add({ type: 'end', part: 2 });

  number(pages);
  return { id: simId(def.n), n: def.n, endless: def.n === ENDLESS, seed: def.seed, def, pages, items, total: items.length };
}

const itemsKey = (items) => 'items-' + items[0].id;

// printed page numbers: the cover is not numbered
function number(pages) {
  let no = 0;
  pages.forEach((p) => {
    if (p.type !== 'cover') p.pageNo = ++no;
  });
  return pages;
}

// Re-page the booklet by measurement. `fits(page)` renders a candidate page in the real page box and says whether its
// content fits without scrolling (the app does this in a hidden copy of the exam screen, per orientation).
// Each run is rebuilt from its questions: a page takes the preferred number (the chunk rule) and hands trailing
// questions on to the next page until it fits. A question is never split; if one question alone is taller than the
// page, that page gets `scroll: true` (it scrolls vertically instead of clipping). With `fits = () => true` this gives
// back exactly the estimated layout. Other pages are kept as they are.
// `cols` (a wide landscape page): a page whose questions do not fit stacked may be tried as an open-booklet spread,
// `cols: true`, the questions in two columns side by side (the first half in the right-hand column, RTL). For each
// count it tries stacked first, then the spread, and only then hands a question on — so a spread is used only where
// it keeps more questions on a page than stacking would.
export function paginate(pages, fits, { cols = false } = {}) {
  const out = [];
  for (let i = 0; i < pages.length; ) {
    const p = pages[i];
    if (p.type !== 'items' || !p.run) {
      out.push({ ...p });
      i += 1;
      continue;
    }
    let j = i;
    let rest = [];
    while (j < pages.length && pages[j].type === 'items' && pages[j].run === p.run) rest = rest.concat(pages[j++].items);
    const per = p.per || 2;
    let first = p.first;
    while (rest.length) {
      const make = (n, spread) => ({ ...p, key: itemsKey(rest), items: rest.slice(0, n), first, scroll: false, ...(spread ? { cols: true } : {}) });
      let page = null;
      for (let n = chunk(rest, per, p.merge)[0].length; n >= 1 && !page; n--) {
        if (fits(make(n))) page = make(n);
        else if (cols && n > 1 && fits(make(n, true))) page = make(n, true);
      }
      if (!page) page = { ...make(1), scroll: true };
      out.push(page);
      rest = rest.slice(page.items.length);
      first = false;
    }
    i = j;
  }
  return number(out);
}

// Where the child is, as something that survives re-paging: on an item page, the first of `ids` (the item she last
// touched, the one with the pencil…) that is on the page, else the page's first item; on other pages, the page's own
// key. pageFor() finds that place in a (re-paged) list; -1 when it is not there.
export function placeOf(page, ...ids) {
  if (!page) return null;
  if (page.type === 'items') return { item: ids.find((id) => id && page.items.some((it) => it.id === id)) || page.items[0].id };
  return { key: page.key };
}
export function pageFor(pages, place) {
  if (!place) return -1;
  if (place.item) return pages.findIndex((p) => p.type === 'items' && p.items.some((it) => it.id === place.item));
  return pages.findIndex((p) => p.key === place.key);
}

// Load the passages a plan names and lay the booklet out.
export async function loadSim(def, content, loadPassage) {
  const passages = await Promise.all(def.passageIds.map(loadPassage));
  return layoutSim(def, content, passages);
}

// ---- paging rules ------------------------------------------------------------------
export const canGoBack = (pages, idx) => idx > 0 && pages[idx - 1].part === pages[idx].part;
export const itemPages = (pages) => pages.filter((p) => p.type === 'items');

// ---- scoring -------------------------------------------------------------------------
// One point for the one correct answer. A missing answer or several marks = 0. Mirror/reversed digits (61 for 16)
// are simply a different number. Inequalities accept ANY whole number that makes the statement true.
export function isCorrect(item, answer) {
  if (answer == null || Array.isArray(answer)) return false;
  if (item.kind === 'mc') return Number.isInteger(answer) && answer === item.answer;
  const s = String(answer).trim();
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return item.kind === 'inequality' ? checkInequality(item, n) : n === item.answer;
}
export const isAnswered = (answer) => answer != null && answer !== '' && !(Array.isArray(answer) && !answer.length);

export function scoreSim(sim, answers) {
  const byTask = Object.fromEntries(TASKS.map((k) => [k, { score: 0, max: 0 }]));
  const results = sim.items.map((item) => {
    const answer = answers[item.id];
    const correct = isCorrect(item, answer);
    byTask[item.task].max += 1;
    if (correct) byTask[item.task].score += 1;
    return { id: item.id, task: item.task, item, answer: isAnswered(answer) ? answer : null, correct, answered: isAnswered(answer) };
  });
  const sum = (tasks) => tasks.reduce((a, k) => ({ score: a.score + byTask[k].score, max: a.max + byTask[k].max }), { score: 0, max: 0 });
  return {
    ...sum(TASKS),
    byTask,
    byPart: { 1: sum(TASKS.filter((k) => taskPart(k) === 1)), 2: sum(TASKS.filter((k) => taskPart(k) === 2)) },
    results,
    mistakes: results.filter((x) => !x.correct),
  };
}

// The compact history record kept per profile.
export function historyEntry(sim, scored, { mode, ms, t = Date.now() }) {
  return {
    sim: sim.id,
    t,
    mode,
    score: scored.score,
    max: scored.max,
    tasks: Object.fromEntries(TASKS.map((k) => [k, [scored.byTask[k].score, scored.byTask[k].max]])),
    ms,
    minutes: Math.round(ms / 6000) / 10,
    over: mode === 'timed' && ms > TIME_LIMIT_MS,
  };
}

// Text of an answer for the review ("your answer / the right answer").
export function answerText(item, answer, labelOf) {
  if (answer == null || answer === '') return null;
  if (item.kind === 'mc') return { label: labelOf(answer + 1), text: String(item.options[answer]) };
  return { text: String(answer) };
}
export function correctText(item, labelOf) {
  if (item.kind === 'mc') return { label: labelOf(item.answer + 1), text: String(item.options[item.answer]) };
  if (item.kind === 'inequality') return { text: String(item.example) };
  return { text: String(item.answer) };
}
