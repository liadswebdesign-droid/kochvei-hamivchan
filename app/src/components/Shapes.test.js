import { describe, it, expect } from 'vitest';
import { LAYOUT, ShapeTile, ShapeSeries } from './Shapes.jsx';

// Collect every vnode of a rendered tree (components are called; no DOM needed).
function walk(v, out = []) {
  if (v == null || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    v.forEach((x) => walk(x, out));
    return out;
  }
  if (typeof v.type === 'function') return walk(v.type(v.props), out);
  out.push(v);
  walk(v.props && v.props.children, out);
  return out;
}
const tok = (o = {}) => ({ s: 'star', c: 'blue', r: 0, n: 1, f: 'full', ...o });

describe('shape tiles', () => {
  it('every copy of a 1–5 tile stays inside the 100×100 tile with room to spare', () => {
    for (const [n, { k, at }] of Object.entries(LAYOUT)) {
      expect(at.length).toBe(Number(n));
      for (const [x, y] of at) {
        const reach = 40 * k + 3; // outline radius ≈ 40 at scale k, plus the stroke
        expect(x - reach, `n=${n}`).toBeGreaterThanOrEqual(0);
        expect(x + reach, `n=${n}`).toBeLessThanOrEqual(100);
        expect(y - reach).toBeGreaterThanOrEqual(0);
        expect(y + reach).toBeLessThanOrEqual(100);
      }
    }
  });
  it('renders n copies, turned by r, as one labelled image with no ids, images or data URIs (CSP)', () => {
    const nodes = walk(ShapeTile({ tok: tok({ s: 'arrow', r: 90, n: 3, f: 'empty' }) }));
    const svg = nodes[0];
    expect(svg.type).toBe('svg');
    expect(svg.props.role).toBe('img');
    expect(svg.props['aria-label']).toBeTruthy();
    const groups = nodes.filter((x) => x.type === 'g');
    expect(groups.length).toBe(3);
    expect(groups.every((g) => /rotate\(90\)$/.test(g.props.transform))).toBe(true);
    for (const n of nodes) {
      expect(n.props.id).toBeUndefined();
      expect(n.type).not.toBe('image');
      expect(JSON.stringify(n.props.href || '') + JSON.stringify(n.props.fill || '')).not.toMatch(/url\(|data:/);
    }
  });
  it('clips a half fill with a nested svg viewport (no clipPath id)', () => {
    const nodes = walk(ShapeTile({ tok: tok({ s: 'circle', f: 'half', r: 180 }) }));
    expect(nodes.filter((x) => x.type === 'svg').length).toBe(2);
    expect(nodes.some((x) => x.type === 'clipPath' || x.type === 'mask')).toBe(false);
  });
  it('lays the sequence out RTL with a "?" tile, or the answer revealed in its place', () => {
    const seq = [tok(), tok({ s: 'heart' }), '?'];
    const row = walk(ShapeSeries({ seq }));
    expect(row[0].props.dir).toBe('rtl');
    expect(row[0].props.style['--len']).toBe(3);
    expect(row.filter((x) => x.props && /\bask\b/.test(x.props.class || '')).length).toBe(1);
    const shown = walk(ShapeSeries({ seq, reveal: tok({ s: 'circle' }) }));
    expect(shown.filter((x) => /\bask\b/.test((x.props && x.props.class) || '')).length).toBe(0);
    expect(shown.filter((x) => /\bfilled\b/.test((x.props && x.props.class) || '')).length).toBe(1);
  });
});
