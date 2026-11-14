import { useLayoutEffect, useRef } from 'preact/hooks';
import { Rich } from './Bits.jsx';

// Smallest passage font we shrink to before giving up and letting the passage scroll sideways.
const MIN_PX = 19;

// Booklet lines are fixed: a line must NEVER wrap, or the numbers the questions cite stop matching. Each line is
// `nowrap`; this shrinks the passage font until the longest line fits the panel (floor MIN_PX). If even the floor is
// too wide, the passage gets `.pfit-scroll` and scrolls horizontally instead of wrapping. It measures the RENDERED line
// (scrollWidth), so `**bold**` counts at its real bold width and the markers, never rendered, never count.
function fitPassage(article) {
  if (!article) return;
  article.style.fontSize = '';
  article.classList.remove('pfit-scroll');
  const base = parseFloat(getComputedStyle(article).fontSize);
  const texts = [...article.querySelectorAll('.pline-text')];
  if (!texts.length || !article.clientWidth) return;
  const ratio = (els) => Math.min(...els.map((el) => (el.scrollWidth > el.clientWidth ? el.clientWidth / el.scrollWidth : 1)));
  let r = ratio(texts);
  if (r >= 1) return;
  let size = Math.max(MIN_PX, Math.floor(base * r * 4) / 4);
  // The number column is sized in em, so it shrinks too; a couple of passes settle any rounding left over.
  for (let pass = 0; pass < 4; pass++) {
    article.style.fontSize = size + 'px';
    r = ratio(texts);
    if (r >= 1 || size <= MIN_PX) break;
    size = Math.max(MIN_PX, Math.floor(size * r * 4) / 4 - 0.25);
  }
  if (ratio(texts) < 1) article.classList.add('pfit-scroll');
}

// Spacing steps for the booklet page when the floor font alone is still too tall: [line-height, paragraph gap].
// The base is 1.75 / 0.7em (styles.css: .sheet .pline-text, .passage-para); never tighter than 1.6, still airy.
const TIGHTER = [
  [1.7, '0.55em'],
  [1.65, '0.45em'],
  [1.6, '0.4em'],
];

// Booklet only (the real booklet shows a whole passage on one page): after the width fit, shrink the font further,
// down to the same MIN_PX floor, until the page `box` (the sheet body) holds the passage without scrolling. If the
// floor is not enough, tighten the spacing a step at a time and then grow the font back as far as that spacing allows.
// If nothing fits (a landscape page is far too short), undo all of it: the passage keeps its width-fit size and the
// page scrolls (with the scroll shadow) — shrinking a passage that will scroll anyway only makes it harder to read.
// Lines and line numbers share one grid row per line, so they stay aligned at any size and spacing.
function fitHeight(article, box) {
  if (!box || !box.clientHeight) return;
  const tall = () => box.scrollHeight > box.clientHeight;
  const setSpacing = (step) => {
    article.style.setProperty('--pl-lh', step ? String(step[0]) : '');
    article.style.setProperty('--pp-gap', step ? step[1] : '');
  };
  setSpacing(null);
  if (!tall()) return;
  const keep = article.style.fontSize;
  const top = parseFloat(getComputedStyle(article).fontSize);
  const setSize = (px) => (article.style.fontSize = px + 'px');
  // largest size in [MIN_PX, top] (0.25px steps) that fits, or 0
  const largest = () => {
    for (let px = top; px >= MIN_PX; px -= 0.25) {
      setSize(px);
      if (!tall()) return px;
    }
    return 0;
  };
  // quick way out (landscape): not even the floor font at the tightest spacing fits
  setSpacing(TIGHTER[TIGHTER.length - 1]);
  setSize(MIN_PX);
  const hopeless = tall();
  setSpacing(null);
  if (!hopeless && largest()) return;
  for (const step of hopeless ? [] : TIGHTER) {
    setSpacing(step);
    if (largest()) return;
  }
  setSpacing(null);
  article.style.fontSize = keep;
}

// Reading passage with fixed lines. Each line carries its booklet line number in the margin (right side, the
// start of the line in RTL). Questions cite these numbers; `highlight` marks lines after a wrong answer.
// `fitHeight` (the booklet's passage page): also fit the page's height, see fitHeight().
export function PassageView({ passage, highlight = [], fitHeight: tallFit = false }) {
  const ref = useRef(null);
  let n = 0;
  const hl = new Set(highlight);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = 0;
    let height = 0;
    const box = tallFit ? el.closest('.sheet-body') : null;
    const fit = () => {
      width = el.clientWidth;
      if (box) height = box.clientHeight;
      fitPassage(el);
      if (box) fitHeight(el, box);
    };
    fit();
    // Webfonts change line widths once they arrive; orientation changes change the panel width (and the page height).
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ref.current && fit());
    const ro = new ResizeObserver(() => (el.clientWidth !== width || (box && box.clientHeight !== height)) && fit());
    ro.observe(el);
    if (box) ro.observe(box);
    if (import.meta.env.DEV) window.__khFitPassage = fit; // dev-only: lets the QA script re-fit after injecting a stress line
    return () => ro.disconnect();
  }, [passage, tallFit]);

  return (
    <article class="passage" lang="he" ref={ref}>
      <h2 class="passage-title"><Rich text={passage.title} /></h2>
      {passage.paragraphs.map((para, pi) => (
        <div class="passage-para" key={pi}>
          {para.map((line) => {
            n += 1;
            return (
              <div class={`pline ${hl.has(n) ? 'hl' : ''}`} key={n} data-line={n}>
                <span class="pline-n" aria-hidden="true">{n}</span>
                <span class="pline-text"><Rich text={line} /></span>
              </div>
            );
          })}
        </div>
      ))}
    </article>
  );
}
