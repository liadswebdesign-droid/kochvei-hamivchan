import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  skeleton, looseSkeleton, normalizeVocalized, tokenize, words, parseHints, hintsToWordIndex, alignWords, maleVowelsOnVav,
} from '../lib/hebrew.mjs';
import { parseUnitsReply, batchUnits } from '../lib/prompt.mjs';
import { parseDictaTokens } from '../lib/adapters/dicta.mjs';

const N = (s) => s.normalize('NFC');

test('skeleton strips marks but keeps maqaf, punctuation, digits', () => {
  assert.equal(skeleton('בְּ־8 שָׁלוֹם!'), 'ב־8 שלום!');
  assert.equal(looseSkeleton('  כָּל   הַחַיּוֹת '), 'כל החיות');
  assert.notEqual(skeleton('בבקר'), skeleton('בבוקר')); // a dropped mater is a skeleton change
});

test('normalizeVocalized: house style', () => {
  assert.equal(normalizeVocalized('כׇּל'), N('כָּל')); // qamats qatan → plain qamats
  assert.equal(normalizeVocalized('כָּֽל'), N('כָּל')); // meteg dropped
  assert.equal(normalizeVocalized('‏שָׁלוֹם'), N('שָׁלוֹם')); // bidi mark dropped
});

test('maleVowelsOnVav: Dicta holam/qubuts before a bare vav move onto the vav', () => {
  assert.equal(maleVowelsOnVav(N('בַּבֹּוקֶר')), N('בַּבּוֹקֶר'));
  assert.equal(maleVowelsOnVav(N('לִפְתֹּור')), N('לִפְתּוֹר'));
  assert.equal(maleVowelsOnVav(N('שֹׁומֵר')), N('שׁוֹמֵר'));
  assert.equal(maleVowelsOnVav(N('בְּבֻוקֵּר')), N('בְּבוּקֵּר'));
  // untouched: already on the vav, consonantal vav with its own vowel, holam haser with no vav
  for (const w of ['בַּבּוֹקֶר', 'מִצְוָה', 'מֹשֶׁה', 'לֹא', 'מָוֶת', 'עָוֹן']) assert.equal(maleVowelsOnVav(N(w)), N(w));
});

test('tokenize keeps everything and splits on maqaf; geresh inside words', () => {
  const t = 'בְּ־8 ג\'ירפה, צה"ל.';
  assert.equal(tokenize(t).map((x) => x.text).join(''), t);
  assert.deepEqual(words(t), ['בְּ', 'ג\'ירפה', 'צה"ל']);
});

test('hints: parsed, mapped to a whole word, letters checked', () => {
  const p = parseHints('מה קראה? {{ספר|סֵפֶר}}');
  assert.equal(p.text, 'מה קראה? ספר');
  const m = hintsToWordIndex(p.text, p.hints);
  assert.equal(m.get(2), N('סֵפֶר'));
  assert.throws(() => hintsToWordIndex(parseHints('{{ספר|סִפֵּר}}ים').text, parseHints('{{ספר|סִפֵּר}}ים').hints), /whole word/);
  assert.throws(() => hintsToWordIndex('ספר', parseHints('{{ספר|סִיפֵּר}}').hints), /different letters/);
  assert.throws(() => parseHints('{{ספר}}'), /malformed/);
});

test('alignWords tolerates a dropped/changed word', () => {
  assert.deepEqual(alignWords(['כל', 'החיות', 'בגן'], ['כָּל', 'בַּגַּן']), [0, null, 1]);
  assert.deepEqual(alignWords(['בבוקר', 'טוב'], ['בַּבֹּקֶר', 'טוֹב']), [null, 1]);
});

test('parseUnitsReply: plain, fenced, with chatter', () => {
  const body = '{"units":[{"id":"a","items":["כָּל"]}]}';
  for (const r of [body, '```json\n' + body + '\n```', 'Here you go:\n' + body + '\nDone.']) {
    assert.deepEqual(parseUnitsReply(r).get('a'), ['כָּל']);
  }
  assert.throws(() => parseUnitsReply('no json here'), /could not parse/);
});

