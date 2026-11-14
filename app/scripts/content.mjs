#!/usr/bin/env node
// Copies content into app/public/content/ for the app to fetch.
//
//   npm run content            STRICT (used by `npm run build`): copies ../content/build. Fails if any required
//                              file is missing or ui.json lacks a key the app uses. Never falls back to fixtures.
//   npm run content -- --dev   DEV: uses ../content/build when complete, otherwise app/dev-fixtures (with a warning).
//   npm run content -- --preview
//                              Same as --dev, for an explicit preview deploy. Fixture output is stamped
//                              source:"fixtures" in manifest.json; vite.config.js refuses to build such output unless
//                              KH_ALLOW_FIXTURES=1, and the app shows a "preview content" banner.
//   KH_CONTENT=src (with --dev / --preview): skip content/build and use content/src → dev-fixtures (layout QA with the
//                              real full-length drafts; also what --dev does anyway while content/build is missing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.resolve(APP, '../content/build');
const FIXTURES = path.join(APP, 'dev-fixtures');
const OUT = path.join(APP, 'public/content');

const REQUIRED_FILES = ['ui.json', 'word-problems.json'];
const OPTIONAL_FILES = [
  'picture-riddles.json',
  'bonus/analogies.json', 'bonus/series.json', 'bonus/sentences.json', 'bonus/odd-one-out.json',
];

const mode = process.argv.includes('--preview') ? 'preview' : process.argv.includes('--dev') ? 'dev' : 'strict';

function problems(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return [`${dir} does not exist`];
  for (const f of REQUIRED_FILES) if (!fs.existsSync(path.join(dir, f))) out.push(`missing ${f}`);
  const pdir = path.join(dir, 'passages');
  const passages = fs.existsSync(pdir) ? fs.readdirSync(pdir).filter((f) => f.endsWith('.json') && f !== 'index.json') : [];
  if (!passages.length) out.push('missing passages/*.json (need at least one)');
  if (fs.existsSync(path.join(dir, 'ui.json'))) {
    const ui = JSON.parse(fs.readFileSync(path.join(dir, 'ui.json'), 'utf8'));
    const needed = Object.keys(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'ui.json'), 'utf8'))).filter((k) => !k.startsWith('_'));
    const missing = needed.filter((k) => typeof ui[k] !== 'string' || !ui[k].trim());
    if (missing.length) out.push(`ui.json lacks ${missing.length} key(s) the app uses: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''} (see app/UI_KEYS.md)`);
  }
  return out;
}

const buildProblems = problems(BUILD);
// Dev/preview fallback, per file: content/build → content/src (unvocalized drafts) → app/dev-fixtures.
// ui.json is merged: fixture keys (the app's master key list) overlaid with any src/build values.
const SRC = path.resolve(APP, '../content/src');
let sources; // ordered list of folders to read from
// KH_CONTENT=src (dev/preview only): read content/src even when content/build is complete, e.g. to lay out and QA
// the full-length drafts (`KH_CONTENT=src scripts/serve.sh dev 5199`). Nothing is ever written to content/.
const forceSrc = process.env.KH_CONTENT === 'src';
if (forceSrc && mode === 'strict') {
  console.error('\n✖ content: KH_CONTENT=src is for dev/preview only; a strict build always uses content/build.\n');
  process.exit(1);
}
if (forceSrc) {
  console.warn('⚠ content: KH_CONTENT=src → using content/src → app/dev-fixtures per file — NOT FOR SHIPPING');
  sources = [SRC, FIXTURES];
} else if (!buildProblems.length) sources = [BUILD];
else if (mode === 'strict') {
  console.error('\n✖ content: ../content/build is not complete, refusing to build (dev fixtures are never shipped).');
  for (const p of buildProblems) console.error('   - ' + p);
  console.error('  Run the nikud pipeline first, or use `npm run dev` / `npm run build:preview` for a fixture preview.\n');
  process.exit(1);
} else {
  console.warn('⚠ content: ../content/build not complete (' + buildProblems.join('; ') + ')');
  console.warn('⚠ content: using content/build → content/src → app/dev-fixtures per file — NOT FOR SHIPPING');
  sources = [BUILD, SRC, FIXTURES];
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'passages'), { recursive: true });
const used = {};
const read = (from) => JSON.parse(fs.readFileSync(from, 'utf8'), (k, v) => (typeof v === 'string' ? v.normalize('NFC') : v));
const write = (rel, data) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  // Re-serialized: validates JSON and NFC-normalizes every string.
  fs.writeFileSync(path.join(OUT, rel), JSON.stringify(data));
};
const copy = (rel) => {
  for (const dir of sources) {
    const from = path.join(dir, rel);
    if (fs.existsSync(from)) {
      const data = read(from);
      write(rel, data);
      used[rel] = path.relative(path.resolve(APP, '..'), dir);
      return data;
    }
  }
  return false;
};
if (sources.length === 1) copy('ui.json');
else {
  let ui = {};
  for (const dir of [...sources].reverse()) if (fs.existsSync(path.join(dir, 'ui.json'))) ui = { ...ui, ...read(path.join(dir, 'ui.json')) };
  write('ui.json', ui);
  used['ui.json'] = 'merged';
}
copy('word-problems.json');
const optional = OPTIONAL_FILES.filter((f) => copy(f));
const pdir = sources.map((d) => path.join(d, 'passages')).find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.json') && f !== 'index.json'));
const passages = fs.readdirSync(pdir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()
  .map((f) => {
    const p = read(path.join(pdir, f));
    write('passages/' + f, p);
    return { id: p.id, kind: p.kind, title: p.title, level: p.level, questions: p.questions.length };
  });
used.passages = path.relative(path.resolve(APP, '..'), path.dirname(pdir));
fs.writeFileSync(path.join(OUT, 'passages/index.json'), JSON.stringify(passages));
const manifest = {
  source: sources.length === 1 ? 'content-build' : 'fixtures',
  files: used,
  passages: passages.length,
  optional,
  generated: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`✓ content: ${manifest.source} → public/content (${passages.length} passages, optional: ${optional.join(', ') || 'none'})`);
if (sources.length > 1) console.log('  from:', JSON.stringify(used));
