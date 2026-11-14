// Extraction, stable ids, hint votes, skeleton errors and decisions — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extract, listSourceFiles, wordId, globToRegExp } from '../lib/extract.mjs';
import { compare, rebuild } from '../lib/compare.mjs';
import { samplePassages } from '../lib/review.mjs';

const N = (s) => s.normalize('NFC');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-test-'));
  fs.mkdirSync(path.join(dir, 'passages'));
  fs.writeFileSync(path.join(dir, 'passages/p1.json'), JSON.stringify({
    id: 'p1', kind: 'story', title: 'גן', paragraphs: [['כל החיות', 'בגן שמחו.'], ['הילדה קראה ספר.']],
    questions: [{ id: 'q1', type: 'detail', stem: 'מה קראה?', options: ['{{ספר|סֵפֶר}}', 'שיר', 'מכתב', 'עיתון'], answer: 0, explain: 'כתוב בשורה 2.' }],
  }));
  fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ 'a.b': 'שלום', 'n': 'ב־2 שלבים' }));
  fs.writeFileSync(path.join(dir, 'picture-riddles.json'), JSON.stringify([{ id: 'pr', rows: [], ask: 'star' }]));
  return dir;
}

test('extract: units, paths, hints, context; ids/enums skipped', () => {
  const dir = fixture();
  const files = listSourceFiles(dir);
  assert.deepEqual(files, ['passages/p1.json', 'picture-riddles.json', 'ui.json']);
  const { items, units, errors } = extract(dir, files);
  assert.deepEqual(errors, []);
  assert.equal(units.length, 4); // passage text, question, 2 ui strings
  const text = units.find((u) => u.group === 'text');
  assert.deepEqual(text.items.map((i) => i.pathStr), ['title', 'paragraphs[0][0]', 'paragraphs[0][1]', 'paragraphs[1][0]']);
  assert.deepEqual(text.joins, ['\n', ' ', '\n', '\n']); // lines of one paragraph join with a space
  assert.equal(text.items[1].context, 'כל החיות בגן שמחו.');
  const opt = items.find((i) => i.pathStr === 'questions[0].options[0]');
  assert.equal(opt.text, 'ספר');
  assert.equal(opt.hints.get(0), N('סֵפֶר'));
});

test('extract: rejects nikud in src and bad hints', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-test-'));
  fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ a: 'שָׁלוֹם', b: '{{ספר|סִפּוּר}}' }));
  const { errors } = extract(dir, ['ui.json']);
  assert.equal(errors.length, 2);
});

test('glob filter', () => {
  assert.ok(globToRegExp('passages/*.json').test('passages/inf-01.json'));
  assert.ok(!globToRegExp('passages/*.json').test('ui.json'));
  assert.ok(globToRegExp('**/*.json').test('bonus/series.json'));
});

test('wordId is stable and depends on word + line + occurrence only', () => {
  const a = { words: ['כל', 'כל'], text: 'כל כל' };
  assert.equal(wordId(a, 0), wordId({ ...a }, 0));
  assert.notEqual(wordId(a, 0), wordId(a, 1));
  assert.notEqual(wordId(a, 0), wordId({ words: ['כל', 'כל'], text: 'כל כל!' }, 0));
});

function fakeResults(units, fn) {
  // fn(vocId, item) → vocalized string
  const results = new Map();
  for (const v of ['dicta', 'codex', 'claude']) {
    const m = new Map();
    for (const u of units) m.set(u.key, { items: u.items.map((it) => ({ raw: fn(v, it) })) });
    results.set(v, m);
  }
  return results;
}

const VOC = {
  'ספר': 'סֵפֶר', 'שלום': 'שָׁלוֹם', 'כל': 'כָּל', 'החיות': 'הַחַיּוֹת', 'בגן': 'בַּגַּן', 'שמחו': 'שָׂמְחוּ', 'הילדה': 'הַיַּלְדָּה',
  'קראה': 'קָרְאָה', 'מה': 'מָה', 'שיר': 'שִׁיר', 'מכתב': 'מִכְתָּב', 'עיתון': 'עִיתּוֹן', 'כתוב': 'כָּתוּב', 'בשורה': 'בַּשּׁוּרָה',
  'גן': 'גַּן', 'ב': 'בְּ', 'שלבים': 'שְׁלַבִּים',
};
const voc = (t) => t.replace(/[א-ת]+/g, (w) => VOC[w] || w);

