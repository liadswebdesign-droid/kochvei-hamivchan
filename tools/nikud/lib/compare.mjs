// Stage 3+4: per item, check each vocalizer's consonant skeleton, align its words to the source words, and vote
// word by word. 3/3 agreement (plus the {{word|hint}} vote when present) = accepted. Everything else is a
// disagreement keyed by a stable id (skeleton word + item text + occurrence). decisions.json resolves ids; a decision
// may also override an agreed word (e.g. to fix a lint error).
import { words, alignWords, looseSkeleton, normalizeVocalized, skeleton, tokenize, isMaterDeletion, restoreMatres } from './hebrew.mjs';
import { wordId } from './extract.mjs';

export function formsFor(item, result) {
  if (!result) return { forms: item.words.map(() => null), skeletonOk: false, raw: null };
  if (Array.isArray(result.forms)) {
    const forms = result.forms.map((f, i) => (f && skeleton(f) === skeleton(item.words[i]) ? normalizeVocalized(f) : null));
    return { forms, skeletonOk: forms.every(Boolean), raw: result.raw, extra: result.extra };
  }
  if (typeof result.raw !== 'string') return { forms: item.words.map(() => null), skeletonOk: false, raw: null };
  const raw = normalizeVocalized(result.raw);
  const out = words(raw);
  // Loose alignment: a word the vocalizer wrote in ktiv haser still lines up, and its matres are restored
  // (restoreMatres) so its vowel choice still votes. Every other letter change loses the vote for that word.
  const map = alignWords(item.words, out, isMaterDeletion);
  let repaired = 0;
  const forms = map.map((j, i) => {
    if (j === null) return null;
    if (skeleton(out[j]) === skeleton(item.words[i])) return out[j];
    const fixed = restoreMatres(out[j], item.words[i]);
    if (fixed) repaired++;
    return fixed ? normalizeVocalized(fixed) : null;
  });
  return { forms, skeletonOk: looseSkeleton(raw) === looseSkeleton(item.text), raw, repaired };
}

export function rebuild(text, forms) {
  let wi = 0;
  return tokenize(text).map((t) => (t.type === 'word' ? (forms[wi++] ?? t.text) : t.text)).join('');
}

/**
 * @param items      extracted items
 * @param units      extracted units (to find each item's unit result index)
 * @param results    Map<vocId, Map<unitKey, {items}>>
 * @param vocIds     vocalizers taking part (order kept in reports)
 * @param decisions  { [id]: { form, reason, lintAllow? } }
 */
export function compare({ items, units, results, vocIds, decisions }) {
  const unitIndex = new Map();
  for (const u of units) u.items.forEach((it, i) => unitIndex.set(it.key, { unit: u, i }));
  const skeletonErrors = [];
  const disagreements = new Map();
  const finals = new Map(); // item.key → { forms: (string|null)[], ids: string[], status: [] }
  const wordRows = []; // per word, for stats/accuracy
  const badDecisions = [];
  let total = 0, agreed = 0, decided = 0, unresolved = 0, overridden = 0;

  for (const item of items) {
    const { unit, i } = unitIndex.get(item.key);
    const per = {};
    for (const v of vocIds) {
      const r = results.get(v)?.get(unit.key)?.items?.[i];
      per[v] = formsFor(item, r);
      if (!per[v].skeletonOk) {
        skeletonErrors.push({
          vocalizer: v, file: item.file, path: item.pathStr, source: item.text, output: per[v].raw,
          matresRestored: per[v].repaired || 0, wordsLost: per[v].forms.filter((f) => f === null).length,
        });
      }
    }
    const forms = [];
    const ids = [];
    const status = [];
    item.words.forEach((w, wi) => {
      total++;
      const id = wordId(item, wi);
      const votes = {};
      for (const v of vocIds) votes[v] = per[v].forms[wi];
      const hint = item.hints.get(wi);
      const vals = vocIds.map((v) => votes[v]);
      const unanimous = vals.every((x) => x && x === vals[0]) && (hint === undefined || hint === vals[0]);
      const dec = decisions[id];
      let final = null;
      let st;
      if (dec) {
        const form = normalizeVocalized(String(dec.form || ''));
        if (skeleton(form) !== skeleton(w)) {
          badDecisions.push({ id, word: w, form: dec.form, problem: 'decision form has different letters than the word' });
          st = 'unresolved';
        } else {
          final = form;
          st = unanimous ? (form === vals[0] ? 'agreed' : 'overridden') : 'decided';
        }
      } else if (unanimous) { final = vals[0]; st = 'agreed'; } else st = 'unresolved';
      if (unanimous) agreed++;
      if (st === 'decided') decided++;
      if (st === 'overridden') overridden++;
      if (st === 'unresolved') unresolved++;
      forms.push(final);
      ids.push(id);
      status.push(st);
      wordRows.push({ id, item, wi, word: w, votes, hint, final, status: st, unanimous });
      if (!unanimous) {
        if (!disagreements.has(id)) {
          disagreements.set(id, {
            id,
            word: looseSkeleton(w),
            sentence: item.text,
            context: item.context,
            wordIndex: wi,
            file: item.file,
            path: item.pathStr,
            versions: Object.fromEntries(vocIds.map((v) => [v, votes[v]])),
            hint: hint ?? null,
            dicta: per.dicta?.extra?.[wi] || null,
            vocalizedSentence: Object.fromEntries(vocIds.map((v) => [v, per[v].raw])),
            occurrences: [],
            decision: dec ? { form: dec.form, reason: dec.reason || '' } : null,
          });
        }
        disagreements.get(id).occurrences.push({ file: item.file, path: item.pathStr });
      }
    });
    finals.set(item.key, { forms, ids, status });
  }
  // Per-vocalizer accuracy against the final form (only where a final form exists).
  const accuracy = {};
  for (const v of vocIds) {
    let n = 0, ok = 0;
    const misses = [];
    for (const r of wordRows) {
      if (!r.final) continue;
      n++;
      if (r.votes[v] === r.final) ok++; else misses.push({ word: r.word, got: r.votes[v], final: r.final, id: r.id });
    }
    accuracy[v] = { words: n, correct: ok, pct: n ? +(100 * ok / n).toFixed(2) : null, misses };
  }
  return {
    finals, wordRows, skeletonErrors, badDecisions,
    disagreements: [...disagreements.values()],
    stats: { strings: items.length, words: total, agreed, decided, overridden, unresolved, agreementPct: total ? +(100 * agreed / total).toFixed(2) : null },
    accuracy,
  };
}
