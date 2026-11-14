// House rules (5th, overriding vote) and word-level global decisions — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, listSourceFiles, wordId } from '../lib/extract.mjs';
import { compare } from '../lib/compare.mjs';
import { compileHouseRules, loadHouseRules, houseMatch } from '../lib/house.mjs';

const N = (s) => s.normalize('NFC');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VOC_IDS = ['dicta', 'codex', 'claude'];

function srcDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-house-'));
  for (const [f, json] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(json));
  }
  return dir;
}

/** fn(vocId, item) → vocalized string; builds the results map compare() expects. */
function results(units, fn) {
  const m = new Map();
  for (const v of VOC_IDS) m.set(v, new Map(units.map((u) => [u.key, { items: u.items.map((it) => ({ raw: fn(v, it) })) }])));
  return m;
}

const VOC = {
  'מה': 'מָה', 'כתוב': 'כָּתוּב', 'בשורה': 'בַּשּׁוּרָה', 'ב': 'בְּ', 'שלבים': 'שְׁלַבִּים', 'יש': 'יֵשׁ', 'כיתה': 'כִּיתָּה',
  'הילד': 'הַיֶּלֶד', 'ראה': 'רָאָה', 'ספר': 'סֵפֶר', 'עד': 'עַד', 'הערב': 'הָעֶרֶב', 'עמד': 'עָמַד', 'שם': 'שָׁם',
};
const voc = (t) => t.replace(/[א-ת]+/g, (w) => VOC[w] || w);

const RULES = {
  rules: [
    { id: 'prefix-digit', wordRe: '^[בלכ]$', after: '^[־-]\\d', forms: { 'ב': 'בְּ', 'ל': 'לְ', 'כ': 'כְּ' }, reason: 'r' },
    { id: 'beshura-n', word: 'בשורה', after: '^\\s*\\d', form: 'בְּשׁוּרָה', reason: 'r' },
    { id: 'katuv', word: 'כתוב', before: 'בשורה\\s*\\d+\\s*$', form: 'כָּתוּב', reason: 'r' },
    { id: 'mah', word: 'מה', form: 'מָה', reason: 'r' },
    { id: 'ad', word: 'עד', form: 'עַד', reason: 'r' },
  ],
};

test('compileHouseRules: good rules compile; forms are NFC-normalized', () => {
  const { rules, errors } = compileHouseRules(RULES);
  assert.deepEqual(errors, []);
  assert.equal(rules.length, 5);
  assert.equal(rules[1].forms.get('בשורה'), N('בְּשׁוּרָה'));
});

test('compileHouseRules: every kind of bad rule is reported', () => {
  const bad = [
    { id: 'a', word: 'מה', form: 'מָא', reason: 'r' }, // letters differ
    { id: 'b', word: 'מָה', form: 'מָה', reason: 'r' }, // nikud in word
    { id: 'c', word: 'מה', form: 'מָה' }, // no reason
    { id: 'd', word: 'מה', wordRe: '^מה$', form: 'מָה', reason: 'r' }, // both word and wordRe
    { id: 'e', wordRe: '^[בל]$', forms: { 'ב': 'בְּ', 'כ': 'כְּ' }, reason: 'r' }, // forms key outside wordRe
    { id: 'f', word: 'של', after: '([', form: 'שֶׁל', reason: 'r' }, // bad regex
    { id: 'g', word: 'של', form: 'של', reason: 'r' }, // fails lint (unvocalized)
    { id: 'h', word: 'של', form: 'שֶׁל', reason: 'r' },
    { id: 'h', word: 'כי', form: 'כִּי', reason: 'r' }, // duplicate id
    { id: 'i', word: 'של', form: 'שֶׁל', reason: 'r' }, // second context-free rule for the same word
  ];
  const { errors } = compileHouseRules({ rules: bad });
  const by = (id) => errors.filter((e) => e.id === id).map((e) => e.problem).join(' | ');
  assert.match(by('a'), /different letters/);
  assert.match(by('b'), /one bare word/);
  assert.match(by('c'), /missing reason/);
  assert.match(by('d'), /exactly one/);
  assert.match(by('e'), /does not match wordRe/);
  assert.match(by('f'), /not a valid regex/);
  assert.match(by('g'), /fails lint/);
  assert.match(by('h'), /duplicate id/);
  assert.match(by('i'), /second context-free rule/);
});

test('houseMatch: whole bare word, before/after context on the bare item text', () => {
  const { rules } = compileHouseRules(RULES);
  const item = (text) => ({ text, words: text.match(/[א-ת]+/g) });
  const m = (text, wi) => houseMatch(rules, item(text), wi)?.rule.id ?? null;
  assert.equal(m('יש ב־2 שלבים', 1), 'prefix-digit');
  assert.equal(m('יש ב-2 שלבים', 1), 'prefix-digit'); // hyphen-minus too
  assert.equal(m('כיתה ב', 1), null); // grade letter, no digit after it
  assert.equal(m('בשורה 2 כתוב', 0), 'beshura-n');
  assert.equal(m('בשורה 2 כתוב', 1), 'katuv');
  assert.equal(m('בשורה הראשונה', 0), null); // definite: no number → the vote decides
  assert.equal(m('כתוב בשורה', 0), null); // imperative-looking, no line number before it
  assert.equal(m('מהי', 0), null); // whole word only
});

