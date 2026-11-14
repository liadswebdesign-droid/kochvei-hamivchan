// Exercises (task A) and missing-number items (task B). Pure functions, reproducible from (level, seed).
import { rng, apply } from './rng.js';

const BLANK = { blank: true };

// ---- operand pickers -------------------------------------------------------
// + within 100. carry=false → units add to < 10; carry=true → units add to >= 10.
function addPair(r, carry) {
  for (;;) {
    const a = r.int(11, 89);
    const b = r.chance(0.25) ? r.int(2, 9) : r.int(11, 79);
    const s = a + b;
    if (s > 100) continue;
    const c = (a % 10) + (b % 10) >= 10;
    if (c === carry) return [a, b];
  }
}
// − within 100. borrow=false → units of a >= units of b.
function subPair(r, borrow) {
  for (;;) {
    const a = r.int(20, 99);
    const b = r.chance(0.25) ? r.int(2, 9) : r.int(11, a - 2);
    if (b >= a) continue;
    const br = a % 10 < b % 10;
    if (br === borrow) return [a, b];
  }
}
function mulPair(r) {
  return [r.int(2, 10), r.int(2, 10)];
}

function pickOp(r, level) {
  if (level === 1) return { op: r.pick(['+', '−']), carry: false };
  if (level === 2) return { op: r.pick(['+', '−']), carry: true };
  // level 3: mostly × tables, some carry +/−
  return r.chance(0.65) ? { op: '×' } : { op: r.pick(['+', '−']), carry: true };
}
function pair(r, op, carry) {
  return op === '+' ? addPair(r, carry) : op === '−' ? subPair(r, carry) : mulPair(r);
}

// ---- task A: exercises  `47 + 15 = __` ------------------------------------
export function exercise(level, seed) {
  const r = rng(seed);
  const { op, carry } = pickOp(r, level);
  const [a, b] = pair(r, op, carry);
  const answer = apply(a, op, b);
  return {
    id: `g:ex:${level}:${seed}`,
    skill: 'exercises',
    kind: 'numeric',
    level,
    expr: [a, op, b, '=', BLANK],
    answer,
    hint: { key: op === '+' ? 'hint.exercise.add' : op === '−' ? 'hint.exercise.sub' : 'hint.exercise.mul', vars: { a, b } },
    sig: `${a}${op}${b}`,
  };
}

// ---- task B: missing number  `47 + __ = 62`, `82 − __ = 11`, `6 × __ = 36` ----
export function missing(level, seed) {
  const r = rng(seed);
  const { op, carry } = pickOp(r, level);
  const [a, b] = pair(r, op, carry);
  const c = apply(a, op, b);
  // Which operand is hidden. The first operand is hidden less often (harder, appears from level 2).
  const hideFirst = level >= 2 && r.chance(0.3);
  const expr = hideFirst ? [BLANK, op, b, '=', c] : [a, op, BLANK, '=', c];
  const answer = hideFirst ? a : b;
  const hintKey = op === '+' ? 'hint.missing.add' : op === '−' ? (hideFirst ? 'hint.missing.subFirst' : 'hint.missing.sub') : 'hint.missing.mul';
  return {
    id: `g:mn:${level}:${seed}`,
    skill: 'missing',
    kind: 'numeric',
    level,
    expr,
    answer,
    hint: { key: hintKey, vars: { a: hideFirst ? b : a, c } },
    sig: expr.map((t) => (t.blank ? '_' : t)).join(''),
  };
}

// ---- task B: inequalities  `47+15 < 47+__`, `87−__ > 87−15` ----------------
// Any non-negative whole number that makes the statement true is accepted.
export function inequality(level, seed) {
  const r = rng(seed);
  let op, a, b, a2;
  if (level === 1) {
    op = '+';
    a = r.int(12, 79);
    b = r.int(5, 19);
    a2 = a;
  } else if (level === 2) {
    op = r.chance(0.6) ? '−' : '+';
    a = op === '−' ? r.int(40, 99) : r.int(12, 79);
    b = r.int(6, Math.min(25, a - 10));
    a2 = a;
  } else {
    op = r.pick(['×', '+', '−']);
    if (op === '×') {
      a = r.int(2, 9);
      b = r.int(3, 9);
      a2 = a;
    } else {
      a = op === '−' ? r.int(40, 98) : r.int(12, 78);
      b = r.int(6, 25);
      a2 = a + (r.chance(0.5) ? 1 : -1); // different first number: compensate by one
      if (op === '−' && b >= a2) b = Math.floor(a2 / 2);
    }
  }
  const rel = r.pick(['<', '>']);
  const blankLeft = level >= 2 && r.chance(0.4);
  // known side: a op b ; blank side: a2 op __
  const known = [a, op, b];
  const blankSide = [a2, op, BLANK];
  const left = blankLeft ? blankSide : known;
  const right = blankLeft ? known : blankSide;
  const item = {
    id: `g:iq:${level}:${seed}`,
    skill: 'missing',
    kind: 'inequality',
    level,
    expr: [...left, rel, ...right],
    left,
    right,
    rel,
    sig: [...left, rel, ...right].map((t) => (t.blank ? '_' : t)).join(''),
  };
  Object.assign(item, solveInequality(item));
  item.hint = { key: a2 === a ? 'hint.ineq.same' : 'hint.ineq.near', vars: { a, a2 } };
  return item;
}

function evalSide(side, n) {
  const [x, op, y] = side.map((t) => (t && t.blank ? n : t));
  return apply(x, op, y);
}

export function checkInequality(item, n) {
  if (!Number.isInteger(n) || n < 0) return false;
  const L = evalSide(item.left, n);
  const R = evalSide(item.right, n);
  return item.rel === '<' ? L < R : L > R;
}

// The valid set is a ray of whole numbers: either "greater than bound" or "less than bound".
export function solveInequality(item) {
  const ok = (n) => checkInequality(item, n);
  if (ok(0)) {
    let n = 0;
    while (ok(n + 1) && n < 1000) n++;
    if (n >= 1000) throw new Error('inequality always true: ' + item.sig);
    const bound = n + 1;
    return { direction: 'less', bound, example: n };
  }
  let n = 0;
  while (!ok(n) && n < 1000) n++;
  if (n >= 1000) throw new Error('inequality never true: ' + item.sig);
  return { direction: 'greater', bound: n - 1, example: n };
}
