// Adjudication: merge decision files, write batch-NN.md work sheets for parallel adjudicators, promote group rulings
// to house rules.
//
//   <work>/decisions.json                       hand decisions ("w-…" word ids or "g-…" group ids)
//   <work>/adjudication/batch-NN.md             generated each run: ~60 OPEN groups per file, every member in its sentence
//   <work>/adjudication/batch-NN.decisions.json written by an adjudicator: { "g-…": {form, reason, exceptions?}, "w-…": {form, reason} }
//
// run.mjs merges decisions.json + every adjudication/*.decisions.json. The same key in two files with a different
// form is a conflict and blocks the build.
import fs from 'node:fs';
import path from 'node:path';
import { STYLE_RULES } from './prompt.mjs';
import { rebuild } from './compare.mjs';
import { tokenize, normalizeVocalized } from './hebrew.mjs';
import { compileHouseRules } from './house.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Merge decisions.json and adjudication/*.decisions.json. Returns { decisions, sources, conflicts, errors }. */
export function loadDecisions(decisionsFile, adjudicationDir) {
  const files = [];
  if (decisionsFile && fs.existsSync(decisionsFile)) files.push(decisionsFile);
  if (adjudicationDir && fs.existsSync(adjudicationDir)) {
    for (const f of fs.readdirSync(adjudicationDir).sort()) if (f.endsWith('.decisions.json')) files.push(path.join(adjudicationDir, f));
  }
  const decisions = {};
  const sources = {};
  const conflicts = [];
  const errors = [];
  for (const f of files) {
    let j;
    try { j = readJson(f); } catch (e) { errors.push({ file: f, problem: `cannot parse: ${e.message}` }); continue; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) { errors.push({ file: f, problem: 'must be an object keyed by w-/g- ids' }); continue; }
    for (const [k, v] of Object.entries(j)) {
      if (!/^[wg]-[0-9a-f]{12}$/.test(k)) { errors.push({ file: f, problem: `key ${k} is not a w-/g- id` }); continue; }
      if (k in decisions) {
        const a = decisions[k];
        if (normalizeVocalized(String(a.form || '')) !== normalizeVocalized(String(v.form || '')) || JSON.stringify(a.exceptions || {}) !== JSON.stringify(v.exceptions || {})) {
          conflicts.push({ id: k, files: [sources[k], f], forms: [a.form, v.form] });
        }
        continue;
      }
      decisions[k] = v;
      sources[k] = f;
    }
  }
  for (const c of conflicts) delete decisions[c.id]; // a conflicting id is unresolved until the files agree
  return { decisions, sources, conflicts, errors, files };
}

const mark = (text, wi, replacement) => {
  let n = 0;
  return tokenize(text).map((t) => (t.type === 'word' ? (n++ === wi ? replacement(t.text) : t.text) : t.text)).join('');
};

/**
 * Write batch-NN.md for the OPEN groups (no ruling yet). Old batch-*.md files are removed first; *.decisions.json
 * files are never touched. Returns the list of written files.
 */
