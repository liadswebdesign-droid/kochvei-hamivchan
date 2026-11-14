// `**bold**` content markup (app/src/lib/rich.js) is non-Hebrew punctuation to the nikud pipeline: it separates
// words (never inside a word token), it stays in the consonant skeleton (a vocalizer that drops or moves it is caught),
// it survives rebuild, and it does not hide a pause from the begadkefat lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenize, words, skeleton, looseSkeleton, parseHints, hintsToWordIndex } from '../lib/hebrew.mjs';
import { formsFor, rebuild } from '../lib/compare.mjs';
import { lintText } from '../lib/lint.mjs';
import { extract, listSourceFiles } from '../lib/extract.mjs';

const N = (s) => s.normalize('NFC');

test('** is a separator: never inside a word token, and concatenation gives the input back', () => {
  const src = 'בגן **אין** חיות, **גם** לא כלב';
  const toks = tokenize(src);
  assert.equal(toks.map((t) => t.text).join(''), src);
  assert.deepEqual(words(src), ['בגן', 'אין', 'חיות', 'גם', 'לא', 'כלב']);
  assert.ok(toks.filter((t) => t.type === 'word').every((t) => !t.text.includes('*')));
  assert.deepEqual(words('**בלי מקום בתבנית**'), ['בלי', 'מקום', 'בתבנית']);
});

test('the skeleton keeps the markers, so a vocalizer that drops or moves them fails the skeleton check', () => {
  const src = 'בגן **אין** חיות';
  assert.equal(skeleton(N('בַּגַּן **אֵין** חַיּוֹת')), src);
  const item = { text: src, words: words(src) };
  const kept = formsFor(item, { raw: N('בַּגַּן **אֵין** חַיּוֹת') });
  assert.equal(kept.skeletonOk, true);
  assert.deepEqual(kept.forms, [N('בַּגַּן'), N('אֵין'), N('חַיּוֹת')]);
  const dropped = formsFor(item, { raw: N('בַּגַּן אֵין חַיּוֹת') });
  assert.equal(dropped.skeletonOk, false); // words still vote, the item is reported as a skeleton error
  const moved = formsFor(item, { raw: N('**בַּגַּן** אֵין חַיּוֹת') });
  assert.equal(moved.skeletonOk, false);
  assert.notEqual(looseSkeleton('**אין** גם'), looseSkeleton('אין **גם**'));
});

test('rebuild puts vocalized words back between the markers', () => {
  const src = 'בגן **אין** חיות';
  assert.equal(rebuild(src, [N('בַּגַּן'), N('אֵין'), N('חַיּוֹת')]), N('בַּגַּן **אֵין** חַיּוֹת'));
});

test('lint: the markers are part of the skeleton check, but not a pause', () => {
  assert.ok(!lintText(N('בַּגַּן **אֵין** חַיּוֹת'), 'בגן **אין** חיות').some((i) => i.rule === 'skeleton'));
  assert.ok(lintText(N('בַּגַּן אֵין חַיּוֹת'), 'בגן **אין** חיות').some((i) => i.rule === 'skeleton'));
  // after a period a word is at a pause even when bold: a missing initial dagesh is an error there, as without bold
  const bold = lintText(N('אֵין חַיּוֹת. **כָל** הַגַּן'), 'אין חיות. **כל** הגן').filter((i) => i.rule === 'begadkefat-initial');
  const plain = lintText(N('אֵין חַיּוֹת. כָל הַגַּן'), 'אין חיות. כל הגן').filter((i) => i.rule === 'begadkefat-initial');
  assert.deepEqual(bold.map((i) => i.level), ['error']);
  assert.deepEqual(plain.map((i) => i.level), ['error']);
  // mid-sentence a bold word is still mid-sentence (warning, not error)
  const mid = lintText(N('אֵין **כָל** הַגַּן'), 'אין **כל** הגן').filter((i) => i.rule === 'begadkefat-initial');
  assert.deepEqual(mid.map((i) => i.level), ['warning']);
});

test('a {{word|hint}} inside bold still covers exactly one word', () => {
  const { text, hints } = parseHints('הילדה קראה **{{ספר|סֵפֶר}}** חדש');
  assert.equal(text, 'הילדה קראה **ספר** חדש');
  const map = hintsToWordIndex(text, hints);
  assert.equal(map.get(2), N('סֵפֶר'));
});

test('extract: bold content keeps its markers in the item text, words come out bare', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nikud-bold-'));
  fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ 'instr.x': 'כתבו מספר **בלי מקום בתבנית**' }));
  const { items, errors } = extract(dir, listSourceFiles(dir));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(errors, []);
  assert.equal(items[0].text, 'כתבו מספר **בלי מקום בתבנית**');
  assert.deepEqual(items[0].words, ['כתבו', 'מספר', 'בלי', 'מקום', 'בתבנית']);
});
