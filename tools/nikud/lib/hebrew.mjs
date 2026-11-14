// Hebrew character model shared by every stage of the nikud pipeline.
//
// "Marks" are the combining points in U+0591–U+05C7 (general category Mn). Four code points in that block are
// NOT marks but punctuation/letters (maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3, nun hafukha U+05C6); they stay in
// the consonant skeleton, so a vocalizer that adds or drops a maqaf is caught.

export const LETTER_RE = /[א-ת]/;
export const MARK_RE = /[֑-ׇֽֿׁׂׅׄ]/;
export const MARKS_G = /[֑-ׇֽֿׁׂׅׄ]/g;
export const BIDI_G = /[‎‏‪-‮⁦-⁩﻿]/g;
export const HEBREW_LETTER_G = /[א-ת]/g;

export const CH = {
  SHEVA: 'ְ', HATAF_SEGOL: 'ֱ', HATAF_PATAH: 'ֲ', HATAF_QAMATS: 'ֳ',
  HIRIQ: 'ִ', TSERE: 'ֵ', SEGOL: 'ֶ', PATAH: 'ַ', QAMATS: 'ָ',
  HOLAM: 'ֹ', HOLAM_HASER_VAV: 'ֺ', QUBUTS: 'ֻ', DAGESH: 'ּ', METEG: 'ֽ',
  MAQAF: '־', RAFE: 'ֿ', SHIN_DOT: 'ׁ', SIN_DOT: 'ׂ', QAMATS_QATAN: 'ׇ',
  GERESH: '׳', GERSHAYIM: '״',
};

// Vowel signs (one per letter at most). Dagesh, shin/sin dots are not vowels.
export const VOWELS = new Set([
  CH.SHEVA, CH.HATAF_SEGOL, CH.HATAF_PATAH, CH.HATAF_QAMATS, CH.HIRIQ, CH.TSERE, CH.SEGOL, CH.PATAH,
  CH.QAMATS, CH.HOLAM, CH.HOLAM_HASER_VAV, CH.QUBUTS, CH.QAMATS_QATAN,
]);
export const FULL_VOWELS = new Set([...VOWELS].filter((v) => v !== CH.SHEVA));
export const HATAFS = new Set([CH.HATAF_SEGOL, CH.HATAF_PATAH, CH.HATAF_QAMATS]);

export const VOWEL_QUALITY = {
  [CH.SHEVA]: 'shva', [CH.HATAF_SEGOL]: 'e', [CH.HATAF_PATAH]: 'a', [CH.HATAF_QAMATS]: 'o',
  [CH.HIRIQ]: 'i', [CH.TSERE]: 'e', [CH.SEGOL]: 'e', [CH.PATAH]: 'a', [CH.QAMATS]: 'a',
  [CH.HOLAM]: 'o', [CH.HOLAM_HASER_VAV]: 'o', [CH.QUBUTS]: 'u', [CH.QAMATS_QATAN]: 'o',
};

export const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export const NON_FINAL_TO_FINAL = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
export const BEGADKEFAT = new Set(['ב', 'ג', 'ד', 'כ', 'פ', 'ת']);
export const GUTTURALS = new Set(['א', 'ה', 'ח', 'ע', 'ר']);

export const hasHebrew = (s) => /[א-ת]/.test(s);
export const hasMarks = (s) => MARK_RE.test(s);

/** Strip every nikud/cantillation mark and bidi control; NFC first. */
export function skeleton(s) {
  return s.normalize('NFC').replace(MARKS_G, '').replace(BIDI_G, '');
}

/** Skeleton for whole-string comparison: also collapses whitespace runs and trims. */
export function looseSkeleton(s) {
  return skeleton(s).replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a vocalizer's output to the house style before comparison:
 *  - NFC (canonical mark order)
 *  - qamats qatan U+05C7 → plain qamats U+05B8 (the Ministry booklet prints כָּל with a plain qamats)
 *  - holam haser for vav U+05BA → plain holam U+05B9
 *  - drop cantillation, meteg, rafe, upper/lower dots, bidi controls
 */
export function normalizeVocalized(s) {
  const base = s
    .normalize('NFC')
    .replace(/\u05C7/g, CH.QAMATS)
    .replace(/\u05BA/g, CH.HOLAM)
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C4\u05C5]/g, '')
    .replace(BIDI_G, '')
    .normalize('NFC');
  return doubledVowelOnFirst(maleVowelsOnVav(base));
}

