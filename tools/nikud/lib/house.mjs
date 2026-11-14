// House rules: a 5th, overriding vote applied before the 3-way comparison (precedence: decision > house rule > vote).
// content/nikud/house-rules.json → { "rules": [ rule, … ] } where a rule is
//   { id, word: "מה",            form: "מָה",               before?, after?, reason, source? }
//   { id, wordRe: "^[בלכ]$",     forms: { "ב": "בְּ", … },  before?, after?, reason, source? }
// word / wordRe match the WHOLE bare word (skeleton, hints stripped). before / after are regexes tested against
// the bare item text before / after the word (so `after: "^־\\d"` = "followed by a maqaf and a digit").
// The first matching rule wins; put context rules before context-free ones. A matched word is decided by the rule:
// it never reaches disagreements.json, but it is still skeleton-checked and linted like every other word.
// Where fewer than half of the vocalizers wrote the rule form, compare() lists the word in house.overrides (review page
// card) unless the rule says "expectDissent": true (a deliberate rule known to go against some vocalizers).
import fs from 'node:fs';
import { hasMarks, normalizeVocalized, skeleton, tokenize } from './hebrew.mjs';
import { lintWord } from './lint.mjs';

function compileRe(src, where, errors, id) {
  if (src === undefined || src === null || src === '') return null;
  try { return new RegExp(src, 'u'); } catch (e) { errors.push({ id, problem: `${where} is not a valid regex: ${e.message}` }); return null; }
}

/** Validate and compile raw rules. Returns { rules, errors }; any error blocks the build. */
export function compileHouseRules(raw) {
  const list = Array.isArray(raw) ? raw : raw?.rules;
  const errors = [];
  const rules = [];
  if (!Array.isArray(list)) return { rules, errors: [{ id: null, problem: 'house rules must be an array or { rules: [...] }' }] };
  const ids = new Set();
  const contextFree = new Map(); // bare word → rule id, to catch two context-free rules for one word
  list.forEach((r, n) => {
    const id = r?.id || `#${n}`;
    const bad = (problem) => errors.push({ id, problem });
    if (!r || typeof r !== 'object') return bad('rule is not an object');
    if (!r.id) bad('missing id');
    else if (ids.has(r.id)) bad('duplicate id');
    ids.add(r.id);
    if (!r.reason || typeof r.reason !== 'string') bad('missing reason');
    if (!!r.word === !!r.wordRe) return bad('give exactly one of "word" or "wordRe"');
    const before = compileRe(r.before, 'before', errors, id);
    const after = compileRe(r.after, 'after', errors, id);
    const forms = new Map(); // bare word → vocalized form
    if (r.word) {
      if (hasMarks(r.word) || /\s/.test(r.word)) return bad('"word" must be one bare word (no nikud, no spaces)');
      if (typeof r.form !== 'string') return bad('"word" rules need a "form"');
      forms.set(r.word, r.form);
    } else {
      if (!r.forms || typeof r.forms !== 'object') return bad('"wordRe" rules need a "forms" map { bare: vocalized }');
      for (const [w, f] of Object.entries(r.forms)) forms.set(w, f);
    }
    const wordRe = r.wordRe ? compileRe(r.wordRe, 'wordRe', errors, id) : null;
    if (r.wordRe && !wordRe) return;
    const allow = new Set(r.lintAllow || []);
    for (const [w, f] of forms) {
      const form = normalizeVocalized(String(f));
      if (skeleton(form) !== w) { bad(`form ${f} has different letters than ${w}`); continue; }
      if (wordRe && !wordRe.test(w)) bad(`forms key ${w} does not match wordRe`);
      for (const iss of lintWord(form, { atPause: true })) {
        if (iss.level === 'error' && !allow.has(iss.rule)) bad(`form ${f} fails lint [${iss.rule}]`);
      }
      forms.set(w, form);
    }
    if (!before && !after) {
      for (const w of forms.keys()) {
        if (contextFree.has(w)) bad(`second context-free rule for ${w} (first: ${contextFree.get(w)})`);
        else contextFree.set(w, id);
      }
    }
    rules.push({ id, word: r.word || null, wordRe, forms, before, after, reason: r.reason, source: r.source || '', expectDissent: !!r.expectDissent });
  });
  return { rules, errors };
}

export function loadHouseRules(file) {
  if (!file || !fs.existsSync(file)) return { rules: [], errors: [], missing: true };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { rules: [], errors: [{ id: null, problem: `cannot parse ${file}: ${e.message}` }] }; }
  return compileHouseRules(raw);
}

/** Bare text before / after each word of an item (computed once per item, only when a context rule needs it). */
function wordContexts(item) {
  if (item._houseCtx) return item._houseCtx;
  const toks = tokenize(item.text);
  const starts = [];
  let pos = 0;
  for (const t of toks) { if (t.type === 'word') starts.push([pos, pos + t.text.length]); pos += t.text.length; }
  const ctx = starts.map(([a, b]) => ({ before: skeleton(item.text.slice(0, a)), after: skeleton(item.text.slice(b)) }));
  Object.defineProperty(item, '_houseCtx', { value: ctx, enumerable: false });
  return ctx;
}

/** First rule matching word `wi` of `item`, or null. Returns { rule, form }. */
export function houseMatch(rules, item, wi) {
  if (!rules.length) return null;
  const w = skeleton(item.words[wi]);
  for (const rule of rules) {
    if (rule.word ? rule.word !== w : !rule.wordRe.test(w)) continue;
    const form = rule.forms.get(w);
    if (!form) continue; // wordRe matched a word the rule has no form for → not this rule
    if (rule.before || rule.after) {
      const c = wordContexts(item)[wi];
      if (rule.before && !rule.before.test(c.before)) continue;
      if (rule.after && !rule.after.test(c.after)) continue;
    }
    return { rule, form };
  }
  return null;
}
