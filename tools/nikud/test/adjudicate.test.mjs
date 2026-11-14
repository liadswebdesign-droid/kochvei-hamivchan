// Disagreement groups, group rulings with exceptions, merged decision files, batch sheets and --promote — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extract, listSourceFiles, wordId } from '../lib/extract.mjs';
import { compare } from '../lib/compare.mjs';
import { compileHouseRules } from '../lib/house.mjs';
import { loadDecisions, writeBatches, promoteGroup } from '../lib/adjudicate.mjs';

const N = (s) => s.normalize('NFC');
const VOC_IDS = ['dicta', 'codex', 'claude'];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-adj-'));

function setup(ui) {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify(ui));
  const { items, units } = extract(dir, listSourceFiles(dir));
  return { items, units };
}

const VOC = { 'הילדה': 'הַיַּלְדָּה', 'רצה': 'רָצָה', 'שרה': 'שָׁרָה', 'קפצה': 'קָפְצָה', 'בגן': 'בַּגַּן', 'בבית': 'בַּבַּיִת', 'היום': 'הַיּוֹם' };
const voc = (t) => t.replace(/[א-ת]+/g, (w) => VOC[w] || w);
/** Codex always drops the dagesh in הילדה (same pattern everywhere); Dicta writes בְּגַן in one sentence only. */
function results(units) {
  const m = new Map();
  for (const v of VOC_IDS) {
    m.set(v, new Map(units.map((u) => [u.key, {
      items: u.items.map((it) => {
        let s = voc(it.text);
        if (v === 'codex') s = s.replace('הַיַּלְדָּה', 'הַיַלְדָּה');
        if (v === 'dicta' && it.pathStr === 'c') s = s.replace('בַּגַּן', 'בְּגַן');
        return { raw: s, extra: undefined };
      }),
    }])));
  }
  return m;
}
const UI = { a: 'הילדה רצה בגן', b: 'הילדה שרה בבית', c: 'הילדה קפצה בגן היום' };

test('groups: the same word with the same vote pattern in different sentences is one group', () => {
  const { items, units } = setup(UI);
  const cmp = compare({ items, units, results: results(units), vocIds: VOC_IDS, decisions: {} });
  assert.equal(cmp.disagreements.length, 4); // הילדה ×3 (three different sentences) + בגן in c
  assert.equal(cmp.groups.length, 2);
  const g = cmp.groups.find((x) => x.word === 'הילדה');
  assert.equal(g.members.length, 3);
  assert.equal(g.versions.codex, N('הַיַלְדָּה'));
  for (const d of cmp.disagreements) assert.ok(d.group.startsWith('g-'));
});

test('groups: one ruling resolves every member; exceptions and word decisions win over it; reasons are required', () => {
  const { items, units } = setup(UI);
  const res = results(units);
  let cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {} });
  const g = cmp.groups.find((x) => x.word === 'הילדה');
  const b = items.find((i) => i.pathStr === 'b');
  const c = items.find((i) => i.pathStr === 'c');
  const decisions = {
    [g.id]: { form: 'הַיַּלְדָּה', reason: 'dagesh after the article', exceptions: { [wordId(b, 0)]: { form: 'הַיַלְדָּה', reason: 'test exception' } } },
    [wordId(c, 0)]: { form: 'הַיַּלְדָּה', reason: 'word decision beats the group' },
  };
  cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions });
  assert.equal(cmp.finals.get('ui.json#a').forms[0], N('הַיַּלְדָּה'));
  assert.equal(cmp.finals.get('ui.json#b').forms[0], N('הַיַלְדָּה'));
  const via = Object.fromEntries(cmp.disagreements.filter((d) => d.word === 'הילדה').map((d) => [d.path, d.decision.via]));
  assert.deepEqual(via, { a: g.id, b: `${g.id} exception`, c: wordId(c, 0) });
  assert.equal(cmp.groups.find((x) => x.id === g.id).ruling.form, 'הַיַּלְדָּה');
  // no reason → bad decision, member stays unresolved
  cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: { [g.id]: { form: 'הַיַּלְדָּה' } } });
  assert.ok(cmp.badDecisions.some((x) => x.id === g.id && /no reason/.test(x.problem)));
  assert.equal(cmp.finals.get('ui.json#a').status[0], 'unresolved');
  // an exception for a non-member is reported
  cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: { [g.id]: { form: 'הַיַּלְדָּה', reason: 'r', exceptions: { 'w-000000000000': { form: 'הַיַּלְדָּה', reason: 'r' } } } } });
  assert.ok(cmp.badDecisions.some((x) => /not a member/.test(x.problem)));
});

test('groups: a house rule beats a group ruling (house-matched words are never grouped)', () => {
  const { items, units } = setup(UI);
  const res = results(units);
  const g = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: {} }).groups.find((x) => x.word === 'הילדה');
  const { rules } = compileHouseRules({ rules: [{ id: 'h', word: 'הילדה', before: '^$', after: '^ רצה', form: 'הַיַּלְדָּה', reason: 'r' }] });
  const cmp = compare({ items, units, results: res, vocIds: VOC_IDS, decisions: { [g.id]: { form: 'הַיַלְדָּה', reason: 'deliberately different' } }, houseRules: rules });
  assert.equal(cmp.finals.get('ui.json#a').status[0], 'house');
  assert.equal(cmp.finals.get('ui.json#b').forms[0], N('הַיַלְדָּה'));
  assert.equal(cmp.groups.find((x) => x.id === g.id).members.length, 2);
});

