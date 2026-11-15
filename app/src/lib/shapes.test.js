import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COLORS, SHAPES, ROTATIONS, SHAPE_UI_KEYS, canonical, sameTile, diffAttrs, tokenProblems, tileLabel, tokenText,
  expectedTile, explainSequence, ruleUsesColour,
} from './shapes.js';

const T = (s, c = 'blue', o = {}) => ({ s, c, r: 0, n: 1, f: 'full', ...o });
const ui = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../dev-fixtures/ui.json'), 'utf8'));
const t = (k, vars) => {
  let s = ui[k];
  if (s == null) throw new Error('missing ui key ' + k);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, v) => (vars[v] != null ? String(vars[v]) : m));
  return s;
};

describe('tokens', () => {
  it('accepts a full token and rejects unknown values, missing keys and meaningless turns', () => {
    expect(tokenProblems(T('arrow', 'red', { r: 135, n: 3 }))).toEqual([]);
    expect(tokenProblems({ s: 'circle', c: 'blue', r: 0, n: 1 })[0]).toMatch(/keys/);
    expect(tokenProblems(T('pentagon'))[0]).toMatch(/unknown shape/);
    expect(tokenProblems(T('circle', 'green'))[0]).toMatch(/unknown colour/);
    expect(tokenProblems(T('star', 'blue', { r: 90 }))[0]).toMatch(/only turned when half-filled/);
    expect(tokenProblems(T('triangle', 'blue', { r: 45 }))[0]).toMatch(/quarter turns/);
    expect(tokenProblems(T('arrow', 'blue', { f: 'half' }))[0]).toMatch(/two ways/);
    expect(tokenProblems(T('square', 'blue', { n: 6 }))[0]).toMatch(/n must be/);
    expect(tokenProblems(T('square', 'blue', { f: 'half', r: 90 }))).toEqual([]);
  });
  it('compares tiles as they look', () => {
    expect(sameTile(T('circle', 'blue', { r: 0 }), canonical(T('circle')))).toBe(true);
    expect(sameTile(T('arrow', 'blue', { r: 90 }), T('arrow', 'blue', { r: 270 }))).toBe(false);
    expect(sameTile(T('circle', 'blue', { f: 'half', r: 0 }), T('circle', 'blue', { f: 'half', r: 180 }))).toBe(false);
    expect(diffAttrs(T('arrow', 'red', { r: 180 }), T('triangle', 'red', { r: 180 }))).toEqual(['s']);
    expect(diffAttrs(T('arrow', 'red', { r: 90 }), T('circle', 'red'))).toEqual(['s']); // a circle points nowhere
    expect(diffAttrs(T('circle', 'red', { f: 'half', r: 90 }), T('circle', 'red'))).toEqual(['f']);
    expect(diffAttrs(T('star', 'red', { n: 2 }), T('star', 'blue', { n: 3 }))).toEqual(['c', 'n']);
  });
});

describe('labels', () => {
  it('builds Hebrew labels from ui keys: shape, colour, count, fill and direction', () => {
    expect(tileLabel(T('triangle', 'blue'), t)).toBe('משולש כחול מצביע למעלה');
    expect(tileLabel(T('arrow', 'red', { r: 90, n: 3 }), t)).toBe('3 חצים אדומים מצביעים ימינה');
    expect(tileLabel(T('circle', 'yellow', { n: 2, f: 'empty' }), t)).toBe('2 עיגולים צהובים ריקים');
    expect(tileLabel(T('heart', 'red', { f: 'empty' }), t)).toBe('לב אדום ריק');
    // half fill: at r=0 the bottom half is coloured, and a quarter turn clockwise moves it to the left
    expect(tileLabel(T('square', 'blue', { f: 'half' }), t)).toBe('ריבוע כחול, החצי הצבוע למטה');
    expect(tileLabel(T('circle', 'blue', { f: 'half', r: 90 }), t)).toBe('עיגול כחול, החצי הצבוע שמאלה');
  });
  it('every label key exists in the master ui.json, with a name for every shape, colour and turn', () => {
    expect(SHAPE_UI_KEYS.filter((k) => !(k in ui))).toEqual([]);
    expect(SHAPE_UI_KEYS.length).toBe(SHAPES.length * 2 + Object.keys(COLORS).length * 2 + ROTATIONS.length + 6);
  });
  it('writes tiles as symbols for the parent screen', () => {
    expect(tokenText(T('triangle', 'red', { r: 180 }))).toBe('▼');
    expect(tokenText(T('arrow', 'red', { r: 315 }))).toBe('↖');
    expect(tokenText(T('heart', 'red', { n: 3 }))).toBe('♥♥♥');
    expect(tokenText(T('circle', 'red', { f: 'half' }))).toBe('◐');
    expect(tokenText('?')).toBe('?');
  });
});

