import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  planFixed, planSim, planEndless, layoutSim, scoreSim, isCorrect, canGoBack, chunk, historyEntry, defValid,
  FIXED_SIM_COUNT, DIGIT_SIM, TASKS, rankPassages, ENDLESS, paginate, placeOf, pageFor,
} from './sim.js';
import { itemFromId, checkInequality, solveRiddle } from '../gen/index.js';

const SRC = path.resolve(__dirname, '../../../content/src');
const wordProblems = JSON.parse(fs.readFileSync(path.join(SRC, 'word-problems.json'), 'utf8'));
const pictureRiddles = JSON.parse(fs.readFileSync(path.join(SRC, 'picture-riddles.json'), 'utf8'));

// Synthetic passages shaped like the real ones: 12 informational + 12 stories, levels 1–3, 5–7 questions each.
function makePassage(kind, i) {
  const id = `${kind === 'story' ? 'story' : 'inf'}-${String(i).padStart(2, '0')}`;
  const nq = 5 + (i % 3);
  return {
    id, kind, title: id, level: 1 + (i % 3),
    paragraphs: [['שורה אחת', 'שורה שתיים'], ['שורה שלוש']],
    questions: Array.from({ length: nq }, (_, q) => ({ id: `${id}-q${q + 1}`, type: 'detail', stem: 'שאלה', options: ['א', 'ב', 'ג', 'ד'], answer: q % 4, explain: 'הסבר' })),
  };
}
const full = [...Array.from({ length: 12 }, (_, i) => makePassage('informational', i + 1)), ...Array.from({ length: 12 }, (_, i) => makePassage('story', i + 1))];
const index = full.map((p) => ({ id: p.id, kind: p.kind, title: p.title, level: p.level, questions: p.questions.length }));
const content = { passages: index, wordProblems, pictureRiddles, bonus: [] };
const byPassage = Object.fromEntries(full.map((p) => [p.id, p]));
const build = (def, c = content) => layoutSim(def, c, def.passageIds.map((id) => byPassage[id]));

describe('assembly of the fixed simulations', () => {
  const defs = planFixed(content);

  it('is deterministic: the same content gives the same six plans', () => {
    expect(planFixed(content)).toEqual(defs);
    expect(planFixed({ ...content, passages: index.slice().reverse() })).toEqual(defs); // arrival order is irrelevant
    expect(planSim(3, content)).toEqual(defs[2]);
    expect(defs).toHaveLength(FIXED_SIM_COUNT);
  });

  it('never reuses a passage, word problem or hand-made riddle across #1–#6', () => {
    for (const key of ['passageIds', 'C']) {
      const all = defs.flatMap((d) => d[key]);
      expect(new Set(all).size).toBe(all.length);
    }
    const bank = defs.flatMap((d) => d.D).filter((id) => !id.startsWith('g:'));
    expect(new Set(bank).size).toBe(bank.length);
    expect(defs.every((d) => !d.short)).toBe(true);
  });

  it('each simulation has one informational and one story passage at level 2-3', () => {
    for (const d of defs) {
      expect(d.passageIds).toHaveLength(2);
      const [a, b] = d.passageIds.map((id) => index.find((p) => p.id === id));
      expect(a.kind).toBe('informational');
      expect(b.kind).toBe('story');
      expect([a.level, b.level].every((l) => l >= 2 && l <= 3)).toBe(true);
    }
  });

  it('math tasks: A = + − ×, B = three missing numbers + two inequalities, C = three level 2-3 word problems', () => {
    for (const d of defs) {
      const ops = (ids) => ids.map((id) => itemFromId(id)).map((it) => (it.kind === 'inequality' ? it.left[1] : it.expr[1]));
      expect(ops(d.A)).toEqual(['+', '−', '×']);
      expect(ops(d.B)).toEqual(['+', '−', '×']);
      expect(ops(d.ineq)).toEqual(['+', '−']);
      expect(d.ineq.every((id) => itemFromId(id).kind === 'inequality')).toBe(true);
      expect(d.C).toHaveLength(3);
      for (const id of d.C) {
        const w = wordProblems.find((x) => x.id === id);
        expect(w.level >= 2 && w.level <= 3).toBe(true);
      }
      expect(new Set(d.C.map((id) => wordProblems.find((x) => x.id === id).topic)).size).toBe(3);
      expect(d.D).toHaveLength(3);
    }
  });

  it('exactly one of the six has a triangle-digit item in task D', () => {
    const withDigit = defs.map((d, i) => (d.D.some((id) => id.startsWith('g:dr:')) ? i + 1 : 0)).filter(Boolean);
    expect(withDigit).toEqual([DIGIT_SIM]);
    // and every picture riddle in task D asks for a value the brute force confirms (the bank only requires the ASKED icon to be unique)
    for (const d of defs) for (const id of d.D) {
      const r = id.startsWith('g:') ? itemFromId(id) : pictureRiddles.find((x) => x.id === id);
      const rows = r.rows || (r.riddle && r.riddle.rows);
      const ask = r.ask || (r.riddle && r.riddle.ask);
      if (rows) expect(solveRiddle(rows)[0][ask]).toBe(r.options[r.answer]);
    }
  });

  it('a pinned plan stays valid until an id disappears', () => {
    expect(defValid(defs[0], content)).toBe(true);
    expect(defValid(defs[0], { ...content, passages: index.slice(3) })).toBe(index.slice(3).some((p) => p.id === defs[0].passageIds[0]));
    expect(defValid({ ...defs[0], C: ['wp-nope'] }, content)).toBe(false);
  });

  it('with too little content it still assembles, and says so ("short")', () => {
    const few = { ...content, passages: index.filter((p) => p.id === 'inf-02') };
    const d = planFixed(few);
    expect(d.every((x) => x.short)).toBe(true);
    expect(d.every((x) => x.passageIds.length >= 1)).toBe(true);
    const sim = layoutSim(d[0], few, [byPassage['inf-02']]);
    expect(sim.items.length).toBeGreaterThan(14);
  });
});

