// node --test tools/check-content/test/
// Runs the validator on small throwaway trees (--src=DIR) and reads its report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALIDATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../validate.mjs');

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-validate-'));
  for (const [rel, data] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 1));
  }
  const r = spawnSync(process.execPath, [VALIDATE, '--quiet', `--src=${dir}`], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  const errors = r.stdout.split('\n').filter((l) => l.trim().startsWith('ERROR')).map((l) => l.trim());
  return { code: r.status, errors, out: r.stdout };
}

const bonus = (stem, options = ['קן', 'כוורת', 'מערה', 'מאורה']) => ({
  'bonus/analogies.json': [{ id: 'an-1', type: 'analogy', level: 1, stem, options, answer: 1, explain: 'דבורה גרה **בכוורת**' }],
});

test('balanced **bold** is accepted in stems, options, explanations and ui strings', () => {
  const r = run({
    ...bonus('איזו מילה **אינה** מתאימה?', ['קן', '**כוורת**', 'מערה', 'מאורה']),
    'ui.json': { 'instr.x': 'כתבו מספר **בלי מקום בתבנית**', 'instr.y': 'גם **גם** וגם **אין**' },
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.code, 0);
});

test('unbalanced, empty, padded or single * markers are errors', () => {
  const cases = {
    'unbalanced ** bold markers': 'מה **אין בסיפור?',
    'empty **bold** span': 'מה **** בסיפור?',
    'space just inside **': 'מה ** אין ** בסיפור?',
    'stray "*"': 'מה *אין* בסיפור?',
  };
  for (const [msg, stem] of Object.entries(cases)) {
    const r = run(bonus(stem));
    assert.equal(r.code, 1, stem);
    assert.ok(r.errors.some((e) => e.includes(msg)), `${stem}: expected "${msg}" in ${JSON.stringify(r.errors)}`);
  }
});

test('options compare without the markers (bold does not make a duplicate distinct)', () => {
  const r = run(bonus('איזו מילה מתאימה?', ['קן', '**קן**', 'מערה', 'מאורה']));
  assert.ok(r.errors.some((e) => e.includes('options are not distinct')), JSON.stringify(r.errors));
});

test('a quote in a stem matches a passage line that bolds the same words', () => {
  const lines = ['היום **אין** גשם בחוץ ולכן יצאנו כולנו לשחק', 'בחצר הגדולה שיחקנו כדור עם כל החברים'];
  const passage = {
    id: 'inf-01', kind: 'informational', title: 'יום **בלי** גשם', level: 1, paragraphs: [lines],
    questions: [{
      id: 'inf-01-q1', type: 'detail', stem: 'בשורה 1 כתוב "אין גשם". מה עשו הילדים?', lineRef: 1,
      options: ['שיחקו בחוץ', 'ישבו בבית', 'קראו ספר', 'הלכו לישון'], answer: 0, explain: 'בשורה 1 כתוב **שיצאו לשחק**',
    }],
  };
  const r = run({ 'passages/inf-01.json': passage });
  assert.deepEqual(r.errors, []);
});

// ---- bonus/shape-series.json ------------------------------------------------------------------------------------------
const T = (s, c = 'blue', o = {}) => ({ s, c, r: 0, n: 1, f: 'full', ...o });
const arrow = (r, o = {}) => T('arrow', 'red', { r, ...o });
const shapeItem = (over = {}) => ({
  id: 'sh-1', type: 'shape-series', level: 2, stem: 'איזו צורה ממשיכה את הסדרה?',
  seq: [arrow(0), arrow(90), arrow(180), arrow(270), arrow(0), '?'],
  options: [arrow(270), arrow(90), arrow(0), arrow(90, { f: 'empty' })], answer: 1,
  rule: { r: { step: 90 } }, explain: 'החץ מסתובב בכל פעם רבע סיבוב.', ...over,
});
const shapes = (...items) => ({ 'bonus/shape-series.json': items });

test('a well-formed shape pattern passes', () => {
  const r = run(shapes(shapeItem()));
  assert.deepEqual(r.errors, []);
  assert.equal(r.code, 0);
});

test('shape patterns: the rule recomputes the answer', () => {
  const r = run(shapes(shapeItem({ answer: 0 })));
  assert.ok(r.errors.some((e) => e.includes('the rule gives')), JSON.stringify(r.errors));
  const r2 = run(shapes(shapeItem({ rule: { r: { step: 45 } } })));
  assert.ok(r2.errors.some((e) => e.includes('rule: r: tile')), JSON.stringify(r2.errors));
});

test('shape patterns: tokens use only the known vocabulary', () => {
  const r = run(shapes(shapeItem({ options: [arrow(270), arrow(90), T('pentagon'), arrow(90, { f: 'empty' })] })));
  assert.ok(r.errors.some((e) => e.includes('unknown shape')), JSON.stringify(r.errors));
  const r2 = run(shapes(shapeItem({ seq: [arrow(0), arrow(90), { s: 'arrow', c: 'red', r: 180 }, arrow(270), arrow(0), '?'] })));
  assert.ok(r2.errors.some((e) => e.includes('keys must be exactly')), JSON.stringify(r2.errors));
});

test('shape patterns: 4 options that look different, each changing exactly one thing', () => {
  const same = run(shapes(shapeItem({ options: [arrow(270), arrow(90), arrow(450 - 360), arrow(90, { f: 'empty' })] })));
  assert.ok(same.errors.some((e) => e.includes('look the same')), JSON.stringify(same.errors));
  const two = run(shapes(shapeItem({ options: [arrow(270), arrow(90), arrow(0, { n: 2 }), arrow(90, { f: 'empty' })] })));
  assert.ok(two.errors.some((e) => e.includes('exactly one thing') && e.includes('r, n')), JSON.stringify(two.errors));
  const three = run(shapes(shapeItem({ options: [arrow(270), arrow(90), arrow(0)] })));
  assert.ok(three.errors.some((e) => e.includes('exactly 4 tiles')), JSON.stringify(three.errors));
});

test('shape patterns: colour is never the only difference unless the item is about colour', () => {
  const r = run(shapes(shapeItem({ options: [arrow(270), arrow(90), T('arrow', 'blue', { r: 90 }), arrow(90, { f: 'empty' })] })));
  assert.ok(r.errors.some((e) => e.includes('differ only in colour, and this item is not about colour')), JSON.stringify(r.errors));
  const stars = ['red', 'yellow', 'red', 'yellow'].map((c) => T('star', c));
  const ok = run(shapes(shapeItem({ seq: [...stars, '?'], rule: { c: { cycle: 2 } }, options: [T('star', 'red'), T('star', 'yellow'), T('heart', 'red'), T('star', 'red', { f: 'empty' })], answer: 0 })));
  assert.deepEqual(ok.errors, []);
  const twice = run(shapes(shapeItem({ seq: [...stars, '?'], rule: { c: { cycle: 2 } }, options: [T('star', 'red'), T('star', 'yellow'), T('star', 'blue'), T('star', 'red', { f: 'empty' })], answer: 0 })));
  assert.ok(twice.errors.some((e) => e.includes('pairs of options differ only in colour')), JSON.stringify(twice.errors));
});

test('shape patterns: an option that completes the sequence by another rule is an error', () => {
  // ↑ → ? ← ↑ → : "↑" also works as two series (↑ ↑ ↑ and → ← →)
  const seq = [arrow(0), arrow(90), '?', arrow(270), arrow(0), arrow(90)];
  const base = { stem: 'מה חסר בסדרה?', seq, options: [arrow(180), arrow(0), arrow(270), arrow(180, { f: 'empty' })], answer: 0 };
  const r = run(shapes(shapeItem(base)));
  assert.ok(r.errors.some((e) => e.includes('options[1] also completes the sequence')), JSON.stringify(r.errors));
  const fixed = run(shapes(shapeItem({ ...base, options: [arrow(180), arrow(90), arrow(270), arrow(180, { f: 'empty' })] })));
  assert.deepEqual(fixed.errors, []);
});

test('shape patterns: the stem matches where the gap is', () => {
  const r = run(shapes(shapeItem({ stem: 'מה חסר בסדרה?' })));
  assert.ok(r.errors.some((e) => e.includes('the stem should be')), JSON.stringify(r.errors));
});

// ---- bonus/series.json: answers are recomputed ------------------------------------------------------------------------
const series = (stem, options, answer) => ({ 'bonus/series.json': [{ id: 'sr-1', type: 'series', level: 2, stem, options, answer, explain: 'מוסיפים בכל פעם יותר.' }] });

test('number series: the answer is recomputed and must be the only option that fits', () => {
  assert.deepEqual(run(series('איזה מספר ממשיך את הסדרה? 5, 9, 14, 20, ?', ['26', '24', '27', '28'], 2)).errors, []);
  assert.deepEqual(run(series('איזה מספר חסר בסדרה? 10, 15, 13, 18, ?, 21', ['16', '20', '23', '14'], 0)).errors, []);
  const wrong = run(series('איזה מספר ממשיך את הסדרה? 5, 9, 14, 20, ?', ['26', '24', '27', '28'], 0));
  assert.ok(wrong.errors.some((e) => e.includes('answer 26 does not fit; the rule gives 27')), JSON.stringify(wrong.errors));
  const two = run(series('איזה מספר ממשיך את הסדרה? 1, 2, 4, 8, ?', ['16', '12', '10', '14'], 0));
  assert.deepEqual(two.errors, []);
  const amb = run(series('איזה מספר ממשיך את הסדרה? 2, 4, 6, 8, ?', ['10', '12', '9', '10'], 0));
  assert.ok(amb.errors.some((e) => e.includes('options are not distinct')), JSON.stringify(amb.errors));
});

test('number series: the stem must end in the numbers, with one "?"', () => {
  const r = run(series('איזה מספר ממשיך את הסדרה?', ['1', '2', '3', '4'], 0));
  assert.ok(r.errors.some((e) => e.includes('series stem must be')), JSON.stringify(r.errors));
  const r2 = run(series('איזה מספר ממשיך את הסדרה? 2, ?, 6, ?', ['1', '2', '3', '4'], 0));
  assert.ok(r2.errors.some((e) => e.includes('exactly one "?"')), JSON.stringify(r2.errors));
});
