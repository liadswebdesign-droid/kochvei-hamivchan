#!/usr/bin/env node
// Content validator for content/src/** against content/SCHEMA.md.
//
//   node tools/check-content/validate.mjs            validate everything under content/src
//   node tools/check-content/validate.mjs --quiet    errors + stats only (no warnings)
//   node tools/check-content/validate.mjs <path>     report only one file or folder under content/src
//   node tools/check-content/validate.mjs --src=DIR  validate another tree laid out like content/src (tests)
//
// Exit code 1 when any ERROR is found. Warnings (style guidelines: line length, number ranges, hint leaks…)
// never fail the run.
//
// Checks:
//  - every file: JSON parses; ids unique across ALL banks; 4 distinct options; answer is an index 0–3
//  - every Hebrew field: no nikud marks (U+0591–U+05C7 except maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3,
//    nun hafukha U+05C6), except inside a reading hint {{word|vocalized}} whose skeleton must equal the word;
//    no Latin letters; one-letter prefixes before digits use the maqaf (ב־8, not ב-8 / ב8)
//  - word-problems: eval(check) equals checkValue (number, or array for two-part answers); the number(s) in
//    options[answer] equal checkValue; no other option carries the same number(s)
//  - picture-riddles: known icon ids; brute force every icon over 0–30; the asked icon has exactly one value
//    across all solutions; options[answer] equals it; no Hebrew in the file
//  - passages: structure, line numbering, lineRef in range, quoted text in a stem appears in the cited line(s),
//    line numbers named in a stem ("בשורה 5") are in range and inside lineRef
//  - bonus: id/type/level/stem/options/answer/explain
//  - ui.json: flat { key: Hebrew string }
//  - stats: counts per level and answer-position balance per bank

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const srcArg = args.find((a) => a.startsWith('--src='));
const SRC = srcArg ? path.resolve(srcArg.slice(6)) : path.join(ROOT, 'content/src');
const QUIET = args.includes('--quiet');
const targetArg = args.find((a) => !a.startsWith('--'));

// ---------------------------------------------------------------- Hebrew text model
// Nikud/cantillation marks only (the four punctuation code points of the block are allowed).
const MARK_G = /[֑-ׇֽֿׁׂׅׄ]/g;
const MARK_1 = /[֑-ׇֽֿׁׂׅׄ]/;
const HEB_LETTER = /[א-ת]/;
const LATIN = /[A-Za-z]/;
const HINT_G = /\{\{([^{}|]*)\|([^{}]*)\}\}/g;
const MAQAF = '־';

const ICONS = new Set(['flower', 'star', 'gem', 'key', 'house', 'car', 'sun', 'apple', 'heart', 'moon', 'ball', 'fish']);
const PASSAGE_Q_TYPES = new Set(['detail', 'vocab', 'reference', 'purpose', 'not-answered', 'synonyms', 'inference',
  'why', 'title', 'sequence']);

// ---------------------------------------------------------------- reporting
const errors = [];
const warnings = [];
const stats = [];
let currentFile = '';
const err = (where, msg) => errors.push(`${currentFile} ${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${currentFile} ${where}: ${msg}`);

const allIds = new Map(); // id -> file
function claimId(id, where) {
  if (typeof id !== 'string' || !id.trim()) { err(where, 'missing id'); return; }
  if (allIds.has(id)) err(where, `duplicate id "${id}" (also in ${allIds.get(id)})`);
  else allIds.set(id, currentFile);
}

