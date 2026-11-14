// Stage 5: mechanical nikud lint over the BUILD output. Errors fail the build; warnings go to the report.
// Every rule has good/bad examples in tools/nikud/test/lint.test.mjs.
import {
  CH, clusters, vowelOf, VOWEL_QUALITY, HATAFS, FINALS, NON_FINAL_TO_FINAL, BEGADKEFAT, GUTTURALS, VOWELS,
  tokenize, looseSkeleton,
} from './hebrew.mjs';

export const RULES = {
  'stray-mark': 'a nikud mark that is not on a letter',
  'forbidden-mark': 'cantillation, meteg, rafe, U+05C7 or U+05BA in the output (house style uses none of them)',
  'double-mark': 'the same mark twice on a letter, two vowels on one letter, or both shin and sin dot',
  'dot-on-non-shin': 'a shin/sin dot on a letter other than ש',
  'shin-dot': 'ש without a shin or sin dot',
  'final-form': 'a final letter (ךםןףץ) inside a word, or a non-final כמנפצ at the end of a word',
  'final-kaf': 'word-final ך without sheva (ךְ) or kamatz (ךָ)',
  'unvocalized-word': 'a Hebrew word with no nikud at all',
  'bare-letter': 'a letter inside the word with neither a vowel nor sheva (and not a silent mater)',
  'bare-initial': 'the first letter of a word has no vowel',
  'patach-gnuva': 'word-final ח / ע / הּ after a non-"a" vowel without patach gnuva',
  'begadkefat-initial': 'בגדכפת at the start of a word without dagesh (error after a pause, warning mid-sentence)',
  'double-holam': 'holam on a letter that is followed by holam male (וֹ)',
  'bare-vav': 'a silent ו inside a word that is not next to another ו (suspicious mater)',
  'bare-yod': 'a silent י that does not follow i/e and is not doubled (suspicious mater)',
  'bare-he': 'a silent ה inside a word',
  'vav-holam-after-vowel': 'וֹ after a letter that already has a vowel (consonantal vav + holam?)',
  'shuruk-after-vowel': 'וּ after a letter that already has a vowel (dagesh in consonantal vav with no vowel?)',
  'article-dagesh': 'הַ + non-guttural letter with a full vowel and no dagesh (missing dagesh after the article?)',
  'hataf-non-guttural': 'hataf vowel under a non-guttural letter',
  'initial-guttural-sheva': 'word-initial guttural with plain sheva (usually a hataf)',
  'final-sheva': 'word-final letter with sheva other than ך / ת',
  'dagesh-guttural': 'dagesh in א ח ע ר (or in ה inside a word)',
  'skeleton': 'the build output letters/punctuation differ from the source',
};

const isVav = (c) => c && c.letter === 'ו';
const has = (c, m) => c && c.marks.includes(m);
const onlyMarks = (c, list) => c && c.marks.length > 0 && c.marks.every((m) => list.includes(m));
const holamMale = (c) => isVav(c) && onlyMarks(c, [CH.HOLAM]);
const shuruk = (c) => isVav(c) && onlyMarks(c, [CH.DAGESH]);

/**
 * Lint one vocalized word.
 * @param {string} word
 * @param {{atPause?: boolean}} opts atPause: the word starts the text or follows punctuation
 * @returns {{rule, level, msg}[]}
 */
