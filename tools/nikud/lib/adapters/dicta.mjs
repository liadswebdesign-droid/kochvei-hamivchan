// Vocalizer (a): Dicta Nakdan — the JSON endpoint behind https://nakdan.dicta.org.il (see tools/nikud/README.md for
// how it was found and the terms note). Modern genre, כתיב מלא (keepqq=true). Polite: one request at a time, at
// least MIN_GAP_MS between requests, and the first error stops the adapter (no retries, no hammering).
import { words, tokenize, alignWords, normalizeVocalized } from '../hebrew.mjs';

export const DICTA_ENDPOINT = process.env.NIKUD_DICTA_ENDPOINT || 'https://nakdan-u2-1a.loadbalancer.dicta.org.il/api';
const MIN_GAP_MS = 1500;
const MAX_CHARS = 2000; // the web UI caps a request at 5000 characters
const TIMEOUT_MS = 60000;

let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function requestBody(text) {
  // Same options the official web UI sends, with ktiv maleh (keepqq) and the modern genre.
  return {
    addmorph: true, keepmetagim: true, keepqq: true, nodageshdefmem: false, patachma: false,
    task: 'nakdan', data: text, useTokenization: true, genre: 'modern',
  };
}

async function callDicta(text) {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(DICTA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'smart-girls-nikud-pipeline/1.0 (kids practice app; low volume)' },
      body: JSON.stringify(requestBody(text)),
      signal: ctrl.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Dicta HTTP ${res.status}: ${body.slice(0, 200)}`);
    let json;
    try { json = JSON.parse(body); } catch { throw new Error(`Dicta returned non-JSON: ${body.slice(0, 200)}`); }
    if (!Array.isArray(json.data)) throw new Error(`Dicta reply has no data array: ${body.slice(0, 200)}`);
    return json.data;
  } finally {
    clearTimeout(timer);
    lastRequestAt = Date.now();
  }
}

/** Turn Dicta's token array into a list of word entries: { form, options, confident }. */
export function parseDictaTokens(data) {
  const out = [];
  for (const tok of data) {
    if (tok.sep) continue;
    const n = tok.nakdan || {};
    const opts = (n.options || []).map((o) => normalizeVocalized(String(o.w || '').replace(/\|/g, '')));
    const uniq = [...new Set(opts.filter(Boolean))];
    const src = tok.str ?? n.word ?? '';
    // A "word" token can hold more than one Hebrew word only in odd cases; split defensively.
    const form = uniq[0] || src;
    out.push({ src, form, options: uniq.slice(0, 5), confident: n.fconfident === true });
  }
  // Expand any token whose form contains several Hebrew words (keeps alignment honest).
  const expanded = [];
  for (const w of out) {
    const ws = words(w.form);
    if (ws.length <= 1) expanded.push({ ...w, form: ws[0] ?? w.form });
    else for (const x of ws) expanded.push({ src: x, form: x, options: [], confident: false });
  }
  return expanded;
}

export function createDicta() {
  return {
    id: 'dicta',
    model: `dicta-nakdan modern/maleh @ ${DICTA_ENDPOINT}`,
    cacheSalt: 'dicta-v1-maleh-modern',
    /**
     * @param units  units to vocalize
     * @param onUnit callback(unit, results[]) — called as soon as a unit is done (so progress is cached)
     */
    async vocalize(units, { onUnit, log }) {
      // Pack units into requests.
      const requests = [];
      let cur = [];
      let size = 0;
      for (const u of units) {
        const len = u.items.reduce((n, it) => n + it.text.length + 1, 0);
        if (cur.length && size + len > MAX_CHARS) { requests.push(cur); cur = []; size = 0; }
        cur.push(u);
        size += len;
      }
      if (cur.length) requests.push(cur);
      const stats = { calls: 0, ms: 0, words: 0, chars: 0 };
      for (const [ri, req] of requests.entries()) {
        const text = req.map((u) => u.items.map((it, i) => it.text + (i < u.items.length - 1 ? u.joins[i] : '')).join('')).join('\n');
        const srcWords = req.flatMap((u) => u.items.flatMap((it) => it.words));
        const t0 = Date.now();
        log?.(`dicta: request ${ri + 1}/${requests.length} (${text.length} chars, ${srcWords.length} words)`);
        const data = await callDicta(text); // throws → caller stops the adapter
        stats.calls++; stats.ms += Date.now() - t0; stats.words += srcWords.length; stats.chars += text.length;
        const dw = parseDictaTokens(data);
        // Dicta straightens ׳ ״ to ' " — align with quotes folded, then put the source's own quote characters back.
        const fold = (s) => s.replace(/[׳‘’]/g, "'").replace(/[״“”]/g, '"');
        const map = alignWords(srcWords.map(fold), dw.map((w) => fold(w.form)));
        for (let k2 = 0; k2 < srcWords.length; k2++) {
          const j = map[k2];
          if (j === null || !/['"׳״]/.test(srcWords[k2])) continue;
          const quotes = [...srcWords[k2]].filter((c) => /['"׳״]/.test(c));
          let qi = 0;
          dw[j] = { ...dw[j], form: dw[j].form.replace(/['"׳״]/g, (q) => quotes[qi++] ?? q) };
        }
        let k = 0;
        for (const u of req) {
          const results = u.items.map((it) => {
            const forms = [];
            const extra = [];
            for (let i = 0; i < it.words.length; i++, k++) {
              const j = map[k];
              forms.push(j === null ? null : dw[j].form);
              extra.push(j === null ? null : { options: dw[j].options, confident: dw[j].confident });
            }
            // Rebuild a display string from the source tokens with Dicta's forms.
            let wi = 0;
            const raw = tokenize(it.text).map((t) => (t.type === 'word' ? (forms[wi++] ?? t.text) : t.text)).join('');
            return { raw, forms, extra };
          });
          await onUnit(u, results);
        }
      }
      return stats;
    },
  };
}
