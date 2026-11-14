// Every lint rule: words that must pass clean, and words that must trigger exactly that rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintWord, lintText, RULES } from '../lib/lint.mjs';

const rulesOf = (w, opts) => lintWord(w.normalize('NFC'), opts).map((i) => `${i.rule}:${i.level}`);
const clean = (w, opts) => assert.deepEqual(rulesOf(w, opts), [], `expected ${w} to be clean`);
const flags = (w, rule, level, opts) => {
  const got = rulesOf(w, opts);
  assert.ok(got.includes(`${rule}:${level}`), `expected ${w} to raise ${rule}:${level}, got [${got.join(', ')}]`);
};

test('good booklet-style words are clean', () => {
  for (const w of [
    'שָׁלוֹם', 'כָּל', 'רֵיחַ', 'מֵידָע', 'צְרִיכִים', 'מְאוֹד', 'לְךָ', 'שֶׁלָּךְ', 'הַחַיּוֹת', 'סֵפֶר', 'שָׂמְחוּ',
    'הַיְלָדִים', 'בַּיִת', 'אֲנִי', 'חַי', 'תִּקְוָוה', 'עִנְיָין', 'וּבַיִת', 'לוּחַ', 'גָּבוֹהַּ', 'אַתְּ', 'הַשֶּׁמֶשׁ',
    'רֹאשׁ', 'קָרְאָה', 'עָלָיו', 'מֵעָלָיו', 'הָאִישׁ', 'יָדוּעַ', 'שׁוּק', 'לוֹ', 'הַגַּן', 'מֶלֶךְ', 'סִיפּוּר', 'צִוּוּי', 'אֱמֶת', 'צָהֳרַיִים',
  ]) clean(w, { atPause: true });
});

test('stray-mark', () => { flags('ָשָׁלוֹם', 'stray-mark', 'error'); });
test('forbidden-mark', () => {
  flags('כׇּל', 'forbidden-mark', 'error');
  flags('כָּֽל', 'forbidden-mark', 'error');
});
test('double-mark', () => {
  flags('שָׁלָָום', 'double-mark', 'error');
  flags('בָּֿ', 'forbidden-mark', 'error');
  flags('שַׁלְִום', 'double-mark', 'error');
  flags('שׁׂם', 'double-mark', 'error');
});
test('dot-on-non-shin', () => { flags('סׁפֶר', 'dot-on-non-shin', 'error'); clean('שִׂים'); });
test('shin-dot', () => { flags('שָלוֹם', 'shin-dot', 'error'); clean('שָׁלוֹם'); clean('שָׂדֶה'); });
test('final-form', () => {
  flags('שָׁלוֹמ', 'final-form', 'error');
  flags('מֶלֶךְְים', 'final-form', 'error');
  flags('סְפָרִים'.replace('ם', 'מ'), 'final-form', 'error');
  clean('צִ\'יפְּס', { atPause: true }); // geresh after a letter: no false alarm
});
test('final-kaf', () => {
  flags('לְך', 'final-kaf', 'error');
  flags('שֶׁלָּך', 'final-kaf', 'error');
  clean('לְךָ'); clean('שֶׁלָּךְ');
});
test('unvocalized-word', () => { flags('ספר', 'unvocalized-word', 'error'); });
test('bare-letter', () => {
  flags('מִסְפר', 'bare-letter', 'error'); // פ inside the word with nothing
  clean('מִסְפָּר');
});
test('bare-initial', () => { flags('ספֶר', 'bare-initial', 'error'); clean('סֵפֶר'); });
test('patach-gnuva', () => {
  flags('רֵיח', 'patach-gnuva', 'error');
  flags('הָרוּח', 'patach-gnuva', 'error');
  flags('פּוֹתֵחַ'.replace('ַ', ''), 'patach-gnuva', 'error');
  flags('יָדוּע', 'patach-gnuva', 'error');
  clean('רֵיחַ'); clean('הַפֶּרַח'); clean('וְשָׁמַע'); clean('שָׁלַח');
});
test('begadkefat-initial', () => {
  flags('כָל', 'begadkefat-initial', 'error', { atPause: true });
  flags('כָל', 'begadkefat-initial', 'warning', { atPause: false });
  flags('בַיִת', 'begadkefat-initial', 'error', { atPause: true });
  clean('כָּל', { atPause: true });
  clean('גִ\'ירָפָה', { atPause: true }); // ג' (dj) takes no dagesh
});
test('double-holam', () => { flags('לֹוֹ'.normalize('NFC'), 'double-holam', 'error'); });
test('bare-vav (warning)', () => { flags('מַורִיד', 'bare-vav', 'warning'); flags('קַוְר'.replace('ְ', ''), 'bare-vav', 'warning'); });
test('bare-yod (warning)', () => { flags('בַּירָה'.replace('ּ', 'ּ'), 'bare-yod', 'warning'); clean('מֵידָע'); clean('סִיפּוּר'); });
test('bare-he (warning)', () => { flags('מַהלָךְ', 'bare-he', 'warning'); });
test('vav-holam-after-vowel (warning)', () => { flags('מָוֹת', 'vav-holam-after-vowel', 'warning'); clean('מְאוֹד'); });
test('shuruk-after-vowel (warning)', () => { flags('קָוּם', 'shuruk-after-vowel', 'warning'); clean('צִוּוּי'); });
test('article-dagesh', () => {
  flags('הַיֶלֶד', 'article-dagesh', 'error');
  flags('הַיַלְדָּה', 'article-dagesh', 'error');
  flags('הַיוֹם', 'article-dagesh', 'warning'); // vowel only via holam male: could be הַמוֹן-type root ה
  clean('הַיֶּלֶד'); clean('הַיְלָדִים'); clean('הַחַיּוֹת'); clean('הַיּוֹם'); clean('הַוִּילוֹן');
});
test('hataf-non-guttural (warning)', () => { flags('בֲּיִת', 'hataf-non-guttural', 'warning'); });
test('initial-guttural-sheva (warning)', () => { flags('אְנִי', 'initial-guttural-sheva', 'warning'); clean('אֲנִי'); });
test('final-sheva (warning)', () => { flags('שָׁלוֹםְ', 'final-sheva', 'warning'); clean('אַתְּ'); clean('מֶלֶךְ'); });
test('dagesh-guttural (warning)', () => { flags('הָאּישׁ', 'dagesh-guttural', 'warning'); clean('גָּבוֹהַּ'); });

test('lintText: pause detection and skeleton check', () => {
  const t = 'כָל הַחַיּוֹת. בַּגַּן כָל';
  const issues = lintText(t.normalize('NFC'), 'כל החיות. בגן כל');
  const bg = issues.filter((i) => i.rule === 'begadkefat-initial');
  assert.equal(bg.length, 2);
  assert.equal(bg[0].level, 'error'); // first word of the text
  assert.equal(bg[1].level, 'warning'); // mid-sentence
  assert.ok(lintText('כָּל', 'כול').some((i) => i.rule === 'skeleton'));
  assert.ok(!lintText('כָּל', 'כל').some((i) => i.rule === 'skeleton'));
});

test('every rule has a description', () => { for (const r of Object.keys(RULES)) assert.ok(RULES[r]); });