describe('colour-blind safe palette', () => {
  // Machado et al. (2009) full-severity CVD matrices in linear RGB; CIE76 ΔE in Lab between every pair of colours.
  const M = {
    none: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rgb = (hex) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const lab = ([r, g, b]) => {
    const cl = (v) => Math.min(1, Math.max(0, v));
    [r, g, b] = [cl(r), cl(g), cl(b)];
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const sim = (hex, m) => {
    const c = rgb(hex);
    return lab(m.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2]));
  };
  it('keeps every pair of colours clearly apart (ΔE ≥ 30) with and without colour-vision deficiency', () => {
    const ids = Object.keys(COLORS);
    for (const [name, m] of Object.entries(M)) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = sim(COLORS[ids[i]], m);
          const b = sim(COLORS[ids[j]], m);
          const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          expect(dE, `${ids[i]}/${ids[j]} under ${name}`).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });
});

describe('rules', () => {
  const arrows = [0, 90, 180, 270, 0].map((r) => T('arrow', 'blue', { r }));
  it('recomputes the answer of a step, a cycle and two interleaved series', () => {
    expect(expectedTile({ r: { step: 90 } }, [...arrows, '?'])).toEqual({ ok: true, value: canonical(T('arrow', 'blue', { r: 90 })) });
    const ab = [T('star', 'red'), T('star', 'yellow'), T('star', 'red'), T('star', 'yellow'), '?'];
    expect(sameTile(expectedTile({ c: { cycle: 2 } }, ab).value, T('star', 'red'))).toBe(true);
    const inter = [T('arrow'), T('circle', 'red'), T('arrow', 'blue', { r: 90 }), T('circle', 'red', { n: 2 }), T('arrow', 'blue', { r: 180 }), T('circle', 'red', { n: 3 }), '?'];
    const e = expectedTile({ interleave: [{ r: { step: 90 } }, { n: { step: 1 } }] }, inter);
    expect(sameTile(e.value, T('arrow', 'blue', { r: 270 }))).toBe(true);
    // the gap in the middle
    const mid = [T('circle'), T('circle', 'blue', { n: 2 }), '?', T('circle', 'blue', { n: 4 })];
    expect(expectedTile({ n: { step: 1 } }, mid).value.n).toBe(3);
  });
  it('rejects rules the tiles break, or that the tiles cannot show yet', () => {
    expect(expectedTile({ r: { step: 45 } }, [...arrows, '?']).ok).toBe(false);
    expect(expectedTile({}, [...arrows, '?']).why).toMatch(/not the same/);
    expect(expectedTile({ s: { cycle: 3 } }, [T('circle'), T('square'), T('star'), '?']).why).toMatch(/needs at least 6/);
    expect(expectedTile({ n: { step: 1 } }, [T('circle', 'blue', { n: 4 }), T('circle', 'blue', { n: 5 }), T('circle', 'blue', { n: 6 }), '?']).ok).toBe(false);
    expect(expectedTile({ r: { step: 90 } }, arrows).why).toMatch(/exactly one/);
  });
  it('finds a rival rule for an ambiguous option, and none for a wrong one', () => {
    // ↑ → ? ← ↑ →  : "↓" is the answer; "↑" also works if read as two series (↑ ↑ ↑ and → ← →)
    const seq = [0, 90, null, 270, 0, 90].map((r) => (r === null ? '?' : T('arrow', 'red', { r })));
    const fill = (tok) => seq.map((x) => (x === '?' ? tok : x));
    expect(explainSequence(fill(T('arrow', 'red', { r: 180 })), 2)).toEqual({ r: { step: 90 } });
    expect(explainSequence(fill(T('arrow', 'red', { r: 0 })), 2)).toEqual({ interleave: [{}, { r: { step: 180 } }] });
    expect(explainSequence(fill(T('arrow', 'red', { r: 90 })), 2)).toBe(null);
  });
  it('knows when an item is about colour', () => {
    expect(ruleUsesColour({ c: { cycle: 2 } })).toBe(true);
    expect(ruleUsesColour({ interleave: [{ n: { step: 1 } }, { c: { cycle: 2 } }] })).toBe(true);
    expect(ruleUsesColour({ s: { cycle: 2 }, c: 'same' })).toBe(false);
  });
});