test('loadDecisions merges decisions.json with adjudication/*.decisions.json; a conflict is dropped and reported', () => {
  const dir = tmp();
  const adj = path.join(dir, 'adjudication');
  fs.mkdirSync(adj);
  fs.writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify({ 'w-aaaaaaaaaaaa': { form: 'א', reason: 'r' } }));
  fs.writeFileSync(path.join(adj, 'batch-01.decisions.json'), JSON.stringify({ 'g-bbbbbbbbbbbb': { form: 'בַּ', reason: 'r' }, 'g-cccccccccccc': { form: 'כָּ', reason: 'r' } }));
  fs.writeFileSync(path.join(adj, 'batch-02.decisions.json'), JSON.stringify({ 'g-cccccccccccc': { form: 'כְּ', reason: 'r' }, 'g-bbbbbbbbbbbb': { form: 'בַּ', reason: 'same' }, nonsense: {} }));
  const r = loadDecisions(path.join(dir, 'decisions.json'), adj);
  assert.equal(r.files.length, 3);
  assert.deepEqual(Object.keys(r.decisions).sort(), ['g-bbbbbbbbbbbb', 'w-aaaaaaaaaaaa']);
  assert.deepEqual(r.conflicts.map((c) => c.id), ['g-cccccccccccc']);
  assert.equal(r.errors.length, 1);
});

test('writeBatches: one sheet per ~N open groups, every member with its sentence; decisions files untouched', () => {
  const { items, units } = setup(UI);
  const cmp = compare({ items, units, results: results(units), vocIds: VOC_IDS, decisions: {} });
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'batch-01.decisions.json'), '{}');
  fs.writeFileSync(path.join(dir, 'batch-09.md'), 'stale');
  const files = writeBatches({
    dir, groups: cmp.groups, disagreements: cmp.disagreements, finalsByKey: cmp.finals,
    itemsByKey: new Map(items.map((i) => [i.key, i])), vocIds: VOC_IDS, perBatch: 1,
  });
  assert.equal(files.length, 2);
  assert.ok(!fs.existsSync(path.join(dir, 'batch-09.md')));
  assert.ok(fs.existsSync(path.join(dir, 'batch-01.decisions.json')));
  const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const g of cmp.groups) assert.ok(all.includes(g.id));
  assert.ok(all.includes('⟦הילדה⟧ שרה בבית'));
  assert.ok(all.includes(N('⟦הילדה⟧ קָפְצָה')));
});

test('promoteGroup: context-free ruling becomes a house rule; refused with exceptions, other forms or no ruling', () => {
  const dir = tmp();
  const houseFile = path.join(dir, 'house-rules.json');
  fs.writeFileSync(houseFile, '{\n  "rules": [\n    { "id": "x", "word": "של", "form": "שֶׁל", "reason": "r" }\n  ]\n}\n');
  const groupsFile = path.join(dir, 'groups.json');
  const groups = [{ id: 'g-111111111111', word: 'הילדה' }, { id: 'g-222222222222', word: 'בגן' }];
  fs.writeFileSync(groupsFile, JSON.stringify({ only: null, groups, wordForms: { 'הילדה': { [N('הַיַּלְדָּה')]: 3 }, 'בגן': { [N('בַּגַּן')]: 2, [N('בְּגַן')]: 1 } } }));
  const decisions = {
    'g-111111111111': { form: 'הַיַּלְדָּה', reason: 'dagesh after the article' },
    'g-222222222222': { form: 'בַּגַּן', reason: 'definite' },
  };
  assert.match(promoteGroup({ groupId: 'g-222222222222', groupsFile, decisions, houseRulesFile: houseFile }).problem, /also ends up as/);
  assert.match(promoteGroup({ groupId: 'g-333333333333', groupsFile, decisions, houseRulesFile: houseFile }).problem, /not in the last run/);
  const withExc = { ...decisions, 'g-111111111111': { ...decisions['g-111111111111'], exceptions: { 'w-1': { form: 'x', reason: 'r' } } } };
  assert.match(promoteGroup({ groupId: 'g-111111111111', groupsFile, decisions: withExc, houseRulesFile: houseFile }).problem, /exceptions/);
  const ok = promoteGroup({ groupId: 'g-111111111111', groupsFile, decisions, houseRulesFile: houseFile });
  assert.ok(ok.ok, ok.problem);
  const rules = JSON.parse(fs.readFileSync(houseFile, 'utf8')).rules;
  assert.equal(rules.length, 2);
  assert.equal(rules[1].word, 'הילדה');
  assert.equal(rules[1].form, N('הַיַּלְדָּה'));
  assert.deepEqual(compileHouseRules({ rules }).errors, []);
  assert.match(promoteGroup({ groupId: 'g-111111111111', groupsFile, decisions, houseRulesFile: houseFile }).problem, /already exists/);
});