test('compare: house rule beats the vote, never reaches disagreements, overrides of unanimous votes are listed', () => {
  const dir = srcDir({ 'ui.json': { a: 'מה כתוב בשורה 2?', b: 'יש ב־2 שלבים' } });
  const { items, units } = extract(dir, listSourceFiles(dir));
  const res = results(units, (v, it) => {
    let s = voc(it.text); // all three write בַּשּׁוּרָה (unanimous, against the house rule)
    if (v === 'dicta') s = s.replace('מָה', 'מֶה').replace('בְּ', 'ב'); // Dicta dissents on מה and leaves ב bare
    return s;
  });
  const without = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {} });
  assert.deepEqual(without.disagreements.map((d) => d.word).sort(), ['ב', 'מה']);
  const { rules } = compileHouseRules(RULES);
  const cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {}, houseRules: rules });
  assert.deepEqual(cmp.disagreements, []);
  assert.equal(cmp.stats.houseResolved, 2);
  assert.deepEqual(cmp.house.overrides.map((o) => [o.rule, o.votes, o.form]), [['beshura-n', N('בַּשּׁוּרָה'), N('בְּשׁוּרָה')]]);
  const a = cmp.finals.get('ui.json#a');
  assert.deepEqual(a.status, ['house', 'agreed', 'house']); // כתוב comes before בשורה here, so the katuv rule does not fire
  assert.deepEqual(a.forms, [N('מָה'), N('כָּתוּב'), N('בְּשׁוּרָה')]);
  assert.equal(cmp.house.use.mah, 1);
});

test('compare: precedence is decision > house rule; a contradicting {{hint}} turns the rule off for that word', () => {
  const dir = srcDir({ 'ui.json': { a: 'מה כתוב בשורה 2?', w: 'הילד ראה {{עד|עֵד}}' } });
  const { items, units } = extract(dir, listSourceFiles(dir));
  const res = results(units, (v, it) => voc(it.text));
  const { rules } = compileHouseRules(RULES);
  const a = items.find((i) => i.pathStr === 'a');
  const decisions = { [wordId(a, 2)]: { form: 'בַּשּׁוּרָה', reason: 'test: decision wins' } };
  const cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions, houseRules: rules });
  assert.equal(cmp.finals.get('ui.json#a').forms[2], N('בַּשּׁוּרָה'));
  assert.equal(cmp.finals.get('ui.json#a').status[2], 'agreed'); // decision == unanimous vote
  // עד with hint עֵד: the rule is skipped, the hint votes against the 3 vocalizers (עַד) → a disagreement
  assert.equal(cmp.house.skippedByHint.length, 1);
  assert.deepEqual(cmp.disagreements.map((d) => d.word), ['עד']);
});

test('compare: a house-decided word is still linted (bad forms cannot be written by a rule)', () => {
  const { errors } = compileHouseRules({ rules: [{ id: 'x', word: 'שם', form: 'שָם', reason: 'missing shin dot' }] });
  assert.match(errors[0].problem, /fails lint \[shin-dot\]/);
});

test('global decisions: identical sentences in different files share one id, and one decision resolves both', () => {
  const stem = 'בשורה הראשונה עמד הילד';
  const dir = srcDir({
    'passages/a.json': { id: 'a', kind: 'story', title: 'א', paragraphs: [['שם']], questions: [{ id: 'q', type: 'detail', stem, options: ['שם'], answer: 0 }] },
    'passages/b.json': { id: 'b', kind: 'story', title: 'ב', paragraphs: [['שם']], questions: [{ id: 'q', type: 'detail', stem, options: ['שם'], answer: 0 }] },
  });
  const { items, units } = extract(dir, listSourceFiles(dir));
  const res = results(units, (v, it) => (v === 'dicta' ? voc(it.text).replace('בַּשּׁוּרָה', 'בְּשׁוּרָה') : voc(it.text)));
  let cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {} });
  assert.equal(cmp.disagreements.length, 1);
  const d = cmp.disagreements[0];
  assert.deepEqual(d.occurrences.map((o) => o.file), ['passages/a.json', 'passages/b.json']);
  cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: { [d.id]: { form: 'בַּשּׁוּרָה', reason: 'definite' } } });
  for (const f of ['passages/a.json', 'passages/b.json']) {
    const fin = cmp.finals.get(`${f}#questions[0].stem`);
    assert.equal(fin.forms[0], N('בַּשּׁוּרָה'));
    assert.equal(fin.status[0], 'decided');
  }
});

test('the shipped content/nikud/house-rules.json compiles with no errors', () => {
  const { rules, errors, missing } = loadHouseRules(path.join(HERE, '../../../content/nikud/house-rules.json'));
  assert.ok(!missing);
  assert.deepEqual(errors, []);
  assert.ok(rules.length >= 100);
});

test('compare: a rule that goes against the majority (2 of 3) is listed; expectDissent silences a deliberate rule', () => {
  // the real case: אלה is also the girl's name אֵלָה — two vocalizers saw it, a demonstrative rule would have overruled them
  const dir = srcDir({ 'ui.json': { a: 'כמה גולות קיבלה אלה?', b: 'בשורה 2' } });
  const { items, units } = extract(dir, listSourceFiles(dir));
  const res = results(units, (v, it) => voc(it.text).replace('אלה', v === 'dicta' ? 'אֵלֶּה' : 'אֵלָה'));
  const raw = [
    { id: 'ele', word: 'אלה', form: 'אֵלֶּה', reason: 'r' },
    { id: 'beshura-n', word: 'בשורה', after: '^\\s*\\d', form: 'בְּשׁוּרָה', reason: 'r' },
  ];
  let cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {}, houseRules: compileHouseRules({ rules: raw }).rules });
  assert.deepEqual(cmp.house.overrides.map((o) => [o.rule, o.unanimous, o.agree]), [['ele', false, 1], ['beshura-n', true, 0]]);
  raw[1].expectDissent = true;
  cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {}, houseRules: compileHouseRules({ rules: raw }).rules });
  assert.deepEqual(cmp.house.overrides.map((o) => o.rule), ['ele']);
});
