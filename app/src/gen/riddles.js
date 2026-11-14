// Picture riddles (task D) and "shape-digit" riddles (תרגילי משולשים). Pure, reproducible from (level, seed).
import { rng, numericOptions } from './rng.js';

export const ICONS = ['flower', 'star', 'gem', 'key', 'house', 'car', 'sun', 'apple', 'heart', 'moon', 'ball', 'fish'];

// ---- validation (shared with hand-made content) ----------------------------
// Brute force every icon over 0..max; returns all solutions (objects icon->value).
export function solveRiddle(rows, max = 30) {
  const icons = [...new Set(rows.flatMap((r) => r.terms))];
  const sols = [];
  const vals = new Array(icons.length).fill(0);
  const rec = (i) => {
    if (sols.length > 1) return;
    if (i === icons.length) {
      const m = Object.fromEntries(icons.map((ic, k) => [ic, vals[k]]));
      if (rows.every((r) => r.terms.reduce((s, t) => s + m[t], 0) === r.total)) sols.push(m);
      return;
    }
    for (let v = 0; v <= max; v++) {
      vals[i] = v;
      rec(i + 1);
    }
  };
  rec(0);
  return sols;
}

// ---- picture riddles --------------------------------------------------------
// Row templates per level, as letter strings: "AA" = A+A. Ask is the letter whose value is requested.
const TEMPLATES = {
  1: [
    { rows: ['AA', 'AAB'], ask: 'B' },
    { rows: ['AAA', 'AB'], ask: 'B' },
    { rows: ['AA', 'ABB'], ask: 'B' },
    { rows: ['AA', 'BA'], ask: 'B' },
  ],
  2: [
    { rows: ['AA', 'AB', 'BBC'], ask: 'C' },
    { rows: ['AAA', 'ABB'], ask: 'B' },
    { rows: ['AB', 'AAB'], ask: 'B' },
    { rows: ['AA', 'AB', 'BC'], ask: 'C' },
  ],
  3: [
    { rows: ['AAB', 'AB', 'BCC'], ask: 'C' },
    { rows: ['AB', 'ABB', 'ABC'], ask: 'C' },
    { rows: ['AAA', 'ABB', 'BCC'], ask: 'C' },
    { rows: ['AB', 'AAB', 'ABCC'], ask: 'C' },
  ],
};

export function pictureRiddle(level, seed) {
  const r = rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const tpl = r.pick(TEMPLATES[level]);
    const letters = [...new Set(tpl.rows.join(''))];
    const icons = r.shuffle(ICONS).slice(0, letters.length);
    const maxV = level === 1 ? 9 : level === 2 ? 10 : 12;
    const val = {};
    letters.forEach((L) => (val[L] = r.int(1, maxV)));
    if (new Set(Object.values(val)).size !== letters.length) continue; // distinct values read better
    const rows = tpl.rows.map((s) => {
      const terms = r.shuffle([...s]).map((L) => icons[letters.indexOf(L)]);
      return { terms, total: [...s].reduce((t, L) => t + val[L], 0) };
    });
    if (rows.some((row) => row.total > 40)) continue;
    const sols = solveRiddle(rows);
    if (sols.length !== 1) continue;
    const ask = icons[letters.indexOf(tpl.ask)];
    const answerValue = sols[0][ask];
    // Typical mistakes: last row's total; total minus the others without dividing by the count;
    // another icon's value; the first row's total; off by one.
    const last = rows[rows.length - 1];
    const k = last.terms.filter((t) => t === ask).length;
    const othersSum = last.terms.filter((t) => t !== ask).reduce((s, t) => s + sols[0][t], 0);
    const cands = r.shuffle([
      k > 1 ? last.total - othersSum : null,
      ...letters.filter((L) => L !== tpl.ask).map((L) => val[L]),
      rows[0].total,
      last.total,
    ]).concat([answerValue + 1, answerValue - 1, answerValue + 2]);
    const { options, answer } = numericOptions(answerValue, cands, r, { min: 1, max: 40 });
    return {
      id: `g:pr:${level}:${seed}`,
      skill: 'riddles',
      kind: 'mc',
      level,
      riddle: { rows, ask },
      solution: sols[0],
      options,
      answer,
      hint: { key: 'hint.riddle', vars: {} },
      sig: rows.map((x) => x.terms.join('+') + '=' + x.total).join('|'),
    };
  }
  throw new Error('pictureRiddle: no unique riddle found');
}