test('batchUnits never splits a unit and respects the size', () => {
  const u = (n) => ({ items: [{ text: 'א'.repeat(n) }] });
  const b = batchUnits([u(10), u(10), u(30), u(5)], 25);
  assert.deepEqual(b.map((x) => x.length), [2, 1, 1]);
});

test('parseDictaTokens: top option, | stripped, separators skipped', () => {
  const data = [
    { str: 'הילדה', sep: false, nakdan: { options: [{ w: 'הַ|יַּלְדָּה' }, { w: 'הַ|יְּלֻדָּה' }], fconfident: true } },
    { str: ' ', sep: true, nakdan: { options: [] } },
    { str: 'כל', sep: false, nakdan: { options: [{ w: 'כׇּל' }] } },
  ];
  const out = parseDictaTokens(data);
  assert.equal(out.length, 2);
  assert.equal(out[0].form, N('הַיַּלְדָּה'));
  assert.equal(out[0].confident, true);
  assert.equal(out[1].form, N('כָּל'));
});

test('doubledVowelOnFirst: booklet puts the vowel on the first of a doubled וו/יי', async () => {
  const { doubledVowelOnFirst } = await import('../lib/hebrew.mjs');
  assert.equal(doubledVowelOnFirst(N('כַּווֶּרֶת')), N('כַּוֶּורֶת'));
  assert.equal(doubledVowelOnFirst(N('חִייְּכָה')), N('חִיְּיכָה'));
  assert.equal(doubledVowelOnFirst(N('עֲייֵפָה')), N('עֲיֵיפָה'));
  assert.equal(doubledVowelOnFirst(N('בָּאֲווִיר')), N('בָּאֲוִויר'));
  // untouched: already first, second vav is holam male / shuruk, across a space
  for (const w of ['קַיָּימִים', 'מִצְווֹת', 'קַוּוּ', 'שׁוֹוִי', 'הָיִינוּ', 'כִּי יֵשׁ']) assert.equal(doubledVowelOnFirst(N(w)), N(w));
  assert.equal(normalizeVocalized('וְהַכַּווֶּרֶת'), N('וְהַכַּוֶּורֶת'));
});

test('restoreMatres: ktiv-haser output is lifted to the source ktiv male without changing its vowels', async () => {
  const { restoreMatres, isMaterDeletion } = await import('../lib/hebrew.mjs');
  const cases = [
    ['חֹרֶף', 'חורף', 'חוֹרֶף'],
    ['בַּבֹּקֶר', 'בבוקר', 'בַּבּוֹקֶר'],
    ['כֻּלּוֹ', 'כולו', 'כּוּלּוֹ'],
    ['קַיָּמִים', 'קיימים', 'קַיָּימִים'],
    ['כַּוֶּרֶת', 'כוורת', 'כַּוֶּורֶת'],
    ['מִצְוֹת', 'מצוות', 'מִצְווֹת'],
    ['חִפַּשְׂתִּי', 'חיפשתי', 'חִיפַּשְׂתִּי'],
    ['מֵדָע', 'מידע', 'מֵידָע'],
    ['שַׁיָּךְ', 'שייך', 'שַׁיָּיךְ'],
  ];
  for (const [voc, src, want] of cases) assert.equal(restoreMatres(N(voc), src), N(want), `${voc} → ${want}`);
  assert.equal(restoreMatres(N('בַּבֹּקֶר'), 'בבוקרים'), null); // a missing non-mater letter is not repairable
  assert.equal(restoreMatres(N('סְפָר'), 'סיפר'), null); // a י after sheva is not a mater of that vowel
  assert.ok(isMaterDeletion('בבוקר', 'בבקר'));
  assert.ok(!isMaterDeletion('בבוקר', 'בוקר'));
});
