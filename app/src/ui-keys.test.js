// Every ui.json key the app uses must exist in dev-fixtures/ui.json (the master list that the strict content build
// checks content/build/ui.json against), and every master key must actually be used.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { companions } from './config.js';
import { SHAPES } from './gen/riddles.js';

const ui = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dev-fixtures/ui.json'), 'utf8'));
const master = Object.keys(ui).filter((k) => !k.startsWith('_'));

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return sources(p);
    return /\.(jsx?|mjs)$/.test(d.name) && !d.name.endsWith('.test.js') ? [fs.readFileSync(p, 'utf8')] : [];
  });
}
const code = sources(__dirname).join('\n');
const PREFIX = '(?:app|common|profile|companion|map|island|instr|mc|numpad|practice|feedback|hint|results|sim|parent)';
const literal = [...code.matchAll(new RegExp(`'(${PREFIX}\\.[\\w.-]+)'`, 'g'))].map((m) => m[1]).filter((k) => !k.endsWith('.'));
const dynamic = [
  ...companions.map((c) => 'companion.' + c.id),
  ...[1, 2, 3, 4].map((n) => 'mc.label.' + n),
  ...[1, 2, 3, 4].map((n) => 'feedback.correct.' + n),
  ...SHAPES.map((s) => 'instr.digit.ask.' + s),
  ...['analogy', 'sentence', 'series', 'odd-one-out'].map((b) => 'instr.bonus.' + b),
];
const used = new Set([...literal, ...dynamic]);

describe('ui keys', () => {
  it('every key used in code exists in the master ui.json', () => {
    expect([...used].filter((k) => !(k in ui))).toEqual([]);
  });
  it('every master key is used somewhere', () => {
    expect(master.filter((k) => !used.has(k))).toEqual([]);
  });
});
