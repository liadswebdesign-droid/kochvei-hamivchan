// Shape-pattern items (content/src/bonus/shape-series.json): the token vocabulary, visual equality, screen-reader labels,
// a plain-text form for the parent screen, and the rule engine the content validator uses to recompute every answer.
// Pure and DOM-free: the app renders tokens in components/Shapes.jsx; tools/check-content/validate.mjs imports this file.
//
// A token is one tile: { s: shape, c: colour, r: rotation, n: copies, f: fill }, all five keys, Latin values only (the
// nikud pipeline only extracts strings that contain Hebrew, so tokens never reach it).
//   r = clockwise degrees from "pointing up". Rotation is a property of the drawing itself, independent of where the tile
//   sits, so it reads the same in the RTL sequence (first tile on the right) as it would in LTR; nothing is mirrored.
//   f = 'full' | 'empty' (outline) | 'half' (at r=0 the BOTTOM half is coloured; r turns that half clockwise).

export const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'arrow', 'hexagon'];
// Three colours that stay apart for the common colour-vision deficiencies (checked in shapes.test.js by simulating
// protanopia, deuteranopia and tritanopia): a dark blue, a light yellow and a mid red. No green (it collides with red).
export const COLORS = { blue: '#1f62d0', yellow: '#ffc61a', red: '#e0342f' };
export const COLOR_IDS = Object.keys(COLORS);
export const FILLS = ['full', 'empty', 'half'];
export const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];
export const MAX_N = 5;
export const ATTRS = ['s', 'c', 'r', 'n', 'f'];
// Shapes that may be turned (they point somewhere). Any shape may be turned when half-filled (the coloured half moves).
// Others are never rotated in content: a turned square would read as a diamond, a turned star or hexagon is too subtle.
export const ROTATABLE = new Set(['arrow', 'triangle']);
// Rotational symmetry order of each outline: turning by 360/order looks the same (0 = any turn looks the same).
// (A triangle turns in quarter turns only, and its four quarter turns all look different, so it counts as order 1.)
const ORDER = { circle: 0, square: 4, triangle: 1, star: 5, heart: 1, diamond: 2, arrow: 1, hexagon: 6 };

export const GAP = '?';
export const isGap = (x) => x === GAP;

// ---- equality -----------------------------------------------------------------------------------------------------
// The token as it LOOKS: rotation reduced by the outline's symmetry (a half fill breaks every symmetry).
export function canonical(tok) {
  const order = tok.f === 'half' ? 1 : ORDER[tok.s];
  if (order === 0) return { ...tok, r: 0 };
  const per = 360 / order;
  return { ...tok, r: (((tok.r % per) + per) % per) };
}
export const tokenKey = (tok) => {
  const c = canonical(tok);
  return `${c.s}|${c.c}|${c.r}|${c.n}|${c.f}`;
};
export const sameTile = (a, b) => tokenKey(a) === tokenKey(b);
// Attributes in which two tiles visibly differ. A turn only counts when both tiles point somewhere (an arrow pointing
// down and a circle differ in shape only; a half-filled circle and a full one differ in fill only).
const directional = (t) => t.f === 'half' || ROTATABLE.has(t.s);
export function diffAttrs(a, b) {
  const x = canonical(a);
  const y = canonical(b);
  return ATTRS.filter((k) => x[k] !== y[k] && !(k === 'r' && !(directional(x) && directional(y))));
}