test('compare: unanimous → agreed; one dissent → disagreement; skeleton change → error + lost vote; decisions apply', () => {
  const dir = fixture();
  const { items, units } = extract(dir, listSourceFiles(dir));
  // codex vocalizes בגן as בְּגַן; claude changes a letter in שלבים (ם→ן, not repairable); everyone else agrees.
  const results = fakeResults(units, (v, it) => {
    let s = voc(it.text);
    if (v === 'codex') s = s.replace('בַּגַּן', 'בְּגַן');
    if (v === 'claude') s = s.replace('שְׁלַבִּים', 'שְׁלַבִּין');
    return s;
  });
  const vocIds = ['dicta', 'codex', 'claude'];
  let cmp = compare({ items, units, results, vocIds, decisions: {} });
  assert.equal(cmp.skeletonErrors.length, 1);
  assert.equal(cmp.skeletonErrors[0].vocalizer, 'claude');
  const words = cmp.disagreements.map((d) => d.word).sort();
  assert.deepEqual(words, ['בגן', 'שלבים']);
  const sh = cmp.disagreements.find((d) => d.word === 'שלבים');
  assert.equal(sh.versions.claude, null);
  assert.equal(cmp.stats.unresolved, 2);
  // the hint agreed with all three → the option ספר is accepted
  const opt = items.find((i) => i.pathStr === 'questions[0].options[0]');
  assert.deepEqual(cmp.finals.get(opt.key).status, ['agreed']);

  // decisions resolve both; a decision with the wrong letters is rejected
  const decisions = {
    [cmp.disagreements.find((d) => d.word === 'בגן').id]: { form: 'בַּגַּן', reason: 'definite: in the garden' },
    [sh.id]: { form: 'שְׁלָבִים', reason: 'wrong on purpose' },
  };
  cmp = compare({ items, units, results, vocIds, decisions });
  assert.equal(cmp.stats.unresolved, 0);
  assert.equal(cmp.stats.decided, 2);
  const line = items.find((i) => i.pathStr === 'paragraphs[0][1]');
  assert.equal(rebuild(line.text, cmp.finals.get(line.key).forms), N('בַּגַּן שָׂמְחוּ.'));
  const bad = { ...decisions, [sh.id]: { form: 'שְׁלָבִם', reason: 'letters differ' } };
  cmp = compare({ items, units, results, vocIds, decisions: bad });
  assert.equal(cmp.badDecisions.length, 1);
});

test('compare: a hint that disagrees with three agreeing vocalizers is a disagreement', () => {
  const dir = fixture();
  const { items, units } = extract(dir, listSourceFiles(dir));
  const results = fakeResults(units, (v, it) => voc(it.text).replace(/^סֵפֶר$/, 'סְפָר'));
  const cmp = compare({ items, units, results, vocIds: ['dicta', 'codex', 'claude'], decisions: {} });
  const d = cmp.disagreements.find((x) => x.path === 'questions[0].options[0]');
  assert.ok(d);
  assert.equal(d.hint, N('סֵפֶר'));
});

test('passage sample: 10%, at least one, stable for the same seed', () => {
  const files = Array.from({ length: 24 }, (_, i) => `passages/p${String(i).padStart(2, '0')}.json`);
  const a = samplePassages(files);
  assert.equal(a.length, 3);
  assert.deepEqual(a, samplePassages(files));
  assert.equal(samplePassages(['passages/x.json']).length, 1);
});

test('compare: a ktiv-haser word keeps its vote after mater restoration (and is still logged)', () => {
  const dir = fixture();
  const { items, units } = extract(dir, listSourceFiles(dir));
  const results = fakeResults(units, (v, it) => {
    const s = voc(it.text);
    return v === 'codex' ? s.replace('עִיתּוֹן', 'עִתּוֹן') : s;
  });
  const cmp = compare({ items, units, results, vocIds: ['dicta', 'codex', 'claude'], decisions: {} });
  assert.equal(cmp.disagreements.length, 0);
  assert.equal(cmp.skeletonErrors.length, 1);
  assert.equal(cmp.skeletonErrors[0].matresRestored, 1);
  assert.equal(cmp.skeletonErrors[0].wordsLost, 0);
});

test('LLM driver: restorable ktiv-haser drops are kept without a retry; real letter changes are retried once', async () => {
  const { runLlmVocalizer } = await import('../lib/adapters/llm.mjs');
  const mk = (key, texts) => ({ key, file: 'f', group: key, items: texts.map((t) => ({ text: t, words: t.split(' ') })) });
  const units = [mk('a', ['חורף קר']), mk('b', ['ספר טוב'])];
  const replies = [
    JSON.stringify({ units: [{ id: 'a', items: ['חֹרֶף קַר'] }, { id: 'b', items: ['סְפָרִים טוֹב'] }] }),
    JSON.stringify({ units: [{ id: 'b', items: ['סֵפֶר טוֹב'] }] }),
  ];
  let n = 0;
  const done = {};
  const stats = await runLlmVocalizer({
    id: 't', maxChars: 1000, units, call: async () => ({ text: replies[n++], ms: 1 }),
    onUnit: async (u, r) => { done[u.key] = r[0].raw; },
  });
  assert.equal(stats.calls, 2);
  assert.equal(done.a, N('חֹרֶף קַר'));
  assert.equal(done.b, N('סֵפֶר טוֹב'));
});

test('extract: one-letter answer labels (א, ד׳) stay bare and are not extracted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-test-'));
  fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ 'mc.1': 'א', 'mc.4': 'ד', 't.D': 'ד׳', 'w': 'אם' }));
  const { items, errors } = extract(dir, ['ui.json']);
  assert.deepEqual(errors, []);
  assert.deepEqual(items.map((i) => i.pathStr), ['w']);
});
