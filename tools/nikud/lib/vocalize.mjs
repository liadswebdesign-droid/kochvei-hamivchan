// Stage 2: run the selected vocalizers over every unit, with a per-unit content-hash cache so a re-run only sends
// changed strings. Cache: <work>/cache/<vocalizer>/<hash>.json, hash = sha(adapter salt + prompt version + unit key).
import fs from 'node:fs';
import path from 'node:path';
import { sha } from './extract.mjs';
import { PROMPT_VERSION } from './prompt.mjs';

const cacheFile = (cacheDir, adapter, unit) =>
  path.join(cacheDir, adapter.id, `${sha(`${adapter.cacheSalt}|${PROMPT_VERSION}|${unit.key}`, 24)}.json`);

/**
 * @returns {{ results: Map<vocId, Map<unitKey, {items, problem}>>, status: Map<vocId, {...}> }}
 */
export async function vocalizeAll({ units, adapters, cacheDir, dry, refresh = [], log }) {
  const results = new Map();
  const status = new Map();
  await Promise.all(adapters.map(async (adapter) => {
    const res = new Map();
    results.set(adapter.id, res);
    const st = { model: adapter.model, cached: 0, fresh: 0, missing: 0, error: null, pending: 0, stats: null };
    status.set(adapter.id, st);
    const todo = [];
    for (const u of units) {
      const f = cacheFile(cacheDir, adapter, u);
      if (!refresh.includes(adapter.id) && fs.existsSync(f)) {
        const c = JSON.parse(fs.readFileSync(f, 'utf8'));
        res.set(u.key, { items: c.items, problem: c.problem || null });
        st.cached++;
      } else todo.push(u);
    }
    if (!todo.length) return;
    if (dry) { st.missing = todo.length; return; }
    const onUnit = async (u, items, meta = {}) => {
      const f = cacheFile(cacheDir, adapter, u);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const rec = {
        vocalizer: adapter.id, model: adapter.model, promptVersion: PROMPT_VERSION, at: new Date().toISOString(),
        unit: { file: u.file, group: u.group, texts: u.items.map((it) => it.text) }, items, problem: meta.problem || null,
      };
      fs.writeFileSync(f, JSON.stringify(rec, null, 1));
      res.set(u.key, { items, problem: rec.problem });
      st.fresh++;
    };
    try {
      st.stats = await adapter.vocalize(todo, { onUnit, log });
    } catch (e) {
      st.error = e.message;
      log?.(`${adapter.id}: STOPPED — ${e.message}`);
    }
    st.missing = todo.filter((u) => !res.has(u.key)).length;
    st.pending = st.stats?.pendingBatches || 0;
  }));
  return { results, status };
}
