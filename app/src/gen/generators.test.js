import { describe, it, expect } from 'vitest';
import {
  exercise, missing, inequality, pictureRiddle, digitRiddle, itemFromId, checkInequality, solveRiddle, solveDigit,
} from './index.js';
import { apply } from './rng.js';
import { evalDigit } from './riddles.js';

const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);
const LEVELS = [1, 2, 3];
const nums = (expr) => expr.filter((t) => typeof t === 'number');

describe('exercises', () => {
  it('answers are correct, within 100, and respect carrying by level', () => {
    for (const L of LEVELS) for (const s of SEEDS) {
      const it = exercise(L, s);
      const [a, op, b] = it.expr;
      expect(apply(a, op, b)).toBe(it.answer);
      expect(it.answer).toBeGreaterThanOrEqual(0);
      expect(it.answer).toBeLessThanOrEqual(100);
      if (op === '×') { expect(a).toBeLessThanOrEqual(10); expect(b).toBeLessThanOrEqual(10); expect(L).toBe(3); }
      if (L === 1 && op === '+') expect((a % 10) + (b % 10)).toBeLessThan(10);
      if (L === 1 && op === '−') expect(a % 10).toBeGreaterThanOrEqual(b % 10);
      if (L === 2 && op === '+') expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(10);
      if (L === 2 && op === '−') expect(a % 10).toBeLessThan(b % 10);
    }
  });
  it('level 3 includes multiplication tables', () => {
    expect(SEEDS.some((s) => exercise(3, s).expr[1] === '×')).toBe(true);
  });
});

describe('missing number', () => {
  it('the blank value completes the equation', () => {
    for (const L of LEVELS) for (const s of SEEDS) {
      const it = missing(L, s);
      const e = it.expr.map((t) => (t.blank ? it.answer : t));
      expect(apply(e[0], e[1], e[2])).toBe(e[4]);
      expect(it.expr.filter((t) => t.blank)).toHaveLength(1);
      expect(nums(it.expr).every((n) => n >= 0 && n <= 100)).toBe(true);
    }
  });
});

describe('inequalities', () => {
  it('accept every number on the right side of the bound and nothing else', () => {
    for (const L of LEVELS) for (const s of SEEDS) {
      const it = inequality(L, s);
      expect(checkInequality(it, it.example)).toBe(true);
      for (let n = 0; n <= 150; n++) {
        const want = it.direction === 'greater' ? n > it.bound : n < it.bound;
        expect(checkInequality(it, n)).toBe(want);
      }
      expect(checkInequality(it, -1)).toBe(false);
      expect(checkInequality(it, 2.5)).toBe(false);
    }
  });
  it('the official example: 47+15 < 47+__ accepts any number greater than 15', () => {
    const it = { left: [47, '+', 15], right: [47, '+', { blank: true }], rel: '<' };
    expect(checkInequality(it, 15)).toBe(false);
    expect(checkInequality(it, 16)).toBe(true);
    expect(checkInequality(it, 500)).toBe(true);
    const it2 = { left: [87, '−', { blank: true }], right: [87, '−', 15], rel: '>' };
    expect(checkInequality(it2, 14)).toBe(true);
    expect(checkInequality(it2, 15)).toBe(false);
  });
});

describe('picture riddles', () => {
  it('have a unique brute-force solution and 4 distinct options containing the answer', () => {
    for (const L of LEVELS) for (const s of SEEDS.slice(0, 150)) {
      const it = pictureRiddle(L, s);
      const sols = solveRiddle(it.riddle.rows, 30);
      expect(sols).toHaveLength(1);
      expect(it.options).toHaveLength(4);
      expect(new Set(it.options).size).toBe(4);
      expect(it.options[it.answer]).toBe(sols[0][it.riddle.ask]);
      expect(it.riddle.rows.length).toBeGreaterThanOrEqual(2);
      expect(it.riddle.rows.length).toBeLessThanOrEqual(3);
    }
  });
  it('validates the schema example (flower+flower=6, flower+flower+star=14 → star=8)', () => {
    const sols = solveRiddle([{ terms: ['flower', 'flower'], total: 6 }, { terms: ['flower', 'flower', 'star'], total: 14 }]);
    expect(sols).toEqual([{ flower: 3, star: 8 }]);
  });
});

describe('shape-digit riddles', () => {
  it('have exactly one digit solution and the options contain it', () => {
    for (const L of LEVELS) for (const s of SEEDS) {
      const it = digitRiddle(L, s);
      const { terms, ops, total } = it.digit;
      const sols = solveDigit(terms, ops, total);
      expect(sols).toHaveLength(1);
      expect(it.options[it.answer]).toBe(sols[0]);
      expect(evalDigit(terms, ops, sols[0])).toBe(total);
      expect(new Set(it.options).size).toBe(4);
    }
  });
  it('1△ + 1△ = 28 → 4', () => {
    expect(solveDigit(['1S', '1S'], ['+'], 28)).toEqual([4]);
  });
  it('offers the whole-number mistake (14 instead of 4) when possible', () => {
    const withFull = SEEDS.map((s) => digitRiddle(1, s)).filter((it) => it.options.includes(Number(it.digit.terms[0].replace('S', it.options[it.answer]))));
    expect(withFull.length).toBeGreaterThan(SEEDS.length * 0.5);
  });
});

describe('ids', () => {
  it('regenerate the identical item', () => {
    for (const make of [exercise, missing, inequality, pictureRiddle, digitRiddle]) {
      const it = make(2, 12345);
      expect(itemFromId(it.id)).toEqual(it);
    }
    expect(itemFromId('wp-001')).toBeNull();
  });
});

describe('the minus sign', () => {
  // The booklet prints a real minus. Every generated operator must be U+2212 "−", never the ASCII hyphen "-" (the
  // text font draws the two alike, fonts.css 'KH Minus' fixes the glyph; this keeps the data honest).
  it('every generated item uses U+2212, never "-" or "–"', () => {
    const ops = new Set();
    for (const L of LEVELS) for (const s of SEEDS.slice(0, 150)) {
      for (const it of [exercise(L, s), missing(L, s), inequality(L, s)]) for (const tok of it.expr) if (typeof tok === 'string') ops.add(tok);
      for (const op of digitRiddle(L, s).digit.ops) ops.add(op);
    }
    expect([...ops].filter((o) => /[-–‐‑]/.test(o))).toEqual([]);
    expect(ops.has('−')).toBe(true);
  });
});
