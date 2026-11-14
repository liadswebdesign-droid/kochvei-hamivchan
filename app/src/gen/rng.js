// Seeded PRNG (mulberry32) so every generated item is reproducible from its id: g:<type>:<level>:<seed>.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

// Apply an operator. Symbols are the display ones: + − ×
export function apply(a, op, b) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  throw new Error('bad op ' + op);
}

// Build 4 sorted, distinct numeric options from the answer and an ordered list of "typical mistake" candidates.
export function numericOptions(answer, candidates, r, { min = 0, max = 200 } = {}) {
  const set = new Set([answer]);
  for (const c of candidates) {
    if (set.size >= 4) break;
    if (Number.isInteger(c) && c >= min && c <= max && !set.has(c)) set.add(c);
  }
  let step = 1;
  while (set.size < 4) {
    const c = answer + (r.chance(0.5) ? step : -step);
    if (c >= min && c <= max) set.add(c);
    step++;
  }
  const options = [...set].sort((x, y) => x - y);
  return { options, answer: options.indexOf(answer) };
}