/**
 * Doubled consonantal וו / יי of ktiv male: the Ministry booklet puts the vowel (and dagesh) on the FIRST letter and
 * leaves the second bare — קַיָּימִים, בָּאֲוִויר (gifted-students-heb-2025.pdf p.2). Dicta does the same; LLMs often mark
 * the second letter (כַּווֶּרֶת). When the first of a pair is bare and the second is marked, move the marks to the first.
 * Not when the second ו is holam male / shuruk (מִצְווֹת: the second ו IS the vowel letter).
 */
export function doubledVowelOnFirst(s) {
  const cs = clusters(s);
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i];
    const b = cs[i + 1];
    if (!a.letter || a.letter !== b.letter || (a.letter !== 'ו' && a.letter !== 'י')) continue;
    if (a.marks.length || !b.marks.length) continue;
    if (b.letter === 'ו' && (b.marks.every((m) => m === CH.HOLAM) || b.marks.every((m) => m === CH.DAGESH))) continue;
    a.marks = b.marks;
    b.marks = [];
    i++;
  }
  return cs.map((c) => (c.letter ? c.letter + c.marks.join('') : c.raw)).join('').normalize('NFC');
}

/**
 * Dicta's ktiv-maleh mode writes holam male as holam on the PREVIOUS letter + a bare ו (בַּבֹּוקֶר, לִפְתֹּור), and
 * likewise qubuts + bare ו. The booklet prints the mark on the ו (בַּבּוֹקֶר, וּ). Move it: X+ֹ followed by a bare ו →
 * X + וֹ; X+ֻ followed by a bare ו → X + וּ. A ו that already carries any mark is a consonant and is left alone.
 */
export function maleVowelsOnVav(s) {
  const chars = [...s];
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if ((c === CH.HOLAM || c === CH.QUBUTS) && out.length) {
      // find the end of this letter's mark run, then the next char must be a bare ו
      let j = i + 1;
      while (j < chars.length && MARK_RE.test(chars[j])) j++;
      // the letter carrying this mark (walk back over marks in `out`)
      let k = out.length - 1;
      while (k >= 0 && MARK_RE.test(out[k])) k--;
      const host = out[k];
      const nextIsBareVav = chars[j] === 'ו' && !(j + 1 < chars.length && MARK_RE.test(chars[j + 1]));
      if (host && host !== 'ו' && LETTER_RE.test(host) && nextIsBareVav) {
        // copy the remaining marks of this letter, then the vav with its vowel
        for (let m = i + 1; m < j; m++) out.push(chars[m]);
        out.push('ו', c === CH.HOLAM ? CH.HOLAM : CH.DAGESH);
        i = j;
        continue;
      }
    }
    out.push(c);
  }
  return out.join('').normalize('NFC');
}

// A word is a run of Hebrew letters and marks. A quote character (', ", ׳, ״) is part of the word only when it sits
// between two Hebrew letters (ג'ירפה, צה"ל). Maqaf, digits, spaces and punctuation separate words.
const WORD_RE = /[א-ת](?:[א-ת֑-ׇֽֿׁׂׅׄ]|['"׳״](?=[א-ת]))*/g;

/** Split text into word and separator tokens (concatenating .text gives back the input). */
export function tokenize(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ type: 'sep', text: text.slice(last, m.index) });
    out.push({ type: 'word', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'sep', text: text.slice(last) });
  return out;
}

export const words = (text) => tokenize(text).filter((t) => t.type === 'word').map((t) => t.text);

/**
 * Split a word into clusters: { letter, marks:Set, raw } — non-letter characters inside a word (geresh) become
 * clusters with letter=null so indices stay meaningful.
 */
export function clusters(word) {
  const out = [];
  for (const ch of word.normalize('NFC')) {
    if (LETTER_RE.test(ch)) out.push({ letter: ch, marks: [], raw: ch });
    else if (MARK_RE.test(ch)) {
      if (!out.length || out[out.length - 1].letter === null) out.push({ letter: null, marks: [ch], raw: ch, stray: true });
      else { out[out.length - 1].marks.push(ch); out[out.length - 1].raw += ch; }
    } else out.push({ letter: null, marks: [], raw: ch });
  }
  return out;
}

export function vowelOf(cluster) {
  const v = cluster.marks.filter((m) => VOWELS.has(m));
  return v.length ? v[0] : null;
}

