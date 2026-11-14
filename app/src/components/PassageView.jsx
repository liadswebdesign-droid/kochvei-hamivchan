// Reading passage with fixed lines. Each line carries its booklet line number in the margin (right side, the
// start of the line in RTL). Questions cite these numbers; `highlight` marks lines after a wrong answer.
export function PassageView({ passage, highlight = [] }) {
  let n = 0;
  const hl = new Set(highlight);
  return (
    <article class="passage" lang="he">
      <h2 class="passage-title">{passage.title}</h2>
      {passage.paragraphs.map((para, pi) => (
        <div class="passage-para" key={pi}>
          {para.map((line) => {
            n += 1;
            return (
              <div class={`pline ${hl.has(n) ? 'hl' : ''}`} key={n} data-line={n}>
                <span class="pline-n" aria-hidden="true">{n}</span>
                <span class="pline-text">{line}</span>
              </div>
            );
          })}
        </div>
      ))}
    </article>
  );
}
