// Turn proofreader findings into word decisions (content/nikud/decisions.json).
// A finding names a built string (file + JSON path) and one vocalized word in it; the word id is computed from the
// SOURCE item exactly as the pipeline does, so the decision overrides that word even where every vocalizer agreed.
//   node tools/nikud/apply-proofread.mjs <findings.json>... [--dry]
// Finding: { file, path, current, proposed, reason }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, listSourceFiles, wordId } from './lib/extract.mjs';
import { words, skeleton } from './lib/hebrew.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'content/src');
const BUILD = path.join(root, 'content/build');
const DECISIONS = path.join(root, 'content/nikud/decisions.json');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const findings = args.filter((a) => !a.startsWith('--')).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));

const { items } = extract(SRC, listSourceFiles(SRC));
const byKey = new Map(items.map((it) => [`${it.file}#${it.pathStr}`, it]));
const N = (s) => s.normalize('NFC');

function builtString(file, pathStr) {
  let node = JSON.parse(fs.readFileSync(path.join(BUILD, file), 'utf8'));
  if (typeof node[pathStr] === 'string') return node[pathStr]; // ui.json: flat dotted keys
  for (const m of pathStr.matchAll(/\[(\d+)\]|\.?([^.[\]]+)/g)) node = node?.[m[1] !== undefined ? Number(m[1]) : m[2]];
  return node;
}

const decisions = JSON.parse(fs.readFileSync(DECISIONS, 'utf8'));
let ok = 0;
const problems = [];
for (const f of findings) {
  const pathStr = f.path;
  const it = byKey.get(`${f.file}#${pathStr}`);
  const built = it && builtString(f.file, pathStr);
  if (!it || typeof built !== 'string') { problems.push([f, 'no such string']); continue; }
  if (skeleton(N(f.current)) !== skeleton(N(f.proposed))) { problems.push([f, 'letters differ']); continue; }
  const bw = words(N(built));
  const idxs = bw.map((w, i) => (w === N(f.current) ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) { problems.push([f, `"${f.current}" not found in built string`]); continue; }
  for (const i of idxs) {
    const id = wordId(it, i);
    decisions[id] = { form: N(f.proposed), reason: `proofread: ${f.reason}` };
  }
  ok++;
}
console.log(`applied ${ok} finding(s), ${problems.length} problem(s)`);
for (const [f, why] of problems) console.log(`  ✖ ${f.file} ${f.path} ${f.current} → ${f.proposed}: ${why}`);
if (!dry) fs.writeFileSync(DECISIONS, JSON.stringify(decisions, null, 2) + '\n');
