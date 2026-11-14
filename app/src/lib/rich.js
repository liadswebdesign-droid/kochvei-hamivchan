// Bold emphasis inside content strings. The real booklet bolds key words in stems ("**אין**", "**אינן**", "**גם**",
// "**בלי מקום בתבנית**"), so any content string (stems, options, passage lines, explanations, ui strings) may wrap
// words in `**…**`. Rendering turns them into <strong> (components/Bits.jsx <Rich> and <StemText>); anything that
// measures, compares or reads the text aloud uses stripBold() so the markers never count as characters.
// tools/check-content/validate.mjs rejects an unbalanced `**`; at runtime a stray marker is dropped, never shown.
export const BOLD = '**';

export const hasBold = (s) => typeof s === 'string' && s.includes(BOLD);

// "a **b** c" -> "a b c". Non-strings pass through as strings (options may be numbers).
export const stripBold = (s) => (s == null ? '' : String(s).split(BOLD).join(''));

// "a **b** c" -> [{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]
// An odd number of markers leaves the last one unmatched: it is dropped and the text after it stays plain.
export function boldParts(s) {
  const parts = String(s ?? '').split(BOLD);
  const balanced = parts.length % 2 === 1;
  const out = [];
  parts.forEach((text, i) => {
    if (!text) return;
    const bold = i % 2 === 1 && (balanced || i < parts.length - 1);
    const prev = out[out.length - 1];
    if (prev && prev.bold === bold) prev.text += text;
    else out.push({ text, bold });
  });
  return out;
}

// Validator helper: how many markers the string has and whether they pair up.
export function boldBalance(s) {
  const n = String(s ?? '').split(BOLD).length - 1;
  return { markers: n, balanced: n % 2 === 0 };
}
