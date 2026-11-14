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

// Reading passage with fixed lines. Each line carries its booklet line number in the margin (right side, the
// start of the line in RTL). Questions cite these numbers; `highlight` marks lines after a wrong answer.
export function PassageView({ passage, highlight = [] }) {
  const ref = useRef(null);
  let n = 0;
  const hl = new Set(highlight);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = 0;
    const fit = () => {
      width = el.clientWidth;
      fitPassage(el);
    };
    fit();
    // Webfonts change line widths once they arrive; orientation changes change the panel width.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ref.current && fit());
    const ro = new ResizeObserver(() => el.clientWidth !== width && fit());
    ro.observe(el);
    if (import.meta.env.DEV) window.__khFitPassage = fit; // dev-only: lets the QA script re-fit after injecting a stress line
    return () => ro.disconnect();
  }, [passage]);

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
