#!/usr/bin/env node
// Regenerates app/UI_KEYS.md from app/dev-fixtures/ui.json (the master key list). `npm run ui-keys`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = JSON.parse(fs.readFileSync(path.join(APP, 'dev-fixtures/ui.json'), 'utf8'));
const keys = Object.keys(ui).filter((k) => !k.startsWith('_'));
const groups = {};
for (const k of keys) (groups[k.split('.')[0]] ||= []).push(k);
const TITLES = {
  app: 'App', common: 'Shared buttons', profile: 'Profiles', companion: 'Companion names (one per entry in src/config.js)',
  map: 'World map', island: 'Island names', instr: 'Instructions', mc: 'Answer labels', numpad: 'Number pad (screen-reader labels)',
  practice: 'Practice screen', feedback: 'Feedback after an answer', hint: 'Hints for generated math items', results: 'Results screen',
};
let md = `# UI text keys

Every Hebrew string the app shows comes from \`ui.json\` through these keys. The values below are **unvocalized
placeholders** (from \`app/dev-fixtures/ui.json\`); the content team writes the final text into \`content/src/ui.json\`
and the nikud pipeline vocalizes it into \`content/build/ui.json\`.

- \`{name}\`, \`{n}\`, \`{total}\`, \`{bound}\`, \`{example}\`, \`{a}\`, \`{b}\`, \`{c}\`, \`{lines}\` are filled in by the app. Keep them
  exactly as written (Latin, curly braces). A number placeholder after a one-letter prefix takes the real maqaf: \`מ־{bound}\`.
- Addressing the child: plural in instructions ("קראו", "פתרו"), gender-neutral or plural in companion lines.
- \`npm run build\` fails if \`content/build/ui.json\` lacks any key in this list (scripts/content.mjs).
- Total: ${keys.length} keys. Regenerate this file with \`npm run ui-keys\`.

`;
for (const [g, ks] of Object.entries(groups)) {
  md += `## ${TITLES[g] || g}\n\n| Key | Placeholder (unvocalized) |\n|---|---|\n`;
  for (const k of ks) md += `| \`${k}\` | ${ui[k].replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, "").replace(/\|/g, "\\|")} |\n`;
  md += '\n';
}
fs.writeFileSync(path.join(APP, 'UI_KEYS.md'), md);
console.log(`UI_KEYS.md: ${keys.length} keys`);
