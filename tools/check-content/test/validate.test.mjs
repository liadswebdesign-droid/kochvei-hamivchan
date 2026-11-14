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
