// Stage 3+4: per item, check each vocalizer's consonant skeleton, align its words to the source words, and vote
// word by word. 3/3 agreement (plus the {{word|hint}} vote when present) = accepted. Everything else is a
// disagreement keyed by a stable id (skeleton word + item text + occurrence). decisions.json resolves ids; a decision
// may also override an agreed word (e.g. to fix a lint error).
// House rules (house.mjs) are a 5th, overriding vote: precedence is decision > house rule > vote. A word a house rule
// decides never becomes a disagreement. A {{word|hint}} that contradicts the rule wins over the rule (specific beats
// general): the word then goes through the normal vote with the hint as the 4th vote.
// Groups: every disagreement belongs to a group keyed by bare word + the exact vote pattern (+ hint + Dicta's top 3
// alternatives). A ruling on the group id ("g-…") resolves every member; its "exceptions" { "w-…": {form, reason} }
// give single members another form. Precedence for a word: its own "w-" decision > group exception > house rule >
// group ruling > vote. (A house rule beats a group ruling because a group can mix house-matched and other members of
// one word; house-matched words are never put in groups.) Every decision needs a one-line reason.
import { words, alignWords, looseSkeleton, normalizeVocalized, skeleton, tokenize, isMaterDeletion, restoreMatres } from './hebrew.mjs';
import { wordId, sha } from './extract.mjs';
import { houseMatch } from './house.mjs';

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
 * @param houseRules compiled rules from compileHouseRules / loadHouseRules
 */
/** Group id for a disagreement: bare word + every vocalizer's form + hint + Dicta's top alternatives. */
export function groupKey(word, vocIds, votes, hint, dictaOptions) {
  return [looseSkeleton(word), ...vocIds.map((v) => `${v}=${votes[v] ?? ''}`), `hint=${hint ?? ''}`, `alts=${dictaOptions.join('|')}`].join('\u241f');
}
export const groupIdOf = (key) => 'g-' + sha(key, 12);

function checkDecision(dec, w) {
  const form = normalizeVocalized(String(dec.form || ''));
  if (skeleton(form) !== skeleton(w)) return { problem: 'decision form has different letters than the word' };
  if (!dec.reason || !String(dec.reason).trim()) return { problem: 'decision has no reason (one grammatical line is required)' };
  return { form };
}

export function compare({ items, units, results, vocIds, decisions, houseRules = [] }) {
  const unitIndex = new Map();
  for (const u of units) u.items.forEach((it, i) => unitIndex.set(it.key, { unit: u, i }));
  const skeletonErrors = [];
  const disagreements = new Map();
  const finals = new Map(); // item.key → { forms: (string|null)[], ids: string[], status: [] }
  const wordRows = []; // per word, for stats/accuracy
  const badDecisions = [];
  let total = 0, agreed = 0, decided = 0, unresolved = 0, overridden = 0, house = 0, houseResolved = 0;
  // the rule went against the vocalizers: fewer than half of them wrote the rule form (a replaced unanimous vote is
  // the extreme case). Every one deserves a look; rules with expectDissent (deliberate, e.g. בְּשׁוּרָה N) are not listed.
  const houseOverrides = [];
  const houseSkipped = []; // the rule matched but a {{word|hint}} said otherwise
  const houseUse = new Map(); // rule id → words decided
  const groups = new Map(); // group id → { id, word, versions, hint, dictaOptions, members: [word ids], ruling }

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
      const hm = houseMatch(houseRules, item, wi);
      const hr = hm && (hint === undefined || hint === hm.form) ? hm : null;
      if (hm && !hr) houseSkipped.push({ rule: hm.rule.id, id, word: w, form: hm.form, hint, file: item.file, path: item.pathStr });
      const dictaOptions = (per.dicta?.extra?.[wi]?.options || []).slice(0, 3).map((o) => normalizeVocalized(String(o?.w ?? o)));
      const gid = unanimous ? null : groupIdOf(groupKey(w, vocIds, votes, hint, dictaOptions));
      const g = gid ? decisions[gid] : undefined;
      let dec = null;
      if (decisions[id]) dec = { ...decisions[id], via: id };
      else if (g?.exceptions?.[id]) dec = { ...g.exceptions[id], via: `${gid} exception` };
      else if (g && !hr) dec = { form: g.form, reason: g.reason, via: gid };
      let final = null;
      let st;
      if (dec) {
        const chk = checkDecision(dec, w);
        if (chk.problem) {
          badDecisions.push({ id: dec.via.split(' ')[0], word: w, form: dec.form, problem: chk.problem, member: id });
          st = 'unresolved';
          dec = null;
        } else {
          final = chk.form;
          st = unanimous ? (chk.form === vals[0] ? 'agreed' : 'overridden') : 'decided';
        }
      }
      if (st) { /* decided above */ } else if (hr) {
        final = hr.form;
        st = 'house';
        house++;
        if (!unanimous) houseResolved++;
        houseUse.set(hr.rule.id, (houseUse.get(hr.rule.id) || 0) + 1);
        const agree = vals.filter((x) => x === hr.form).length;
        if (2 * agree < vals.length && !hr.rule.expectDissent) {
          houseOverrides.push({
            rule: hr.rule.id, id, word: w, unanimous, agree, of: vals.length,
            votes: unanimous ? vals[0] : null, votesBy: { ...votes },
            form: hr.form, sentence: item.text, file: item.file, path: item.pathStr,
          });
        }
      } else if (unanimous) { final = vals[0]; st = 'agreed'; } else st = 'unresolved';
      if (unanimous) agreed++;
      if (st === 'decided') decided++;
      if (st === 'overridden') overridden++;
      if (st === 'unresolved') unresolved++;
      forms.push(final);
      ids.push(id);
      status.push(st);
      wordRows.push({ id, item, wi, word: w, votes, hint, final, status: st, unanimous, house: hr ? hr.rule.id : null, group: st === 'house' ? null : gid });
      if (!unanimous && st !== 'house') {
        if (!groups.has(gid)) {
          groups.set(gid, {
            id: gid, word: looseSkeleton(w), versions: Object.fromEntries(vocIds.map((v) => [v, votes[v]])), hint: hint ?? null,
            dictaOptions, members: [], ruling: g ? { form: g.form, reason: g.reason || '', exceptions: g.exceptions || null } : null,
          });
        }
        const grp = groups.get(gid);
        if (!grp.members.includes(id)) grp.members.push(id);
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
            group: gid,
            vocalizedSentence: Object.fromEntries(vocIds.map((v) => [v, per[v].raw])),
            occurrences: [],
            decision: dec ? { form: dec.form, reason: dec.reason || '', via: dec.via } : null,
          });
        }
        disagreements.get(id).occurrences.push({ file: item.file, path: item.pathStr });
      }
    });
    finals.set(item.key, { forms, ids, status });
  }
  // A group exception must name a member of that group.
  for (const grp of groups.values()) {
    for (const xid of Object.keys(grp.ruling?.exceptions || {})) {
      if (!grp.members.includes(xid)) badDecisions.push({ id: grp.id, word: grp.word, form: grp.ruling.exceptions[xid]?.form, problem: `exception ${xid} is not a member of this group` });
    }
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
    groups: [...groups.values()],
    house: { use: Object.fromEntries([...houseUse].sort((a, b) => b[1] - a[1])), overrides: houseOverrides, skippedByHint: houseSkipped },
    stats: {
      strings: items.length, words: total, agreed, decided, overridden, unresolved, house, houseResolved, houseOverrides: houseOverrides.length,
      agreementPct: total ? +(100 * agreed / total).toFixed(2) : null,
    },
    accuracy,
  };
}