export function lintWord(word, { atPause = false } = {}) {
  const issues = [];
  const add = (rule, level, msg) => issues.push({ rule, level, msg: msg || RULES[rule] });
  const all = clusters(word);
  if (all.some((c) => c.stray)) add('stray-mark', 'error');
  if (/[֑-ׇֺֽֿׅ֯ׄ]/.test(word)) add('forbidden-mark', 'error');
  // letter clusters, with a flag when a geresh/apostrophe follows the letter (ג'ירפה, צ'יפס)
  const cs = [];
  all.forEach((c, i) => {
    if (c.letter) cs.push({ ...c, geresh: !!all[i + 1] && /^['׳]$/.test(all[i + 1].raw) });
  });
  if (!cs.length) return issues;
  if (!cs.some((c) => c.marks.length)) { add('unvocalized-word', 'error'); return issues; }
  const last = cs.length - 1;

  cs.forEach((c, i) => {
    const prev = cs[i - 1];
    const next = cs[i + 1];
    const vowels = c.marks.filter((m) => VOWELS.has(m));
    const v = vowels[0] || null;
    // marks
    if (new Set(c.marks).size !== c.marks.length || vowels.length > 1 || (has(c, CH.SHIN_DOT) && has(c, CH.SIN_DOT))) {
      add('double-mark', 'error', `${RULES['double-mark']} (letter ${i + 1}: ${c.raw})`);
    }
    if (c.letter !== 'ש' && (has(c, CH.SHIN_DOT) || has(c, CH.SIN_DOT))) add('dot-on-non-shin', 'error');
    if (c.letter === 'ש' && !has(c, CH.SHIN_DOT) && !has(c, CH.SIN_DOT)) add('shin-dot', 'error');
    // final forms
    if (FINALS[c.letter] && i < last) add('final-form', 'error', `final ${c.letter} inside the word`);
    // a one-letter word is a prefix before a maqaf (כְּ־10) or a letter name (כִּיתָּה כ), never a final form
    if (NON_FINAL_TO_FINAL[c.letter] && i === last && last > 0 && !c.geresh) add('final-form', 'error', `non-final ${c.letter} at the end of the word`);
    if (c.letter === 'ך' && v !== CH.SHEVA && v !== CH.QAMATS) add('final-kaf', 'error');
    // gutturals and hatafs
    if (has(c, CH.DAGESH) && (['א', 'ח', 'ע', 'ר'].includes(c.letter) || (c.letter === 'ה' && i < last))) add('dagesh-guttural', 'warning');
    if (v && HATAFS.has(v) && !['א', 'ה', 'ח', 'ע'].includes(c.letter)) add('hataf-non-guttural', 'warning', `${RULES['hataf-non-guttural']} (${c.raw})`);
    if (i === 0 && v === CH.SHEVA && ['א', 'ה', 'ח', 'ע'].includes(c.letter)) add('initial-guttural-sheva', 'warning');
    if (i === last && i > 0 && v === CH.SHEVA && c.letter !== 'ך' && c.letter !== 'ת') add('final-sheva', 'warning');
    // vav as a vowel letter
    if (holamMale(c) && i > 0) {
      if (prev && has(prev, CH.HOLAM)) add('double-holam', 'error');
      else if (prev && vowelOf(prev) && !isVav(prev)) add('vav-holam-after-vowel', 'warning');
    }
    if (shuruk(c) && i > 0 && prev && vowelOf(prev) && !isVav(next)) add('shuruk-after-vowel', 'warning');

    // does this letter carry (or get via a following mater) a vowel?
    const selfVowel = !!v || holamMale(c) || shuruk(c) || (c.letter === 'ה' && i === last && has(c, CH.DAGESH));
    const viaMater = holamMale(next) || shuruk(next);
    if (selfVowel || viaMater) return;
    if (i === last) return; // word-final consonant or silent mater: fine (ך handled above)
    if (i === 0) { add('bare-initial', 'error', `${RULES['bare-initial']} (${c.raw})`); return; }
    if (c.letter === 'א') return; // quiescent alef (רֹאשׁ, מְאוֹד, קוֹרְאִים)
    if (c.letter === 'ו') { if (!isVav(prev) && !isVav(next)) add('bare-vav', 'warning'); return; }
    if (c.letter === 'י') {
      const pq = prev && VOWEL_QUALITY[vowelOf(prev)];
      const suffixAv = vowelOf(prev) === CH.QAMATS && next?.letter === 'ו' && i + 1 === last && !next.marks.length; // עָלָיו, יָדָיו
      if (!(pq === 'i' || pq === 'e' || prev?.letter === 'י' || next?.letter === 'י' || suffixAv)) add('bare-yod', 'warning');
      return;
    }
    if (c.letter === 'ה') { add('bare-he', 'warning'); return; }
    add('bare-letter', 'error', `${RULES['bare-letter']} (letter ${i + 1}: ${c.raw})`);
  });

  // patach gnuva
  const fin = cs[last];
  if (last > 0 && (fin.letter === 'ח' || fin.letter === 'ע' || (fin.letter === 'ה' && has(fin, CH.DAGESH))) && !vowelOf(fin)) {
    let q = null;
    for (let j = last - 1; j >= 0; j--) {
      const c = cs[j];
      if (holamMale(c)) { q = 'o'; break; }
      if (shuruk(c)) { q = 'u'; break; }
      const v = vowelOf(c);
      if (v) { q = VOWEL_QUALITY[v]; break; }
      if (['י', 'א', 'ה', 'ו'].includes(c.letter)) continue;
      break;
    }
    if (q && q !== 'a' && q !== 'shva') add('patach-gnuva', 'error', `${RULES['patach-gnuva']} (vowel before it: ${q})`);
  }
  // begadkefat at word start
  const first = cs[0];
  if (BEGADKEFAT.has(first.letter) && !has(first, CH.DAGESH) && !first.geresh) {
    add('begadkefat-initial', atPause ? 'error' : 'warning', `${first.letter} at the start of the word without dagesh${atPause ? ' after a pause' : ''}`);
  }
  // dagesh after the definite article
  if (cs.length >= 3 && first.letter === 'ה' && vowelOf(first) === CH.PATAH) {
    const s = cs[1];
    const sv = vowelOf(s);
    // own full vowel and no dagesh → error (הַיַלְדָּה); vowel only via a following וֹ/וּ → warning (הַמוֹן is a real word)
    const viaMater = !sv && (holamMale(cs[2]) || shuruk(cs[2]));
    if (!GUTTURALS.has(s.letter) && !has(s, CH.DAGESH) && !isVav(s) && ((sv && sv !== CH.SHEVA) || viaMater)) {
      add('article-dagesh', viaMater ? 'warning' : 'error');
    }
  }
  return issues;
}

const PAUSE_RE = /[.!?:;,()"״«»\n–—-]\s*$/;

/** Lint a whole vocalized string. Returns issues with the word index and word. */
export function lintText(text, source) {
  const issues = [];
  if (source !== undefined && looseSkeleton(text) !== looseSkeleton(source)) {
    issues.push({ rule: 'skeleton', level: 'error', msg: RULES.skeleton, wordIndex: -1, word: '' });
  }
  const toks = tokenize(text);
  let wi = 0;
  let prevSep = '';
  let seenWord = false;
  for (const t of toks) {
    if (t.type === 'sep') { prevSep += t.text; continue; }
    // after a digit/maqaf the "word" is glued to a number (בְּ־8 has the word before the maqaf), keep simple:
    const atPause = !seenWord ? !/[0-9A-Za-z]\s*$/.test(prevSep) : PAUSE_RE.test(prevSep);
    for (const iss of lintWord(t.text, { atPause })) issues.push({ ...iss, wordIndex: wi, word: t.text });
    wi++;
    seenWord = true;
    prevSep = '';
  }
  return issues;
}
