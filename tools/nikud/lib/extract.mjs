// Stage 1: walk content/src, collect every Hebrew string with its file + JSON path, and group the strings into
// "units" — the context windows the vocalizers see. A passage's title + lines form one unit (so the paragraph
// disambiguates its words); each question (stem + options + explanation) is a unit; each word problem / bonus item
// is a unit; each ui.json string is a unit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hasHebrew, hasMarks, parseHints, hintsToWordIndex, words, looseSkeleton } from './hebrew.mjs';

// Keys whose string values are never vocalized even if they contained Hebrew (ids, enums, code).
const SKIP_KEYS = new Set(['id', 'type', 'kind', 'topic', 'image', 'check', 'ask', 'icon', 'key']);

export const sha = (s, n = 16) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.()|{}[]'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

export function listSourceFiles(srcDir, only) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.json')) out.push(path.relative(srcDir, full).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(srcDir)) walk(srcDir);
  const re = only ? globToRegExp(only) : null;
  return re ? out.filter((f) => re.test(f)) : out;
}

export const pathToString = (p) => p.map((k, i) => (typeof k === 'number' ? `[${k}]` : i === 0 ? k : `.${k}`)).join('');

function walkStrings(node, p, out) {
  if (typeof node === 'string') {
    if (hasHebrew(node)) out.push({ path: p, value: node });
  } else if (Array.isArray(node)) node.forEach((v, i) => walkStrings(v, [...p, i], out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walkStrings(v, [...p, k], out);
  }
}

const isPassage = (json) => json && !Array.isArray(json) && Array.isArray(json.paragraphs);

function unitGroup(json, p) {
  if (isPassage(json)) return p[0] === 'questions' ? `questions[${p[1]}]` : 'text';
  if (Array.isArray(json)) return `[${p[0]}]`;
  return String(p[0]);
}

/**
 * @returns {{ items, units, errors }}
 *  item: { key, file, path, pathStr, original, text, hints:Map<wordIdx,form>, words:string[], unitKey, context }
 *  unit: { key, file, group, items:[item], joins:[' '|'\n'] }  (joins[i] = separator after item i, for Dicta)
 */
export function extract(srcDir, files) {
  const items = [];
  const units = [];
  const errors = [];
  for (const file of files) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
    } catch (e) {
      errors.push({ file, error: `invalid JSON: ${e.message}` });
      continue;
    }
    const found = [];
    walkStrings(json, [], found);
    const groups = new Map();
    for (const { path: p, value } of found) {
      const pathStr = pathToString(p);
      let parsed;
      try {
        parsed = parseHints(value.normalize('NFC'));
      } catch (e) {
        errors.push({ file, path: pathStr, error: e.message });
        continue;
      }
      if (hasMarks(parsed.text)) {
        errors.push({ file, path: pathStr, error: 'source already has nikud outside a {{word|hint}} — src must be unvocalized' });
        continue;
      }
      let hints;
      try {
        hints = hintsToWordIndex(parsed.text, parsed.hints);
      } catch (e) {
        errors.push({ file, path: pathStr, error: e.message });
        continue;
      }
      const item = {
        key: `${file}#${pathStr}`, file, path: p, pathStr, original: value, text: parsed.text, hints,
        words: words(parsed.text), context: parsed.text,
      };
      items.push(item);
      const g = unitGroup(json, p);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(item);
    }
    // Paragraph context for passage lines (shown to reviewers next to each disagreement).
    if (isPassage(json)) {
      for (const [, list] of groups) {
        for (const it of list) {
          if (it.path[0] === 'paragraphs') {
            const para = json.paragraphs[it.path[1]].map((l) => parseHints(String(l).normalize('NFC')).text);
            it.context = para.join(' ');
          }
        }
      }
    }
    for (const [group, list] of groups) {
      const joins = list.map((it, i) => {
        const next = list[i + 1];
        const sameParagraph = next && it.path[0] === 'paragraphs' && next.path[0] === 'paragraphs' && it.path[1] === next.path[1];
        return sameParagraph ? ' ' : '\n';
      });
      const key = sha(JSON.stringify(list.map((it) => it.text)), 20);
      const unit = { key, file, group, items: list, joins };
      for (const it of list) it.unitKey = key;
      units.push(unit);
    }
  }
  return { items, units, errors };
}

/** Stable id of one word occurrence: skeleton word + the item's source text + which occurrence of that word it is. */
export function wordId(item, wordIndex) {
  const w = looseSkeleton(item.words[wordIndex]);
  let occ = 0;
  for (let i = 0; i < wordIndex; i++) if (looseSkeleton(item.words[i]) === w) occ++;
  return 'w-' + sha(`${w}␟${looseSkeleton(item.text)}␟${occ}`, 12);
}
