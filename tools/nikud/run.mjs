#!/usr/bin/env node
// Nikud pipeline: extract → vocalize (Dicta, Codex/GPT, Claude) → compare → apply decisions → write build → lint → review page.
//
//   node tools/nikud/run.mjs [--only <glob>] [--vocalizers dicta,codex,claude] [--dry]
//                            [--src DIR] [--build DIR] [--work DIR] [--decisions FILE]
//                            [--refresh dicta,codex] [--claude-mode auto|cli|handoff] [--font "Family"] [--seed S]
//
// Exit codes: 0 build written · 1 build blocked (unresolved disagreements, lint errors, bad source/decisions)
//             2 vocalizers incomplete (error, pending handoff, or --dry with uncached units)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSourceFiles, extract } from './lib/extract.mjs';
import { vocalizeAll } from './lib/vocalize.mjs';
import { compare, rebuild } from './lib/compare.mjs';
import { lintText } from './lib/lint.mjs';
import { renderReview, samplePassages } from './lib/review.mjs';
import { createDicta } from './lib/adapters/dicta.mjs';
import { createCodex } from './lib/adapters/codex.mjs';
import { createClaude } from './lib/adapters/claude.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const o = { vocalizers: ['dicta', 'codex', 'claude'], refresh: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--only') o.only = val();
    else if (a === '--vocalizers') o.vocalizers = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--dry') o.dry = true;
    else if (a === '--src') o.src = path.resolve(val());
    else if (a === '--build') o.build = path.resolve(val());
    else if (a === '--work') o.work = path.resolve(val());
    else if (a === '--decisions') o.decisions = path.resolve(val());
    else if (a === '--refresh') o.refresh = val().split(',');
    else if (a === '--claude-mode') o.claudeMode = val();
    else if (a === '--font') o.font = val();
    else if (a === '--seed') o.seed = val();
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  o.src ||= path.join(ROOT, 'content/src');
  o.build ||= path.join(ROOT, 'content/build');
  o.work ||= path.join(ROOT, 'content/nikud');
  o.decisions ||= path.join(o.work, 'decisions.json');
  return o;
}

const rel = (p) => (p.startsWith(ROOT + path.sep) ? path.relative(ROOT, p) : p);
const log = (m) => console.log(`  · ${m}`);
const writeJson = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n'); };

