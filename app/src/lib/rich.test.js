import { describe, it, expect } from 'vitest';
import { boldParts, stripBold, hasBold, boldBalance } from './rich.js';
import { StemText, Rich } from '../components/Bits.jsx';
import { targetsOf } from '../games/Detective.jsx';

// Flatten a rendered vnode tree into [{ tag, text }] runs, so the test reads like the page.
function runs(node, tag = null, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => runs(n, tag, out));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    if (String(node)) out.push({ tag, text: String(node) });
    return out;
  }
  if (typeof node.type === 'function') return runs(node.type(node.props), tag, out);
  const t = typeof node.type === 'string' ? (node.type === 'strong' ? 'strong' : tag) : tag;
  return runs(node.props.children, t, out);
}
const strongText = (vnode) => runs(vnode).filter((r) => r.tag === 'strong').map((r) => r.text).join('|');
const plainText = (vnode) => runs(vnode).map((r) => r.text).join('');

describe('**bold** markup', () => {
  it('splits a stem into plain and bold runs', () => {
    expect(boldParts('איזה משפט **אין** בסיפור?')).toEqual([
      { text: 'איזה משפט ', bold: false },
      { text: 'אין', bold: true },
      { text: ' בסיפור?', bold: false },
    ]);
    expect(boldParts('**בלי מקום בתבנית**')).toEqual([{ text: 'בלי מקום בתבנית', bold: true }]);
    expect(boldParts('**אינן** ו**גם**')).toEqual([
      { text: 'אינן', bold: true },
      { text: ' ו', bold: false },
      { text: 'גם', bold: true },
    ]);
    expect(boldParts('בלי הדגשה')).toEqual([{ text: 'בלי הדגשה', bold: false }]);
    expect(boldParts(17)).toEqual([{ text: '17', bold: false }]);
  });
  it('a stray (unbalanced) marker is dropped and never shown; the rest stays plain', () => {
    expect(boldParts('א **ב')).toEqual([{ text: 'א ב', bold: false }]);
    expect(boldParts('**א** ב **ג')).toEqual([{ text: 'א', bold: true }, { text: ' ב ג', bold: false }]);
  });
  it('stripBold removes every marker (for measuring and comparing)', () => {
    expect(stripBold('מה **אין** כאן?')).toBe('מה אין כאן?');
    expect(stripBold(42)).toBe('42');
    expect(stripBold(null)).toBe('');
    expect(hasBold('a **b**')).toBe(true);
    expect(hasBold(5)).toBe(false);
  });
  it('boldBalance counts markers for the content validator', () => {
    expect(boldBalance('**א** ו**ב**')).toEqual({ markers: 4, balanced: true });
    expect(boldBalance('**א')).toEqual({ markers: 1, balanced: false });
  });
  it('StemText renders bold as <strong> and keeps numbers isolated inside it', () => {
    const v = StemText({ text: 'כמה ילדים **אין** להם 12 כדורים? **גם 3**' });
    expect(strongText(v)).toBe('אין|גם |3');
    expect(plainText(v)).toBe('כמה ילדים אין להם 12 כדורים? גם 3');
    expect(plainText(v)).not.toContain('*');
  });
  it('Rich renders options and passage lines without markers', () => {
    expect(strongText(Rich({ text: 'הם **אינן** יודעות' }))).toBe('אינן');
    expect(plainText(Rich({ text: 'הם **אינן** יודעות' }))).toBe('הם אינן יודעות');
    expect(plainText(Rich({ text: 8 }))).toBe('8');
  });
  it('the line-detective game never puts a marker inside a word', () => {
    const passage = { paragraphs: [['הַיּוֹם **אֵין** גֶּשֶׁם בַּחוּץ'], ['מָחָר יִהְיֶה שֶׁמֶשׁ']] };
    const list = targetsOf(passage);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c) => !c.text.includes('*') && !c.key.includes('*'))).toBe(true);
    expect(list.some((c) => c.text === 'אֵין' && c.line === 1)).toBe(true);
  });
});