// Problems with one token (empty list = valid).
export function tokenProblems(tok) {
  if (!tok || typeof tok !== 'object' || Array.isArray(tok)) return ['not a token object'];
  const out = [];
  const keys = Object.keys(tok).sort().join(',');
  if (keys !== 'c,f,n,r,s') out.push(`keys must be exactly s,c,r,n,f (got ${keys})`);
  if (!SHAPES.includes(tok.s)) out.push(`unknown shape ${JSON.stringify(tok.s)}`);
  if (!COLOR_IDS.includes(tok.c)) out.push(`unknown colour ${JSON.stringify(tok.c)}`);
  if (!ROTATIONS.includes(tok.r)) out.push(`rotation must be one of ${ROTATIONS.join('/')} (got ${JSON.stringify(tok.r)})`);
  if (!Number.isInteger(tok.n) || tok.n < 1 || tok.n > MAX_N) out.push(`n must be 1–${MAX_N} (got ${JSON.stringify(tok.n)})`);
  if (!FILLS.includes(tok.f)) out.push(`unknown fill ${JSON.stringify(tok.f)}`);
  if (out.length) return out;
  if (tok.r !== 0 && !ROTATABLE.has(tok.s) && tok.f !== 'half') out.push(`a ${tok.s} is only turned when half-filled (r=${tok.r})`);
  if (tok.s === 'triangle' && tok.r % 90) out.push('a triangle turns in quarter turns only');
  if (tok.f === 'half' && ROTATABLE.has(tok.s)) out.push(`a half-filled ${tok.s} would point two ways at once`);
  if (tok.f === 'half' && tok.r % 90) out.push('a half fill turns in quarter turns only');
  return out;
}

// ---- labels ---------------------------------------------------------------------------------------------------------
// Every ui.json key a token label can use (the app's ui-keys test lists them as dynamic keys).
export const SHAPE_UI_KEYS = [
  ...SHAPES.flatMap((s) => ['shape.name.' + s, 'shape.names.' + s]),
  ...COLOR_IDS.flatMap((c) => ['shape.color.' + c, 'shape.colors.' + c]),
  ...ROTATIONS.map((r) => 'shape.dir.' + r),
  'shape.empty', 'shape.empty.pl', 'shape.points', 'shape.points.pl', 'shape.half', 'shape.gap',
];

// Hebrew screen-reader label for a tile, e.g. "משולש כחול מצביע ימינה", "3 עיגולים אדומים ריקים",
// "ריבוע צהוב, החצי הצבוע למטה". `t` is the ui.json lookup (lib/content.js).
export function tileLabel(tok, t) {
  const many = tok.n > 1;
  const words = many
    ? [String(tok.n), t('shape.names.' + tok.s), t('shape.colors.' + tok.c)]
    : [t('shape.name.' + tok.s), t('shape.color.' + tok.c)];
  if (tok.f === 'empty') words.push(t(many ? 'shape.empty.pl' : 'shape.empty'));
  let label = words.join(' ');
  if (tok.f === 'half') label += ', ' + t('shape.half', { dir: t('shape.dir.' + ((tok.r + 180) % 360)) });
  else if (ROTATABLE.has(tok.s)) label += ' ' + t(many ? 'shape.points.pl' : 'shape.points', { dir: t('shape.dir.' + tok.r) });
  return label;
}

// ---- plain text (parent screen's "recent mistakes") -----------------------------------------------------------------
const SYM = {
  full: { circle: '●', square: '■', star: '★', heart: '♥', diamond: '◆', hexagon: '⬢' },
  empty: { circle: '○', square: '□', star: '☆', heart: '♡', diamond: '◇', hexagon: '⬡' },
};
const ARROWS = { 0: '↑', 45: '↗', 90: '→', 135: '↘', 180: '↓', 225: '↙', 270: '←', 315: '↖' };
const TRI = { full: { 0: '▲', 90: '▶', 180: '▼', 270: '◀' }, empty: { 0: '△', 90: '▷', 180: '▽', 270: '◁' } };
export function tokenText(tok) {
  if (isGap(tok)) return '?';
  let one;
  if (tok.s === 'arrow') one = ARROWS[tok.r];
  else if (tok.s === 'triangle') one = TRI[tok.f === 'empty' ? 'empty' : 'full'][tok.r];
  else if (tok.f === 'half') one = tok.s === 'circle' ? '◐' : tok.s === 'square' ? '◧' : SYM.full[tok.s] + '½';
  else one = SYM[tok.f][tok.s];
  return (one || tok.s).repeat(tok.n);
}
export const seqText = (seq) => seq.map(tokenText).join(' ');