describe('endless simulation', () => {
  it('is reproducible from its seed and differs between seeds', () => {
    expect(planEndless(content, 4242)).toEqual(planEndless(content, 4242));
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(planEndless(content, s * 99991)));
    expect(new Set(seeds).size).toBeGreaterThan(5);
    expect(planEndless(content, 7).n).toBe(ENDLESS);
  });
});

describe('booklet layout', () => {
  const def = planSim(2, content);
  const sim = build(def);
  it('has the official page order and 14 math items + all passage questions', () => {
    const kinds = sim.pages.map((p) => p.type + (p.task ? ':' + p.task : ''));
    expect(kinds[0]).toBe('cover');
    expect(kinds[1]).toBe('example:reading');
    expect(kinds.indexOf('stop')).toBeGreaterThan(kinds.lastIndexOf('items:reading'));
    expect(kinds.slice(kinds.indexOf('stop'))).toEqual(
      ['stop', 'example:A', 'items:A', 'example:B', 'items:B', 'items:B', 'example:C', 'items:C', 'items:C', 'example:D', 'items:D', 'items:D', 'items:D', 'end'],
    );
    const reading = sim.items.filter((i) => i.task === 'reading').length;
    expect(reading).toBe(def.passageIds.reduce((n, id) => n + byPassage[id].questions.length, 0));
    expect(sim.items.length - reading).toBe(3 + 3 + 2 + 3 + 3);
    expect(sim.total).toBe(sim.items.length);
    expect(new Set(sim.items.map((i) => i.id)).size).toBe(sim.items.length);
  });
  it('chunks questions 2 per page, merging a lone last one (5 → 2+3, 7 → 2+2+3)', () => {
    expect(chunk([1, 2, 3, 4, 5], 2, true).map((g) => g.length)).toEqual([2, 3]);
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 2, true).map((g) => g.length)).toEqual([2, 2, 3]);
    expect(chunk([1, 2, 3, 4, 5, 6], 2, true).map((g) => g.length)).toEqual([2, 2, 2]);
  });
  it('paginate() with everything fitting gives back the estimated layout', () => {
    const p = paginate(sim.pages, () => true);
    const shape = (pages) => pages.map((x) => [x.key, x.type, x.pageNo, x.first, (x.items || []).map((i) => i.id).join()]);
    expect(shape(p)).toEqual(shape(sim.pages));
    expect(p.some((x) => x.scroll)).toBe(false);
    expect(new Set(p.map((x) => x.key)).size).toBe(p.length);
  });
  it('paginate() moves trailing questions on until a page fits, never splits one, and lets a lone giant scroll', () => {
    const giant = sim.items.find((i) => i.task === 'reading' && i.no === 3).id;
    // a page "fits" when it holds one question, except the giant which never fits
    const fits = (pg) => pg.items.length === 1 && pg.items[0].id !== giant;
    const p = paginate(sim.pages, fits);
    const itemPages = p.filter((x) => x.type === 'items');
    expect(itemPages.every((x) => x.items.length === 1)).toBe(true);
    expect(itemPages.flatMap((x) => x.items.map((i) => i.id))).toEqual(sim.items.map((i) => i.id)); // same order, none lost
    expect(p.filter((x) => x.scroll).map((x) => x.items[0].id)).toEqual([giant]);
    expect(p.every((x, i) => i === 0 || x.pageNo === i)).toBe(true);
    // only the first page of each passage's questions carries the "answer the questions" instruction
    const firsts = itemPages.filter((x) => x.task === 'reading' && x.first).map((x) => x.passageId);
    expect(firsts).toEqual(def.passageIds);
    // the inequalities stay on their own page(s), after the missing numbers
    expect(itemPages.filter((x) => x.ineq).every((x) => x.items.every((i) => i.kind === 'inequality'))).toBe(true);
  });
  it('a place in the booklet survives re-paging (by item, or by page key)', () => {
    const wide = paginate(sim.pages, () => true);
    const narrow = paginate(sim.pages, (pg) => pg.items.length === 1);
    const at = wide.findIndex((x) => x.type === 'items' && x.items.length > 1);
    const second = wide[at].items[1].id;
    const to = pageFor(narrow, placeOf(wide[at], second));
    expect(narrow[to].items.map((i) => i.id)).toEqual([second]);
    expect(narrow[pageFor(narrow, placeOf(wide[at], null))].items[0].id).toBe(wide[at].items[0].id);
    const stop = wide.findIndex((x) => x.type === 'stop');
    expect(narrow[pageFor(narrow, placeOf(wide[stop]))].type).toBe('stop');
  });
  it('you can page back inside a part but never into Part 1 after the stop page, nor to the cover', () => {
    const stop = sim.pages.findIndex((p) => p.type === 'stop');
    expect(canGoBack(sim.pages, 0)).toBe(false);
    expect(canGoBack(sim.pages, 1)).toBe(false); // example 1 → cover
    expect(canGoBack(sim.pages, 2)).toBe(true);
    expect(canGoBack(sim.pages, stop)).toBe(true);
    expect(canGoBack(sim.pages, stop + 1)).toBe(false); // first page of Part 2
    expect(canGoBack(sim.pages, stop + 2)).toBe(true);
    expect(sim.pages.every((p, i) => i === 0 || p.pageNo === i)).toBe(true);
  });
});