/** Parse `{{word|vocalized}}` hints. Returns the text with hints replaced by the bare word, plus hint ranges. */
export function parseHints(text) {
  const hints = [];
  let out = '';
  let last = 0;
  const re = /\{\{([^{}|]+)\|([^{}|]+)\}\}/g;
  for (const m of text.matchAll(re)) {
    out += text.slice(last, m.index);
    const start = out.length;
    out += m[1];
    hints.push({ start, end: out.length, word: m[1], form: m[2] });
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  if (/\{\{|\}\}/.test(out)) throw new Error(`malformed {{word|hint}} markup in: ${text}`);
  return { text: out, hints };
}

/** Map hint char ranges onto word indices of the hint-stripped text. Throws if a hint does not cover one whole word. */
export function hintsToWordIndex(text, hints) {
  const map = new Map();
  if (!hints.length) return map;
  const toks = tokenize(text);
  let pos = 0;
  let wi = 0;
  const spans = [];
  for (const t of toks) {
    if (t.type === 'word') spans.push({ wi: wi++, start: pos, end: pos + t.text.length, text: t.text });
    pos += t.text.length;
  }
  for (const h of hints) {
    const span = spans.find((s) => s.start === h.start && s.end === h.end);
    if (!span) throw new Error(`hint {{${h.word}|${h.form}}} must cover exactly one whole word (in: ${text})`);
    if (skeleton(h.form) !== skeleton(h.word)) {
      throw new Error(`hint {{${h.word}|${h.form}}}: the vocalized form has different letters than the word`);
    }
    map.set(span.wi, normalizeVocalized(h.form));
  }
  return map;
}

/**
 * Longest-common-subsequence alignment of two word lists. Returns array aIndex → bIndex|null.
 * Default equality: identical skeletons. Pass `eq(aWord, bWord)` to loosen it.
 */
export function alignWords(a, b, eq) {
  const A = a.map(skeleton);
  const B = b.map(skeleton);
  const same = eq ? (i, j) => A[i] === B[j] || eq(A[i], B[j]) : (i, j) => A[i] === B[j];
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = same(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const map = new Array(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(i, j)) { map[i] = j; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return map;
}

/** True when skeleton `out` is skeleton `src` with only some ו / י deleted (a ktiv-haser rendering of a ktiv-male word). */
export function isMaterDeletion(src, out) {
  if (out.length >= src.length) return false;
  let j = 0;
  for (const ch of src) {
    if (j < out.length && out[j] === ch) j++;
    else if (ch !== 'ו' && ch !== 'י') return false;
  }
  return j === out.length;
}

/**
 * A vocalizer wrote a ktiv-male word in ktiv haser (חֹרֶף for חורף, קַיָּמִים for קיימים). Put the source's matres back
 * without changing any vowel the vocalizer chose: a missing ו takes the holam (→ וֹ) or qubuts (→ וּ) of the letter
 * before it, or is a bare second ו of a doubled consonantal vav; a missing י is bare after hiriq/tsere/segol or after
 * another י. Returns null when the gap cannot be explained that way.
 */
export function restoreMatres(voc, src) {
  const vc = clusters(voc.normalize('NFC')).map((c) => ({ ...c, marks: [...c.marks] }));
  const sk = [...skeleton(src)];
  const out = [];
  let j = 0;
  for (const ch of sk) {
    const c = vc[j];
    if (c && (c.letter ?? c.raw) === ch) { out.push(c); j++; continue; }
    if (ch !== 'ו' && ch !== 'י') return null;
    const prev = out[out.length - 1];
    if (!prev || !prev.letter) return null;
    if (ch === 'ו') {
      const h = prev.marks.indexOf(CH.HOLAM);
      const q = prev.marks.indexOf(CH.QUBUTS);
      if (h >= 0) { prev.marks.splice(h, 1); out.push({ letter: 'ו', marks: [CH.HOLAM] }); continue; }
      if (q >= 0) { prev.marks.splice(q, 1); out.push({ letter: 'ו', marks: [CH.DAGESH] }); continue; }
      if (prev.letter === 'ו') { out.push({ letter: 'ו', marks: [] }); continue; }
      return null;
    }
    const v = vowelOf(prev);
    if (prev.letter === 'י' || v === CH.HIRIQ || v === CH.TSERE || v === CH.SEGOL) { out.push({ letter: 'י', marks: [] }); continue; }
    return null;
  }
  if (j !== vc.length) return null;
  const res = out.map((c) => (c.letter ? c.letter + c.marks.join('') : c.raw)).join('').normalize('NFC');
  return skeleton(res) === skeleton(src) ? res : null;
}
