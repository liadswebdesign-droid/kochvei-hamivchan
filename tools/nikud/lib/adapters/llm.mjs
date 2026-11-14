// Shared driver for the LLM vocalizers (Codex/GPT and Claude): batch units → one prompt per batch → parse the JSON
// reply → validate per unit (item count + consonant skeleton) → retry the failed units once in a smaller batch.
import { buildPrompt, parseUnitsReply, batchUnits } from '../prompt.mjs';
import { looseSkeleton, normalizeVocalized, words, alignWords, isMaterDeletion, restoreMatres, skeleton } from '../hebrew.mjs';

export class PendingError extends Error {}

/** An item whose only letter changes are dropped matres that restoreMatres can put back (ktiv-haser habit). */
function onlyRestorableMatres(srcText, out) {
  const src = words(srcText);
  const got = words(out);
  if (src.length !== got.length) return false;
  const map = alignWords(src, got, isMaterDeletion);
  const nonWord = (s) => looseSkeleton(s).replace(/[א-ת'"׳״]+/g, '');
  if (nonWord(srcText) !== nonWord(out)) return false; // punctuation/digits/maqaf changed
  return map.every((j, i) => j === i && (skeleton(got[j]) === skeleton(src[i]) || restoreMatres(got[j], src[i]) !== null));
}

/** null = fine; { problem, retry } otherwise. Restorable ktiv-haser drops are logged but not worth a retry. */
function checkUnit(unit, items) {
  if (!items) return { problem: 'unit missing from reply', retry: true };
  if (items.length !== unit.items.length) return { problem: `expected ${unit.items.length} items, got ${items.length}`, retry: true };
  const bad = unit.items.findIndex((it, i) => looseSkeleton(items[i]) !== looseSkeleton(it.text));
  if (bad < 0) return null;
  const retry = unit.items.some((it, i) => looseSkeleton(items[i]) !== looseSkeleton(it.text) && !onlyRestorableMatres(it.text, items[i]));
  return { problem: `item ${bad + 1} changed letters/punctuation${retry ? '' : ' (only restorable dropped matres)'}`, retry };
}

/**
 * @param call async (prompt, batchInfo) → { text, ms, costUsd?, usage? }   (throws PendingError when deferred)
 */
export async function runLlmVocalizer({ id, call, maxChars, units, onUnit, log }) {
  const stats = { calls: 0, ms: 0, words: 0, chars: 0, costUsd: 0, failedUnits: 0, pendingBatches: 0 };
  const runBatches = async (list, attempt) => {
    const failed = [];
    const batches = batchUnits(list, maxChars);
    for (const [bi, batch] of batches.entries()) {
      const words = batch.reduce((n, u) => n + u.items.reduce((m, it) => m + it.words.length, 0), 0);
      const chars = batch.reduce((n, u) => n + u.items.reduce((m, it) => m + it.text.length, 0), 0);
      log?.(`${id}: batch ${bi + 1}/${batches.length}${attempt ? ' (retry)' : ''} — ${batch.length} units, ${words} words`);
      let reply;
      try {
        reply = await call(buildPrompt(batch), { attempt, batchIndex: bi });
      } catch (e) {
        if (e instanceof PendingError) { stats.pendingBatches++; log?.(`${id}: ${e.message}`); continue; }
        throw e;
      }
      stats.calls++; stats.ms += reply.ms || 0; stats.costUsd += reply.costUsd || 0;
      stats.words += words; stats.chars += chars;
      let map;
      try {
        map = parseUnitsReply(reply.text);
      } catch (e) {
        log?.(`${id}: ${e.message}`);
        map = new Map();
      }
      for (const u of batch) {
        const items = map.get(u.key)?.map((s) => normalizeVocalized(s));
        const chk = checkUnit(u, items);
        if (chk?.retry && attempt === 0) { failed.push(u); log?.(`${id}: unit ${u.file}:${u.group} — ${chk.problem}; will retry`); continue; }
        if (chk) {
          if (chk.retry) stats.failedUnits++;
          log?.(`${id}: unit ${u.file}:${u.group} — ${chk.problem} (kept${chk.retry ? '; unrecoverable words lose this vote' : ''})`);
        }
        const results = u.items.map((it, i) => ({ raw: items?.[i] ?? null }));
        await onUnit(u, results, { problem: chk?.problem || null });
      }
    }
    return failed;
  };
  const failed = await runBatches(units, 0);
  if (failed.length) await runBatches(failed, 1);
  return stats;
}