/** Text rules for one Hebrew field. */
function checkText(str, where, { required = true } = {}) {
  if (typeof str !== 'string') { if (required || str != null) err(where, 'must be a string'); return; }
  if (!str.trim()) { if (required) err(where, 'empty string'); return; }
  // reading hints {{word|vocalized}}
  for (const m of str.matchAll(HINT_G)) {
    const [, word, voc] = m;
    if (MARK_1.test(word)) err(where, `hint word "${word}" must be unvocalized`);
    if (voc.normalize('NFC').replace(MARK_G, '') !== word) err(where, `hint {{${word}|${voc}}}: vocalized form does not match the word`);
  }
  const bare = str.replace(HINT_G, '$1');
  if (/\{\{|\}\}/.test(bare)) err(where, 'malformed {{word|vocalized}} hint');
  const marks = bare.match(MARK_G);
  if (marks) err(where, `contains ${marks.length} nikud mark(s) (U+${marks[0].codePointAt(0).toString(16).toUpperCase()}…): "${clip(bare)}"`);
  // {name}-style interpolation placeholders (ui.json) are code, not text
  const latin = bare.replace(/(?<!\{)\{[A-Za-z_][A-Za-z0-9_]*\}(?!\})/g, '').match(/[A-Za-z]+/);
  if (latin) err(where, `contains Latin letters "${latin[0]}": "${clip(bare)}"`);
  // prefix before digit: ב־8 (maqaf), not ב-8 / ב–8 / ב8
  const badPrefix = bare.match(/[א-ת](?:[-‐‑‒–]|)\d/);
  if (badPrefix) err(where, `prefix before a digit must use the maqaf U+05BE ("${badPrefix[0]}"): "${clip(bare)}"`);
  if (/\s{2,}/.test(bare)) warn(where, 'double space');
  if (bare !== bare.trim()) warn(where, 'leading/trailing whitespace');
  if (/[‎‏‪-‮⁦-⁩﻿]/.test(bare)) warn(where, 'contains bidi control characters');
}
const clip = (s) => (s.length > 70 ? s.slice(0, 70) + '…' : s);

function checkOptions(opts, answer, where, { kind = 'string' } = {}) {
  if (!Array.isArray(opts) || opts.length !== 4) { err(where, `options must be an array of exactly 4 (got ${Array.isArray(opts) ? opts.length : typeof opts})`); return false; }
  if (kind === 'string') opts.forEach((o, i) => checkText(o, `${where}.options[${i}]`));
  if (kind === 'number') opts.forEach((o, i) => { if (!Number.isInteger(o) || o < 0) err(`${where}.options[${i}]`, `must be a non-negative integer (got ${JSON.stringify(o)})`); });
  const norm = opts.map((o) => String(o).replace(/\s+/g, ' ').trim());
  if (new Set(norm).size !== 4) err(where, `options are not distinct: ${JSON.stringify(opts)}`);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) { err(where, `answer must be an integer 0–3 (got ${JSON.stringify(answer)})`); return false; }
  return true;
}

function checkLevel(level, where) {
  if (![1, 2, 3].includes(level)) err(where, `level must be 1, 2 or 3 (got ${JSON.stringify(level)})`);
}

function positionStats(items) {
  const pos = [0, 0, 0, 0];
  for (const it of items) if (Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 4) pos[it.answer]++;
  return pos;
}
function levelStats(items) {
  const lv = {};
  for (const it of items) lv[it.level] = (lv[it.level] || 0) + 1;
  return lv;
}
function balanceNote(pos) {
  const n = pos.reduce((a, b) => a + b, 0);
  if (!n) return '';
  const exp = n / 4;
  const worst = Math.max(...pos.map((p) => Math.abs(p - exp)));
  return worst > Math.max(2, exp * 0.2) ? '  <-- unbalanced' : '';
}
function pushStats(label, items, extra = '') {
  const pos = positionStats(items);
  const lv = levelStats(items);
  stats.push(`${label}: ${items.length} items | levels ${Object.entries(lv).sort().map(([k, v]) => `L${k}=${v}`).join(' ')} | answer positions 0..3 = [${pos.join(', ')}]${balanceNote(pos)}${extra}`);
}