// ---- rules ------------------------------------------------------------------------------------------------------------
// An item's `rule` says how each attribute moves along the sequence:
//   { "s": "same" | {"cycle": P}, "c": …, "f": …, "r": … | {"step": d}, "n": … | {"step": d} }   (missing = "same")
//   { "interleave": [rule, rule] }   two series on alternating tiles (tiles 1,3,5… and 2,4,6…, counted from the first)
// "same": every tile shows the same value. cycle P: the values repeat every P tiles (needs ≥ 2P tiles, so the whole
// repeat is seen twice; ≥ P+1 for an interleaved side series that holds no gap). step d: the value grows by d each tile (r in degrees, clockwise, modulo 360; n by d copies);
// needs ≥ 3 known tiles, so the step is seen twice.
const NUMERIC = new Set(['r', 'n']);
const stepOk = (attr, d) => Number.isInteger(d) && d !== 0 && (attr !== 'r' || (d % 45 === 0 && d % 360 !== 0));
const norm = (attr, v) => (attr === 'r' ? ((v % 360) + 360) % 360 : v);

// One attribute along one (sub)sequence. vals[i] = canonical value, or null at the gap; raw = uncanonicalized (for steps).
// Returns { ok, value (at the gap, or undefined when there is no gap), why }.
function attrFit(attr, spec, vals, raw, strict = false) {
  const L = vals.length;
  const known = vals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const gap = vals.indexOf(null);
  if (spec === 'same' || spec == null) {
    const v = vals[known[0]];
    if (known.some((i) => vals[i] !== v)) return { ok: false, why: `${attr} is not the same on every tile` };
    return { ok: true, value: gap >= 0 ? v : undefined };
  }
  if (spec && Number.isInteger(spec.cycle)) {
    const P = spec.cycle;
    if (P < 2) return { ok: false, why: `${attr}: cycle must be ≥ 2` };
    // With the gap in it, the whole repeat must be seen twice; a side series with no gap only needs to repeat once
    // (unless `strict`: the ambiguity search on a plain item, where a weak interleaved reading is no real rival).
    const need = gap >= 0 || strict ? 2 * P : P + 1;
    if (L < need) return { ok: false, why: `${attr}: a cycle of ${P} needs at least ${need} tiles (has ${L})` };
    for (const i of known) for (const j of known) if (i % P === j % P && vals[i] !== vals[j]) return { ok: false, why: `${attr}: tiles ${i + 1} and ${j + 1} break the cycle of ${P}` };
    if (gap < 0) return { ok: true };
    const k = known.find((i) => i % P === gap % P);
    return k === undefined ? { ok: false, why: `${attr}: nothing shows the value at the gap` } : { ok: true, value: vals[k] };
  }
  if (spec && spec.step !== undefined) {
    if (!NUMERIC.has(attr)) return { ok: false, why: `${attr} cannot step` };
    if (!stepOk(attr, spec.step)) return { ok: false, why: `${attr}: bad step ${JSON.stringify(spec.step)}` };
    if (known.length < 3) return { ok: false, why: `${attr}: a step needs at least 3 known tiles` };
    const i0 = known[0];
    const at = (i) => norm(attr, raw[i0] + spec.step * (i - i0));
    for (const i of known) if (norm(attr, raw[i]) !== at(i)) return { ok: false, why: `${attr}: tile ${i + 1} breaks the step ${spec.step}` };
    if (gap < 0) return { ok: true };
    const v = at(gap);
    if (attr === 'n' && (v < 1 || v > MAX_N)) return { ok: false, why: `n would be ${v} at the gap` };
    return { ok: true, value: v };
  }
  return { ok: false, why: `${attr}: unknown rule ${JSON.stringify(spec)}` };
}