export function writeBatches({ dir, groups, disagreements, finalsByKey, itemsByKey, vocIds, perBatch = 60 }) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^batch-\d+\.md$/.test(f)) fs.rmSync(path.join(dir, f));
  const byId = new Map(disagreements.map((d) => [d.id, d]));
  const open = groups.filter((g) => !g.ruling && g.members.some((m) => !byId.get(m)?.decision));
  open.sort((a, b) => a.word.localeCompare(b.word, 'he') || b.members.length - a.members.length);
  const written = [];
  for (let b = 0; b * perBatch < open.length; b++) {
    const chunk = open.slice(b * perBatch, (b + 1) * perBatch);
    const name = `batch-${String(b + 1).padStart(2, '0')}`;
    const out = [];
    out.push(`# Nikud adjudication ${name} (${chunk.length} groups)`, '');
    out.push(`Write your rulings to \`${name}.decisions.json\` in this folder. One JSON object, keyed by group id:`, '');
    out.push('```json', '{', '  "g-0123456789ab": { "form": "<the word with full nikud>", "reason": "<one grammatical line>" },',
      '  "g-ba9876543210": { "form": "…", "reason": "…", "exceptions": { "w-…": { "form": "…", "reason": "…" } } }', '}', '```', '');
    out.push('- The form must have exactly the letters of the word (same ktiv male; only marks change). NFC is applied for you.',
      '- A group ruling applies to every member. If one member\'s sentence needs another form, put that member id under `exceptions`.',
      '- Every ruling and exception needs a one-line grammatical reason (e.g. "definite: the specific line → בַּ + dagesh").',
      '- Leave a group out if you are not sure; it stays open. Do not edit this .md file; it is regenerated on every run.',
      '- House style (the same rules the vocalizers got):', '');
    out.push(STYLE_RULES.split('\n').map((l) => `  > ${l}`).join('\n'), '');
    chunk.forEach((g, n) => {
      out.push(`## ${n + 1}. \`${g.id}\` · ${g.word} · ${g.members.length} place(s)`, '');
      for (const v of vocIds) out.push(`- ${v}: ${g.versions[v] ?? '— (no vote: letters changed)'}`);
      if (g.hint) out.push(`- writer's hint: ${g.hint}`);
      if (g.dictaOptions?.length) out.push(`- Dicta alternatives: ${g.dictaOptions.join(' · ')}`);
      out.push('');
      g.members.forEach((m) => {
        const d = byId.get(m);
        if (!d) return;
        const item = itemsByKey.get(`${d.file}#${d.path}`);
        const fin = finalsByKey.get(`${d.file}#${d.path}`);
        const bare = mark(d.sentence, d.wordIndex, (t) => `⟦${t}⟧`);
        const voc = item && fin ? mark(rebuild(item.text, fin.forms), d.wordIndex, () => `⟦${d.word}⟧`) : '';
        const more = d.occurrences.length > 1 ? ` (+${d.occurrences.length - 1} identical sentence(s))` : '';
        out.push(`  - \`${m}\` ${d.file} › ${d.path}${more}`, `    - ${bare}`);
        if (voc) out.push(`    - ${voc}`);
        if (d.context && d.context !== d.sentence) out.push(`    - whole paragraph: ${d.context}`);
        if (d.decision) out.push(`    - already decided: ${d.decision.form} (${d.decision.via})`);
      });
      out.push('');
    });
    const file = path.join(dir, `${name}.md`);
    fs.writeFileSync(file, out.join('\n'));
    written.push(file);
  }
  return written;
}

/**
 * Promote a group ruling to a house rule. Context-free means: the last FULL run saw this bare word with exactly one
 * final form everywhere (no other ruling, no unanimous vote for another form, nothing unresolved), and the ruling has
 * no exceptions. Appends a rule to the house-rules file (validated; the file is restored on any error).
 */
export function promoteGroup({ groupId, groupsFile, decisions, sources, houseRulesFile }) {
  if (!fs.existsSync(groupsFile)) return { ok: false, problem: `no ${groupsFile}: run the pipeline once (without --only) first` };
  const gj = readJson(groupsFile);
  if (gj.only) return { ok: false, problem: `the last run used --only ${gj.only}; promotion needs a full run` };
  const g = gj.groups.find((x) => x.id === groupId);
  if (!g) return { ok: false, problem: `group ${groupId} is not in the last run` };
  const ruling = decisions[groupId];
  if (!ruling) return { ok: false, problem: `group ${groupId} (${g.word}) has no ruling` };
  if (ruling.exceptions && Object.keys(ruling.exceptions).length) return { ok: false, problem: `group ${groupId} (${g.word}) has exceptions, so the word is not context-free` };
  const form = normalizeVocalized(String(ruling.form));
  const seen = gj.wordForms?.[g.word] || {};
  const other = Object.entries(seen).filter(([f]) => f !== form);
  if (other.length) return { ok: false, problem: `${g.word} also ends up as ${other.map(([f, n]) => `${f} ×${n}`).join(', ')} in the last run` };
  const text = fs.readFileSync(houseRulesFile, 'utf8');
  const raw = JSON.parse(text);
  const rule = { id: `promoted-${groupId}`, word: g.word, form, reason: `${String(ruling.reason || '').trim()} (promoted from group ${groupId})`, source: `adjudication ${path.basename(sources?.[groupId] || '')}`.trim() };
  if (raw.rules.some((r) => r.id === rule.id)) return { ok: false, problem: `${rule.id} already exists` };
  const check = compileHouseRules({ rules: [...raw.rules, rule] });
  if (check.errors.length) return { ok: false, problem: check.errors.map((e) => `${e.id}: ${e.problem}`).join('; ') };
  // keep the hand formatting: one rule per line, appended before the closing bracket of "rules"
  const at = text.lastIndexOf('\n  ]');
  if (at < 0) return { ok: false, problem: 'cannot find the end of the "rules" array' };
  const next = `${text.slice(0, at)},\n    ${JSON.stringify(rule).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/","/g, '", "').replace(/":"/g, '": "')}${text.slice(at)}`;
  JSON.parse(next);
  fs.writeFileSync(houseRulesFile, next);
  return { ok: true, rule, word: g.word, places: Object.values(seen).reduce((a, b) => a + b, 0) };
}