// ---------------------------------------------------------------- word problems
const numbersIn = (s) => (String(s).match(/\d+/g) || []).map(Number);
const sameNums = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function evalCheck(expr) {
  if (typeof expr !== 'string' || !/^[0-9\s+\-*/%().,[\]]+$/.test(expr)) throw new Error('check may only contain digits, + - * / % ( ) [ ] , and spaces');
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${expr});`)();
}

function validateWordProblems(data) {
  if (!Array.isArray(data)) { err('', 'must be a JSON array'); return; }
  const topics = {};
  data.forEach((p, i) => {
    const w = `[${i}] ${p && p.id ? p.id : ''}`.trim();
    if (!p || typeof p !== 'object') { err(w, 'not an object'); return; }
    claimId(p.id, w);
    checkLevel(p.level, w);
    if (typeof p.topic !== 'string' || !p.topic) err(w, 'missing topic');
    else topics[p.topic] = (topics[p.topic] || 0) + 1;
    checkText(p.stem, `${w}.stem`);
    checkText(p.explain, `${w}.explain`);
    checkText(p.hint, `${w}.hint`);
    if (!checkOptions(p.options, p.answer, w)) return;

    // check / checkValue
    let val;
    try { val = evalCheck(p.check); } catch (e) { err(w, `check "${p.check}" failed: ${e.message}`); return; }
    const cv = p.checkValue;
    const cvArr = Array.isArray(cv) ? cv : [cv];
    const valArr = Array.isArray(val) ? val : [val];
    if (!cvArr.every((x) => Number.isFinite(x))) { err(w, `checkValue must be a number or array of numbers (got ${JSON.stringify(cv)})`); return; }
    if (!sameNums(valArr, cvArr) || Array.isArray(val) !== Array.isArray(cv)) err(w, `eval(check) = ${JSON.stringify(val)} but checkValue = ${JSON.stringify(cv)}`);
    if (cvArr.some((x) => !Number.isInteger(x) || x < 0)) err(w, `checkValue must be non-negative integers (got ${JSON.stringify(cv)})`);

    // the right option carries exactly the checkValue number(s); no other option does
    const optNums = p.options.map(numbersIn);
    if (!sameNums(optNums[p.answer], cvArr)) err(w, `options[${p.answer}] "${p.options[p.answer]}" has number(s) ${JSON.stringify(optNums[p.answer])}, expected ${JSON.stringify(cvArr)}`);
    optNums.forEach((ns, k) => {
      if (k !== p.answer && sameNums(ns, cvArr)) err(w, `options[${k}] "${p.options[k]}" also carries the right answer ${JSON.stringify(cvArr)}`);
      if (!ns.length) warn(w, `options[${k}] has no number`);
    });
    const shapes = new Set(optNums.map((ns) => ns.length));
    if (shapes.size > 1) warn(w, 'options carry different counts of numbers');

    // guidelines
    const maxN = p.level === 3 ? 200 : 100;
    const big = numbersIn(p.stem).concat(cvArr).filter((n) => n > maxN);
    if (big.length) warn(w, `number(s) above ${maxN} for level ${p.level}: ${big.join(', ')}`);
    if (typeof p.hint === 'string') {
      const hn = numbersIn(p.hint);
      const leak = cvArr.filter((x) => hn.includes(x) && !numbersIn(p.stem).includes(x));
      if (leak.length) warn(w, `hint mentions the answer number ${leak.join(', ')}`);
    }
  });
  pushStats('word-problems.json', data);
  stats.push(`  topics: ${Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  for (const L of [1, 2, 3]) {
    const sub = data.filter((p) => p.level === L);
    if (sub.length) stats.push(`  L${L} answer positions = [${positionStats(sub).join(', ')}]`);
  }
}

// ---------------------------------------------------------------- picture riddles
function solveRiddle(rows) {
  const icons = [...new Set(rows.flatMap((r) => r.terms))];
  const coef = rows.map((r) => icons.map((ic) => r.terms.filter((t) => t === ic).length));
  const totals = rows.map((r) => r.total);
  const sols = [];
  const vals = new Array(icons.length).fill(0);
  const MAX = 30;
  (function rec(k) {
    if (k === icons.length) {
      for (let r = 0; r < rows.length; r++) {
        let s = 0;
        for (let j = 0; j < icons.length; j++) s += coef[r][j] * vals[j];
        if (s !== totals[r]) return;
      }
      sols.push(Object.fromEntries(icons.map((ic, j) => [ic, vals[j]])));
      return;
    }
    for (let v = 0; v <= MAX; v++) {
      vals[k] = v;
      // prune: a row whose remaining icons are all unassigned can't be checked yet; rows fully assigned can.
      let ok = true;
      for (let r = 0; r < rows.length && ok; r++) {
        let s = 0; let full = true;
        for (let j = 0; j < icons.length; j++) {
          if (coef[r][j] === 0) continue;
          if (j > k) { full = false; break; }
          s += coef[r][j] * vals[j];
        }
        if (s > totals[r] || (full && s !== totals[r])) ok = false;
      }
      if (ok) rec(k + 1);
    }
  })(0);
  return { icons, sols };
}