function setAt(obj, p, value) {
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = value;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).join('\n')); return 0; }
  const t0 = Date.now();
  const known = { dicta: 1, codex: 1, claude: 1 };
  for (const v of opt.vocalizers) if (!known[v]) throw new Error(`unknown vocalizer ${v}`);
  const vocIds = ['dicta', 'codex', 'claude'].filter((v) => opt.vocalizers.includes(v));
  console.log(`nikud: src=${rel(opt.src)}  build=${rel(opt.build)}  vocalizers=${vocIds.join(',')}${opt.only ? `  only=${opt.only}` : ''}${opt.dry ? '  (dry)' : ''}`);
  if (vocIds.length < 3) console.log('  ! fewer than 3 vocalizers: agreement is NOT a three-way check');

  // 1. extract
  const files = listSourceFiles(opt.src, opt.only);
  const { items, units, errors } = extract(opt.src, files);
  const nWords = items.reduce((n, it) => n + it.words.length, 0);
  console.log(`1 extract: ${files.length} files, ${units.length} units, ${items.length} strings, ${nWords} words`);
  if (errors.length) {
    for (const e of errors) console.log(`  ✖ ${e.file}${e.path ? ' › ' + e.path : ''}: ${e.error}`);
    console.log('✖ source errors — fix content/src first');
    return 1;
  }

  // 2. vocalize
  const tmpDir = path.join(opt.work, 'tmp');
  const adapters = vocIds.map((v) => (v === 'dicta' ? createDicta()
    : v === 'codex' ? createCodex({ projectRoot: ROOT, tmpDir })
      : createClaude({ projectRoot: ROOT, workDir: opt.work, mode: opt.claudeMode })));
  const { results, status } = await vocalizeAll({ units, adapters, cacheDir: path.join(opt.work, 'cache'), dry: opt.dry, refresh: opt.refresh, log });
  const timing = {};
  let incomplete = false;
  for (const v of vocIds) {
    const st = status.get(v);
    const s = st.stats;
    if (s && s.words) {
      timing[v] = {
        calls: s.calls, seconds: +(s.ms / 1000).toFixed(1), words: s.words,
        secondsPer1000Words: +((s.ms / 1000) / s.words * 1000).toFixed(1),
        costUsd: s.costUsd !== undefined ? +s.costUsd.toFixed(4) : null,
        costUsdPer1000Words: s.costUsd ? +(s.costUsd / s.words * 1000).toFixed(4) : null,
      };
    }
    const bad = st.error || st.pending || st.missing;
    if (bad) incomplete = true;
    console.log(`2 ${v.padEnd(6)} ${st.model}: cached ${st.cached}, new ${st.fresh}${st.missing ? `, MISSING ${st.missing}` : ''}${st.pending ? `, PENDING ${st.pending} batch(es)` : ''}${st.error ? `, ERROR ${st.error}` : ''}${timing[v] ? `  [${timing[v].seconds}s, ${timing[v].secondsPer1000Words}s/1000w${timing[v].costUsd ? `, $${timing[v].costUsd}` : ''}]` : ''}`);
  }
  if (incomplete) {
    console.log(opt.dry ? '✖ dry run: some units are not cached (nothing was called)' : '✖ vocalizers incomplete — fix the error / answer the handoff prompts, then re-run (finished units are cached)');
    if (!opt.dry) writeJson(path.join(opt.work, 'last-run.json'), { at: new Date().toISOString(), complete: false, status: Object.fromEntries(status), timing });
    return 2;
  }

  // 3–4. compare + decisions
  const decisions = fs.existsSync(opt.decisions) ? JSON.parse(fs.readFileSync(opt.decisions, 'utf8')) : {};
  const cmp = compare({ items, units, results, vocIds, decisions });
  const s = cmp.stats;
  console.log(`3 compare: ${s.words} words, ${s.agreed} agreed (${s.agreementPct}%), ${cmp.disagreements.length} disagreement ids, skeleton errors ${cmp.skeletonErrors.length}`);
  const skel = {};
  for (const e of cmp.skeletonErrors) {
    const k = (skel[e.vocalizer] ||= { strings: 0, restored: 0, lost: 0 });
    k.strings++; k.restored += e.matresRestored || 0; k.lost += e.wordsLost || 0;
  }
  for (const [v, k] of Object.entries(skel)) {
    console.log(`  ! ${v} changed letters in ${k.strings} string(s): ${k.restored} ktiv-haser word(s) restored to the source spelling, ${k.lost} word vote(s) lost (see skeleton-errors.json)`);
  }
  console.log(`4 decisions: ${s.decided} decided, ${s.overridden} overrides, ${s.unresolved} unresolved word occurrences${cmp.badDecisions.length ? `, ${cmp.badDecisions.length} BAD decisions` : ''}`);
  for (const b of cmp.badDecisions) console.log(`  ✖ decision ${b.id} (${b.word} → ${b.form}): ${b.problem}`);
  const liveIds = new Set(cmp.wordRows.map((r) => r.id));
  const unusedDecisions = opt.only ? [] : Object.keys(decisions).filter((id) => !liveIds.has(id));
  if (unusedDecisions.length) console.log(`  · ${unusedDecisions.length} decision(s) match no current word (sentence edited or now agreed): ${unusedDecisions.slice(0, 8).join(', ')}`);
  const decidedButAgreed = cmp.wordRows.filter((r) => r.unanimous && decisions[r.id] && r.status === 'agreed').length;
  if (decidedButAgreed) console.log(`  · ${decidedButAgreed} decision(s) now redundant: all vocalizers agree with them`);

  // 5. build output (staged) + lint
  const finalsByKey = cmp.finals;
  const itemsByKey = new Map(items.map((it) => [it.key, it]));
  const built = new Map(); // file → json
  for (const f of files) built.set(f, JSON.parse(fs.readFileSync(path.join(opt.src, f), 'utf8')));
  for (const it of items) setAt(built.get(it.file), it.path, rebuild(it.text, finalsByKey.get(it.key).forms).normalize('NFC'));
  const lint = { errors: [], warnings: [] };
  for (const it of items) {
    const fin = finalsByKey.get(it.key);
    const text = rebuild(it.text, fin.forms);
    for (const iss of lintText(text, it.text)) {
      if (iss.wordIndex >= 0 && fin.status[iss.wordIndex] === 'unresolved') continue; // reported as a disagreement
      const id = iss.wordIndex >= 0 ? fin.ids[iss.wordIndex] : null;
      if (id && (decisions[id]?.lintAllow || []).includes(iss.rule)) continue;
      const rec = { level: iss.level, rule: iss.rule, msg: iss.msg, word: iss.word, wordId: id, file: it.file, path: it.pathStr, text };
      (iss.level === 'error' ? lint.errors : lint.warnings).push(rec);
    }
  }
  console.log(`5 lint: ${lint.errors.length} errors, ${lint.warnings.length} warnings`);
  for (const e of lint.errors.slice(0, 15)) console.log(`  ✖ [${e.rule}] ${e.word}  (${e.file} › ${e.path}, ${e.wordId})`);

  const unresolvedIds = cmp.disagreements.filter((d) => !d.decision || cmp.badDecisions.some((b) => b.id === d.id));
  const ok = !unresolvedIds.length && !lint.errors.length && !cmp.badDecisions.length;

  // 6. review page
  const passageFiles = files.filter((f) => f.startsWith('passages/') && built.get(f)?.paragraphs);
  const sample = samplePassages(passageFiles, { seed: opt.seed });
  const html = renderReview({
    disagreements: cmp.disagreements, finalsByKey, itemsByKey, vocIds,
    passages: sample.map((f) => ({ file: f, json: built.get(f) })),
    stats: s, lintSummary: { errors: lint.errors.length, warnings: lint.warnings.length },
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16), font: opt.font,
  });

  if (!opt.dry) {
    writeJson(path.join(opt.work, 'disagreements.json'), cmp.disagreements);
    writeJson(path.join(opt.work, 'skeleton-errors.json'), cmp.skeletonErrors);
    writeJson(path.join(opt.work, 'lint-report.json'), lint);
    if (!fs.existsSync(opt.decisions)) writeJson(opt.decisions, {});
    fs.writeFileSync(path.join(opt.work, 'review.html'), html);
    console.log(`6 review: ${rel(path.join(opt.work, 'review.html'))} (${cmp.disagreements.length} words, ${sample.length} sampled passage(s))`);
    if (ok) {
      const staging = path.join(opt.work, 'staging');
      fs.rmSync(staging, { recursive: true, force: true });
      if (opt.only && fs.existsSync(opt.build)) fs.cpSync(opt.build, staging, { recursive: true });
      for (const [f, json] of built) {
        fs.mkdirSync(path.dirname(path.join(staging, f)), { recursive: true });
        fs.writeFileSync(path.join(staging, f), JSON.stringify(json, null, 2) + '\n');
      }
      fs.rmSync(opt.build, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(opt.build), { recursive: true });
      fs.renameSync(staging, opt.build);
      console.log(`7 build: wrote ${built.size} file(s) to ${rel(opt.build)}`);
    } else {
      console.log(`7 build: NOT written — ${unresolvedIds.length} unresolved disagreement id(s), ${lint.errors.length} lint error(s), ${cmp.badDecisions.length} bad decision(s). See ${rel(opt.work)}/disagreements.json and lint-report.json`);
    }
  }
  const summary = {
    at: new Date().toISOString(), complete: true, ok, files: files.length, ...s,
    disagreementIds: cmp.disagreements.length, unresolvedIds: unresolvedIds.length,
    lintErrors: lint.errors.length, lintWarnings: lint.warnings.length, skeletonErrors: cmp.skeletonErrors.length,
    accuracy: Object.fromEntries(Object.entries(cmp.accuracy).map(([k, v]) => [k, { words: v.words, correct: v.correct, pct: v.pct, misses: v.misses.slice(0, 50) }])),
    timing, seconds: +((Date.now() - t0) / 1000).toFixed(1),
  };
  if (!opt.dry) writeJson(path.join(opt.work, 'last-run.json'), summary);
  console.log(`\nSUMMARY  strings ${s.strings} · words ${s.words} · agreement ${s.agreementPct}% · disagreements ${cmp.disagreements.length} (unresolved ${unresolvedIds.length}) · lint errors ${lint.errors.length} · warnings ${lint.warnings.length} · ${ok ? 'BUILD OK' : 'BUILD BLOCKED'}`);
  for (const [v, a] of Object.entries(cmp.accuracy)) console.log(`  ${v.padEnd(6)} matches final on ${a.correct}/${a.words} words (${a.pct}%)`);
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => { console.error(`✖ ${e.stack || e.message}`); process.exit(1); });