// ---- shape-digit riddles  1△ + 1△ = 28 ------------------------------------
// A term is a string of digits where "S" marks the shape (one hidden digit, same digit everywhere).
export const SHAPES = ['triangle', 'square', 'circle'];

export function termValue(term, d) {
  return Number(term.replace(/S/g, String(d)));
}
export function evalDigit(terms, ops, d) {
  let v = termValue(terms[0], d);
  for (let i = 1; i < terms.length; i++) v = ops[i - 1] === '+' ? v + termValue(terms[i], d) : v - termValue(terms[i], d);
  return v;
}
// All digits 0..9 that satisfy the equation (a leading shape cannot be 0).
export function solveDigit(terms, ops, total) {
  const out = [];
  for (let d = 0; d <= 9; d++) {
    if (d === 0 && terms.some((t) => t.length > 1 && t[0] === 'S')) continue;
    if (evalDigit(terms, ops, d) === total) out.push(d);
  }
  return out;
}

function digitForm(r, level) {
  const t = () => r.int(1, 4);
  if (level === 1) {
    // same tens, no carry: 1S + 1S = 28 / 2S + 1S
    const d = r.int(1, 4);
    const A = t(), B = r.chance(0.5) ? A : t();
    return { terms: [`${A}S`, `${B}S`], ops: ['+'], d };
  }
  if (level === 2) {
    const d = r.int(2, 9);
    const form = r.pick(['carry', 'tens', 'mixed']);
    if (form === 'carry') { const A = t(); return { terms: [`${A}S`, `${A}S`], ops: ['+'], d: r.int(5, 9) }; }
    if (form === 'tens') return { terms: [`S${r.int(1, 4)}`, `S${r.int(1, 5)}`], ops: ['+'], d: r.int(1, 4) };
    return { terms: [`S${r.int(1, 8)}`, `${r.int(1, 3)}S`], ops: ['+'], d: r.int(1, 6) };
  }
  const form = r.pick(['double', 'three', 'minus']);
  if (form === 'double') return { terms: ['SS', 'S'], ops: ['+'], d: r.int(2, 8) };
  if (form === 'three') { const A = r.int(1, 2); return { terms: [`${A}S`, `${A}S`, `${A}S`], ops: ['+', '+'], d: r.int(1, 9) }; }
  return { terms: [`${r.int(5, 9)}S`, `S${r.int(0, 9)}`], ops: ['−'], d: r.int(1, 4) };
}

export function digitRiddle(level, seed) {
  const r = rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const { terms, ops, d } = digitForm(r, level);
    const total = evalDigit(terms, ops, d);
    if (total <= 0 || total > 99) continue;
    const sols = solveDigit(terms, ops, total);
    if (sols.length !== 1 || sols[0] !== d) continue;
    const shape = r.pick(SHAPES);
    const full = termValue(terms[0], d);
    // Typical mistakes: answering the whole number (14 instead of 4), total ÷ count, units digit of the total, ±1.
    const cands = [
      terms[0].length > 1 ? full : null,
      ops.every((o) => o === '+') && total % terms.length === 0 ? total / terms.length : null,
      total % 10,
      Math.floor(total / 10),
      d + 1,
      d - 1,
      d + 2,
    ];
    const { options, answer } = numericOptions(d, cands, r, { min: 0, max: 99 });
    return {
      id: `g:dr:${level}:${seed}`,
      skill: 'riddles',
      kind: 'mc',
      level,
      digit: { terms, ops, total, shape },
      options,
      answer,
      hint: { key: 'hint.digit', vars: {} },
      sig: terms.join(ops[0]) + '=' + total,
    };
  }
  throw new Error('digitRiddle: no unique riddle found');
}