// Apply a plain (non-interleaved) rule to a (sub)sequence of tokens with at most one gap.
function applyPlain(rule, seq) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return { ok: false, why: 'rule must be an object' };
  const extra = Object.keys(rule).filter((k) => !ATTRS.includes(k));
  if (extra.length) return { ok: false, why: `unknown rule key(s) ${extra.join(', ')}` };
  const can = seq.map((t) => (isGap(t) ? null : canonical(t)));
  const out = {};
  for (const a of ATTRS) {
    const vals = can.map((t) => (t ? t[a] : null));
    const raw = seq.map((t) => (isGap(t) ? null : t[a]));
    const f = attrFit(a, rule[a] ?? 'same', vals, raw);
    if (!f.ok) return f;
    out[a] = f.value;
  }
  return { ok: true, value: seq.some(isGap) ? out : undefined };
}

const parts = (seq, k) => Array.from({ length: k }, (_, p) => seq.filter((_, i) => i % k === p));

// The tile the rule puts at the gap: { ok: true, value: token } or { ok: false, why }.
export function expectedTile(rule, seq) {
  if (seq.filter(isGap).length !== 1) return { ok: false, why: 'the sequence needs exactly one "?"' };
  if (rule && rule.interleave) {
    const rules = rule.interleave;
    if (!Array.isArray(rules) || rules.length !== 2 || Object.keys(rule).length !== 1) return { ok: false, why: 'interleave takes exactly two rules and nothing else' };
    let value;
    const ps = parts(seq, 2);
    for (let p = 0; p < 2; p++) {
      const r = applyPlain(rules[p], ps[p]);
      if (!r.ok) return { ok: false, why: `series ${p + 1}: ${r.why}` };
      if (r.value) value = r.value;
    }
    return { ok: true, value };
  }
  return applyPlain(rule, seq);
}

// Does the rule involve colour (a colour-only difference between two options is then allowed, once)?
export const ruleUsesColour = (rule) =>
  !!rule && (rule.interleave ? rule.interleave.some(ruleUsesColour) : rule.c != null && rule.c !== 'same');

// ---- ambiguity --------------------------------------------------------------------------------------------------------
// Could a child defend this full sequence (the gap filled with a candidate) with SOME simple rule? Every attribute is
// tried as same / cycle 2–3 / step (r, n), on the whole sequence and on two interleaved series. Used to prove that no
// distractor completes the sequence as well as the answer does.
function attrExplained(attr, vals, raw, gapAt, strict) {
  const masked = vals.map((v, i) => (i === gapAt ? null : v));
  const fits = (spec) => {
    const f = attrFit(attr, spec, masked, raw.map((v, i) => (i === gapAt ? null : v)), strict);
    if (!f.ok) return false;
    if (gapAt < 0) return true;
    return f.value === vals[gapAt] || (attr === 'r' && spec.step !== undefined && norm('r', f.value) === norm('r', raw[gapAt]));
  };
  if (fits('same')) return 'same';
  for (const P of [2, 3]) if (fits({ cycle: P })) return { cycle: P };
  if (NUMERIC.has(attr)) {
    const ds = attr === 'r' ? [45, 90, 135, 180, 225, 270, 315] : [-4, -3, -2, -1, 1, 2, 3, 4];
    for (const d of ds) if (fits({ step: d })) return { step: d };
  }
  return null;
}
function plainExplains(seq, gapAt, strict = false) {
  const can = seq.map(canonical);
  const rule = {};
  for (const a of ATTRS) {
    const spec = attrExplained(a, can.map((t) => t[a]), seq.map((t) => t[a]), gapAt, strict);
    if (!spec) return null;
    if (spec !== 'same') rule[a] = spec;
  }
  return rule;
}
// The simple rule that the completed sequence fits, or null. `gapAt` = index of the filled-in tile. `interleaved`: the
// item itself is two interleaved series, so the series without the gap may be short (it only has to repeat once);
// for a plain item an interleaved reading must show every repeat twice to count as a rival.
export function explainSequence(full, gapAt, { interleaved = false } = {}) {
  const plain = plainExplains(full, gapAt);
  if (plain) return plain;
  const ps = parts(full, 2);
  const sub = ps.map((p, k) => plainExplains(p, gapAt % 2 === k ? Math.floor(gapAt / 2) : -1, !interleaved));
  return sub.every(Boolean) ? { interleave: sub } : null;
}