function validatePictureRiddles(data, raw) {
  if (!Array.isArray(data)) { err('', 'must be a JSON array'); return; }
  if (HEB_LETTER.test(raw)) err('', 'contains Hebrew text (instructions belong in ui.json)');
  let partial = 0;
  data.forEach((r, i) => {
    const w = `[${i}] ${r && r.id ? r.id : ''}`.trim();
    if (!r || typeof r !== 'object') { err(w, 'not an object'); return; }
    claimId(r.id, w);
    checkLevel(r.level, w);
    if (!Array.isArray(r.rows) || r.rows.length < 1) { err(w, 'rows must be a non-empty array'); return; }
    if (r.rows.length < 2) warn(w, 'only one row');
    let bad = false;
    r.rows.forEach((row, k) => {
      if (!row || !Array.isArray(row.terms) || !row.terms.length) { err(`${w}.rows[${k}]`, 'terms must be a non-empty array'); bad = true; return; }
      row.terms.forEach((t) => { if (!ICONS.has(t)) { err(`${w}.rows[${k}]`, `unknown icon "${t}"`); bad = true; } });
      if (!Number.isInteger(row.total) || row.total < 0) { err(`${w}.rows[${k}]`, `total must be a non-negative integer (got ${JSON.stringify(row.total)})`); bad = true; }
    });
    if (bad) return;
    const used = new Set(r.rows.flatMap((x) => x.terms));
    if (!ICONS.has(r.ask) || !used.has(r.ask)) { err(w, `ask "${r.ask}" is not an icon used in the rows`); return; }
    if (used.size > 5) { err(w, `uses ${used.size} different icons (max 5)`); return; }
    if (!checkOptions(r.options, r.answer, w, { kind: 'number' })) return;
    const { icons, sols } = solveRiddle(r.rows);
    if (!sols.length) { err(w, 'no solution with every icon in 0–30'); return; }
    const askVals = [...new Set(sols.map((s) => s[r.ask]))];
    if (askVals.length !== 1) { err(w, `"${r.ask}" is not unique: values ${askVals.slice(0, 6).join(', ')}${askVals.length > 6 ? '…' : ''}`); return; }
    if (r.options[r.answer] !== askVals[0]) err(w, `options[${r.answer}] = ${r.options[r.answer]} but ${r.ask} = ${askVals[0]}`);
    r.options.forEach((o, k) => { if (k !== r.answer && o === askVals[0]) err(w, `options[${k}] also equals the solution`); });
    if (sols.length > 1) { partial++; const free = icons.filter((ic) => new Set(sols.map((s) => s[ic])).size > 1); warn(w, `asked icon is unique, but ${free.join('+')} are not determined (official-style item; fine if intended)`); }
  });
  pushStats('picture-riddles.json', data, partial ? ` | ${partial} with undetermined non-asked icons` : '');
}

