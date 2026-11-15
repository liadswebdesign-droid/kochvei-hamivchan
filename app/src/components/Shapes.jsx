// Shape-pattern tiles (bonus "shape-series" items): inline SVG only (strict CSP: no images, no data: URIs, no ids).
// Token model and labels: lib/shapes.js. A tile is a 100×100 box holding 1–5 copies of the shape in dice layout.
import { t } from '../lib/content.js';
import { COLORS, isGap, tileLabel } from '../lib/shapes.js';

const INK = '#3a2d4f';

// Outlines centred on (0,0), pointing up at r=0, about ±38 units.
const star = (() => {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI / 5) * k - Math.PI / 2;
    const R = k % 2 ? 16 : 39;
    pts.push(`${(R * Math.cos(a)).toFixed(1)} ${(R * Math.sin(a) + 3).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
})();
const hexagon = 'M' + [0, 1, 2, 3, 4, 5].map((k) => `${(37 * Math.cos((Math.PI / 3) * k)).toFixed(1)} ${(37 * Math.sin((Math.PI / 3) * k)).toFixed(1)}`).join('L') + 'Z';
const PATH = {
  triangle: 'M0-33L37 31L-37 31Z', // box-centred, so every quarter turn sits in the same place
  star,
  heart: 'M0 31C-11 23-37 7-37-11C-37-26-26-34-17-34C-9-34-3-29 0-22C3-29 9-34 17-34C26-34 37-26 37-11C37 7 11 23 0 31Z',
  diamond: 'M0-39L26 0L0 39L-26 0Z',
  arrow: 'M0-39L29-7L11-7L11 37L-11 37L-11-7L-29-7Z',
  hexagon,
};
function Outline({ s, ...p }) {
  if (s === 'circle') return <circle cx="0" cy="0" r="35" {...p} />;
  if (s === 'square') return <rect x="-32" y="-32" width="64" height="64" rx="7" {...p} />;
  return <path d={PATH[s]} {...p} />;
}

// Dice layouts in the 100×100 tile: centres and the scale of each copy.
export const LAYOUT = {
  1: { k: 1.05, at: [[50, 50]] },
  2: { k: 0.48, at: [[30, 30], [70, 70]] },
  3: { k: 0.36, at: [[24, 24], [50, 50], [76, 76]] },
  4: { k: 0.46, at: [[29, 29], [71, 29], [29, 71], [71, 71]] },
  5: { k: 0.36, at: [[24, 24], [76, 24], [50, 50], [24, 76], [76, 76]] },
};

function Copy({ tok, k, x, y }) {
  const sw = (tok.n === 1 ? 3.2 : 2.4) / k; // outline weight in tile units, independent of the copy's scale
  const color = COLORS[tok.c];
  const line = { 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  let body;
  if (tok.f === 'empty') {
    // a coloured ring with dark edges: readable even for the light yellow on a white tile
    body = (
      <>
        <Outline s={tok.s} fill="#fff" stroke={INK} stroke-width={sw * 3} {...line} />
        <Outline s={tok.s} fill="#fff" stroke={color} stroke-width={sw * 1.7} {...line} />
      </>
    );
  } else if (tok.f === 'half') {
    // the bottom half (before turning) is coloured: a nested <svg> viewport clips it without needing an id
    body = (
      <>
        <Outline s={tok.s} fill="#fff" />
        <svg x="-45" y="0" width="90" height="45" viewBox="-45 0 90 45" overflow="hidden">
          <Outline s={tok.s} fill={color} />
        </svg>
        <Outline s={tok.s} fill="none" stroke={INK} stroke-width={sw} {...line} />
      </>
    );
  } else {
    body = <Outline s={tok.s} fill={color} stroke={INK} stroke-width={sw} {...line} />;
  }
  return <g transform={`translate(${x} ${y}) scale(${k}) rotate(${tok.r})`}>{body}</g>;
}

export function ShapeTile({ tok }) {
  const { k, at } = LAYOUT[tok.n] || LAYOUT[1];
  return (
    <svg class="stile-svg" viewBox="0 0 100 100" role="img" aria-label={tileLabel(tok, t)}>
      {at.slice(0, tok.n).map(([x, y], i) => (
        <Copy key={i} tok={tok} k={k} x={x} y={y} />
      ))}
    </svg>
  );
}

// The sequence as big tiles, laid out RTL like the number-series chips (first tile on the right). `reveal` fills the
// gap with the right answer (the explanation after a second miss).
export function ShapeSeries({ seq, reveal, size }) {
  return (
    <div class={`sseries ${size ? 'sseries-' + size : ''}`} dir="rtl" style={{ '--len': seq.length }}>
      {seq.map((x, i) =>
        isGap(x) ? (
          reveal ? (
            <span class="stile filled" key={i}><ShapeTile tok={reveal} /></span>
          ) : (
            <span class="stile ask" key={i} role="img" aria-label={t('shape.gap')}>?</span>
          )
        ) : (
          <span class="stile" key={i}><ShapeTile tok={x} /></span>
        ),
      )}
    </div>
  );
}