describe('scoring', () => {
  const sim = build(planSim(1, content));
  const answersFor = (right) => Object.fromEntries(sim.items.map((it) => [it.id, it.kind === 'mc' ? it.answer : it.kind === 'inequality' ? String(it.example) : String(it.answer)]).filter(() => right));

  it('a perfect booklet scores everything, per task and in total', () => {
    const s = scoreSim(sim, answersFor(true));
    expect(s.score).toBe(sim.total);
    expect(s.max).toBe(sim.total);
    expect(s.mistakes).toHaveLength(0);
    expect(s.byTask.A).toEqual({ score: 3, max: 3 });
    expect(s.byTask.B).toEqual({ score: 5, max: 5 });
    expect(s.byTask.C).toEqual({ score: 3, max: 3 });
    expect(s.byTask.D).toEqual({ score: 3, max: 3 });
    expect(s.byPart[1].score + s.byPart[2].score).toBe(s.score);
    expect(Object.keys(s.byTask)).toEqual(TASKS);
  });
  it('an empty booklet scores 0 and lists every item as a mistake', () => {
    const s = scoreSim(sim, {});
    expect(s.score).toBe(0);
    expect(s.mistakes).toHaveLength(sim.total);
    expect(s.results.every((r) => !r.answered && r.answer == null)).toBe(true);
  });
  it('multiple choice: only the right letter counts; two marks or none count 0', () => {
    const mc = sim.items.find((i) => i.kind === 'mc');
    expect(isCorrect(mc, mc.answer)).toBe(true);
    expect(isCorrect(mc, (mc.answer + 1) % 4)).toBe(false);
    expect(isCorrect(mc, [mc.answer, (mc.answer + 1) % 4])).toBe(false);
    expect(isCorrect(mc, [mc.answer])).toBe(false);
    expect(isCorrect(mc, null)).toBe(false);
    expect(isCorrect(mc, undefined)).toBe(false);
  });
  it('written answers must be exact; reversed digits and junk score 0', () => {
    const ex = { kind: 'numeric', answer: 16 };
    expect(isCorrect(ex, '16')).toBe(true);
    expect(isCorrect(ex, '61')).toBe(false);
    expect(isCorrect(ex, '')).toBe(false);
    expect(isCorrect(ex, '1 6')).toBe(false);
    expect(isCorrect(ex, '16x')).toBe(false);
    expect(isCorrect(ex, '-16')).toBe(false);
    expect(isCorrect(ex, '1600')).toBe(false);
  });
  it('inequalities accept ANY valid number (47+15 < 47+__ → every number above 15)', () => {
    const lt = { kind: 'inequality', left: [47, '+', 15], right: [47, '+', { blank: true }], rel: '<' };
    expect(isCorrect(lt, '16')).toBe(true);
    expect(isCorrect(lt, '17')).toBe(true);
    expect(isCorrect(lt, '999')).toBe(true);
    expect(isCorrect(lt, '15')).toBe(false);
    expect(isCorrect(lt, '3')).toBe(false);
    expect(isCorrect(lt, '')).toBe(false);
    const gt = { kind: 'inequality', left: [{ blank: true }, '×', 6], right: [5, '×', 6], rel: '>' };
    expect(isCorrect(gt, '6')).toBe(true);
    expect(isCorrect(gt, '5')).toBe(false);
  });
  it('every generated inequality in every simulation accepts its own example and rejects the bound', () => {
    for (const d of planFixed(content)) for (const id of d.ineq) {
      const it = itemFromId(id);
      expect(isCorrect(it, String(it.example))).toBe(true);
      expect(isCorrect(it, String(it.direction === 'greater' ? it.bound : it.bound))).toBe(false);
      if (it.direction === 'greater') expect(isCorrect(it, String(it.bound + 50))).toBe(true);
      expect(checkInequality(it, it.example)).toBe(true);
    }
  });
  it('builds the history record', () => {
    const s = scoreSim(sim, answersFor(true));
    const e = historyEntry(sim, s, { mode: 'timed', ms: 50 * 60000, t: 123 });
    expect(e).toMatchObject({ sim: 'sim-1', t: 123, mode: 'timed', score: s.score, max: s.max, minutes: 50, over: true });
    expect(e.tasks.A).toEqual([3, 3]);
    expect(historyEntry(sim, s, { mode: 'free', ms: 90 * 60000 }).over).toBe(false);
  });
});

describe('passage ranking', () => {
  it('puts level 2-3 first, gentlest first', () => {
    const r = rankPassages(index, 'informational');
    const levels = r.map((id) => index.find((p) => p.id === id).level);
    expect(levels.slice(0, 8).every((l) => l >= 2)).toBe(true);
    expect(levels.slice(0, 8)).toEqual(levels.slice(0, 8).slice().sort((a, b) => a - b));
  });
});