// ---------------------------------------------------------------- passages
const QUOTE_CHARS = new Set(['"', '״', '“', '”', '„']);
function quotedSpans(stem) {
  // A quote char between two Hebrew letters is an acronym mark (ש"ח), not a delimiter.
  const delims = [];
  for (let i = 0; i < stem.length; i++) {
    if (!QUOTE_CHARS.has(stem[i])) continue;
    const prev = stem[i - 1] || ''; const next = stem[i + 1] || '';
    if (HEB_LETTER.test(prev) && HEB_LETTER.test(next)) continue;
    delims.push(i);
  }
  const spans = [];
  for (let k = 0; k + 1 < delims.length; k += 2) spans.push(stem.slice(delims[k] + 1, delims[k + 1]));
  return { spans, odd: delims.length % 2 === 1 };
}
const normForMatch = (s) => s.replace(HINT_G, '$1').replace(MARK_G, '')
  .replace(/["״׳'“”„.,!?;:()–—]/g, ' ')
  .replace(/\s+/g, ' ').trim();

function validatePassage(p, fileBase) {
  const w = p && p.id ? p.id : fileBase;
  if (!p || typeof p !== 'object' || Array.isArray(p)) { err('', 'must be a JSON object'); return; }
  claimId(p.id, 'id');
  if (typeof p.id === 'string' && p.id !== fileBase) err('id', `id "${p.id}" does not match file name "${fileBase}.json"`);
  if (!/^(inf|story)-\d{2}$/.test(p.id || '')) warn('id', `id "${p.id}" should be inf-NN or story-NN`);
  if (!['informational', 'story'].includes(p.kind)) err('kind', `must be "informational" or "story" (got ${JSON.stringify(p.kind)})`);
  else if (typeof p.id === 'string' && ((p.kind === 'story') !== p.id.startsWith('story-'))) warn('kind', `kind "${p.kind}" does not match id prefix`);
  checkText(p.title, 'title');
  checkLevel(p.level, 'level');
  if (p.image != null && typeof p.image !== 'string') err('image', 'must be a filename or null');
  if (p.imageCaption != null) checkText(p.imageCaption, 'imageCaption');

  // lines
  const lines = [];
  if (!Array.isArray(p.paragraphs) || !p.paragraphs.length) err('paragraphs', 'must be a non-empty array of arrays');
  else p.paragraphs.forEach((para, pi) => {
    if (!Array.isArray(para) || !para.length) { err(`paragraphs[${pi}]`, 'must be a non-empty array of line strings'); return; }
    para.forEach((ln, li) => {
      lines.push(typeof ln === 'string' ? ln : '');
      const where = `line ${lines.length}`;
      checkText(ln, where);
      if (typeof ln === 'string') {
        const words = ln.replace(HINT_G, '$1').split(/\s+/).filter((x) => HEB_LETTER.test(x) || /\d/.test(x)).length;
        if (words < 6 || words > 12) warn(where, `${words} words (guideline 7–11)`);
      }
    });
  });
  const N = lines.length;
  if (N && (N < 14 || N > 26)) warn('paragraphs', `${N} lines (guideline 14–26)`);

  if (!Array.isArray(p.questions)) { err('questions', 'must be an array'); return; }
  if (p.questions.length < 5 || p.questions.length > 7) warn('questions', `${p.questions.length} questions (guideline 5–7)`);
  const normLines = lines.map(normForMatch);
  p.questions.forEach((q, qi) => {
    const qw = `q[${qi}] ${q && q.id ? q.id : ''}`.trim();
    if (!q || typeof q !== 'object') { err(qw, 'not an object'); return; }
    claimId(q.id, qw);
    if (typeof q.id === 'string' && typeof p.id === 'string' && !q.id.startsWith(`${p.id}-`)) warn(qw, `id should start with "${p.id}-"`);
    if (!PASSAGE_Q_TYPES.has(q.type)) err(qw, `unknown type ${JSON.stringify(q.type)}`);
    checkText(q.stem, `${qw}.stem`);
    checkText(q.explain, `${qw}.explain`);
    checkOptions(q.options, q.answer, qw);

    // lineRef
    let cited = null;
    if (q.lineRef != null) {
      const refs = Array.isArray(q.lineRef) ? q.lineRef : [q.lineRef];
      if (!refs.length || !refs.every((x) => Number.isInteger(x))) err(qw, `lineRef must be an integer or array of integers (got ${JSON.stringify(q.lineRef)})`);
      else {
        refs.forEach((x) => { if (x < 1 || x > N) err(qw, `lineRef ${x} out of range 1–${N}`); });
        cited = refs.length === 2 && refs[0] <= refs[1]
          ? Array.from({ length: refs[1] - refs[0] + 1 }, (_, k) => refs[0] + k)
          : refs.slice();
        cited = cited.filter((x) => x >= 1 && x <= N);
      }
    }
    if (typeof q.stem !== 'string') return;

    // line numbers named in the stem: "בשורה 5", "בשורות 5–6", "בשורות 5 ו־6"
    for (const m of q.stem.matchAll(/שור(?:ה|ות)\s*([0-9]+(?:\s*(?:[-–־]|עד|ו־?|,)\s*[0-9]+)*)/g)) {
      for (const n of numbersIn(m[1])) {
        if (n < 1 || n > N) err(qw, `stem names line ${n}, passage has ${N} lines`);
        else if (!cited) warn(qw, `stem names line ${n} but has no lineRef`);
        else if (!cited.includes(n)) warn(qw, `stem names line ${n}, not in lineRef ${JSON.stringify(q.lineRef)}`);
      }
    }

    // quoted text must appear in the cited line(s)
    const { spans, odd } = quotedSpans(q.stem);
    if (odd) warn(qw, 'unbalanced quote marks in stem');
    for (const span of spans) {
      const parts = span.split(/\.\.\.|…/).map(normForMatch).filter(Boolean);
      if (!parts.length) continue;
      const where = (ln) => parts.every((pt) => ln.includes(pt));
      if (cited && cited.length) {
        const joined = normForMatch(cited.map((x) => lines[x - 1]).join(' '));
        if (!where(joined)) {
          const found = normLines.map((ln, k) => (where(ln) ? k + 1 : 0)).filter(Boolean);
          err(qw, `quoted "${span}" not found in cited line(s) ${JSON.stringify(q.lineRef)}${found.length ? ` (it is on line ${found.join(', ')})` : ' (not found anywhere in the passage)'}`);
        }
      } else {
        const all = normForMatch(lines.join(' '));
        if (!where(all)) err(qw, `quoted "${span}" not found anywhere in the passage`);
        else warn(qw, `quotes "${span}" but has no lineRef`);
      }
    }
  });
  pushStats(`passages/${fileBase}.json`, p.questions.map((q) => ({ ...q, level: p.level })), ` | ${N} lines`);
}

// ---------------------------------------------------------------- bonus
function validateBonus(data, name) {
  if (!Array.isArray(data)) { err('', 'must be a JSON array'); return; }
  const types = {};
  data.forEach((b, i) => {
    const w = `[${i}] ${b && b.id ? b.id : ''}`.trim();
    if (!b || typeof b !== 'object') { err(w, 'not an object'); return; }
    claimId(b.id, w);
    checkLevel(b.level, w);
    if (typeof b.type !== 'string' || !b.type) err(w, 'missing type'); else types[b.type] = (types[b.type] || 0) + 1;
    checkText(b.stem, `${w}.stem`);
    checkText(b.explain, `${w}.explain`);
    checkOptions(b.options, b.answer, w);
  });
  pushStats(`bonus/${name}`, data, ` | types ${Object.entries(types).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

// ---------------------------------------------------------------- ui.json
function validateUi(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) { err('', 'must be a flat JSON object'); return; }
  let n = 0;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('_')) continue; // comment keys (e.g. "_note") are not shown to the child
    n++;
    if (!/^[a-z0-9]+(?:[._-][a-zA-Z0-9]+)*$/.test(k)) warn(k, 'key should be dotted lowercase');
    if (typeof v !== 'string') { err(k, 'value must be a string'); continue; }
    checkText(v, k);
  }
  stats.push(`ui.json: ${n} keys`);
}

// ---------------------------------------------------------------- walk
function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  const st = fs.statSync(dir);
  if (st.isFile()) return dir.endsWith('.json') ? [dir] : [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => (d.isDirectory() ? listJson(path.join(dir, d.name)) : d.name.endsWith('.json') ? [path.join(dir, d.name)] : []));
}

const target = targetArg ? path.resolve(targetArg) : SRC;
if (!fs.existsSync(SRC)) { console.error(`content/src not found at ${SRC}`); process.exit(1); }
// ids are unique across all banks, so always load everything; report only for the target
const files = listJson(SRC);
let checked = 0;
for (const file of files) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  currentFile = rel;
  let raw; let data;
  try { raw = fs.readFileSync(file, 'utf8'); data = JSON.parse(raw); } catch (e) { err('', `JSON parse error: ${e.message}`); continue; }
  if (raw.charCodeAt(0) === 0xFEFF) warn('', 'file starts with a BOM');
  checked++;
  if (rel === 'word-problems.json') validateWordProblems(data);
  else if (rel === 'picture-riddles.json') validatePictureRiddles(data, raw);
  else if (rel === 'ui.json') validateUi(data);
  else if (rel.startsWith('passages/')) validatePassage(data, path.basename(rel, '.json'));
  else if (rel.startsWith('bonus/')) validateBonus(data, path.basename(rel));
  else warn('', 'unknown file (not in SCHEMA.md); skipped');
}

const inTarget = (line) => {
  if (target === SRC) return true;
  const rel = path.relative(SRC, target).split(path.sep).join('/');
  return line.startsWith(rel);
};
const E = errors.filter(inTarget);
const W = warnings.filter(inTarget);
const S = stats;

console.log(`check-content: ${checked} file(s) under content/src`);
console.log('\n== stats ==');
S.forEach((s) => console.log(s));
if (!QUIET && W.length) { console.log(`\n== ${W.length} warning(s) ==`); W.forEach((x) => console.log('  warn  ' + x)); }
if (E.length) { console.log(`\n== ${E.length} ERROR(S) ==`); E.forEach((x) => console.log('  ERROR ' + x)); }
console.log(`\n${E.length ? 'FAIL' : 'OK'}: ${E.length} error(s), ${W.length} warning(s)`);
process.exit(E.length ? 1 : 0);
