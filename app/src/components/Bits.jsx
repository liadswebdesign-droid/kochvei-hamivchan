import { Fragment } from 'preact';
import { companions } from '../config.js';
import { t } from '../lib/content.js';
import { Shape, RiddleIcon, StarIcon, UiIcon } from './Icons.jsx';

// ---- companion ---------------------------------------------------------------
export function Companion({ id, size = 72, mood }) {
  const c = companions.find((x) => x.id === id) || companions[0];
  return (
    <span class={`companion ${mood ? 'mood-' + mood : ''}`} style={{ '--size': size + 'px', '--bg': c.color }} role="img" aria-label={t('companion.' + c.id)}>
      {c.img ? <img src={import.meta.env.BASE_URL + c.img} alt="" /> : <span class="companion-emoji" aria-hidden="true">{c.emoji}</span>}
    </span>
  );
}

// ---- math -------------------------------------------------------------------------
// Renders an expression token list in LTR math order inside the RTL page:
// numbers, '+', '−', '×', '=', '<', '>', and { blank: true } (shows `value` while typing).
export function MathLine({ expr, value, active, filled, size = 'lg' }) {
  return (
    <div class={`math math-${size}`} dir="ltr">
      {expr.map((tok, i) =>
        tok && tok.blank ? (
          <span key={i} class={`blank ${active ? 'active' : ''} ${filled != null ? 'filled' : ''}`}>
            {filled != null ? filled : value || ''}
            {active && filled == null && <span class="caret" />}
          </span>
        ) : typeof tok === 'number' ? (
          <span key={i} class="num">{tok}</span>
        ) : (
          <span key={i} class={`op ${tok === '=' ? 'eq' : ''}`}>{tok}</span>
        ),
      )}
    </div>
  );
}

// "1S" → 1 then a shape, digits in LTR order. `reveal` substitutes the digit (for the explanation).
export function DigitTerm({ term, shape, reveal }) {
  return (
    <span class="dterm">
      {[...term].map((ch, i) =>
        ch === 'S' ? (
          reveal != null ? <span key={i} class="dterm-revealed">{reveal}</span> : <span key={i} class="dterm-shape"><Shape shape={shape} /></span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}

export function DigitEquation({ digit, reveal }) {
  const { terms, ops, total, shape } = digit;
  return (
    <div class="math math-lg" dir="ltr">
      {terms.map((tm, i) => (
        <Fragment key={i}>
          {i > 0 && <span class="op">{ops[i - 1]}</span>}
          <DigitTerm term={tm} shape={shape} reveal={reveal} />
        </Fragment>
      ))}
      <span class="op eq">=</span>
      <span class="num">{total}</span>
    </div>
  );
}

// Picture riddle rows: icons joined by +, then = total. LTR like the booklet's equations.
export function RiddleRows({ rows, solution }) {
  return (
    <div class="riddle" dir="ltr">
      {rows.map((row, i) => (
        <div class="riddle-row" key={i}>
          {row.terms.map((ic, j) => (
            <Fragment key={j}>
              {j > 0 && <span class="op">+</span>}
              <span class="riddle-cell">
                <RiddleIcon id={ic} size={60} />
                {solution && <span class="riddle-val">{solution[ic]}</span>}
              </span>
            </Fragment>
          ))}
          <span class="op eq">=</span>
          <span class="num">{row.total}</span>
        </div>
      ))}
    </div>
  );
}

// ---- stars ------------------------------------------------------------------------
export function StarRow({ n, of = 3, size = 40 }) {
  return (
    <span class="starrow" aria-label={`${n}/${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span class={`starrow-item ${i < n ? 'on' : ''}`} style={{ '--i': i }}>
          <StarIcon size={size} filled={i < n} />
        </span>
      ))}
    </span>
  );
}

export function Btn({ kind = 'primary', icon, children, ...rest }) {
  return (
    <button type="button" class={`btn btn-${kind}`} {...rest}>
      {icon && <UiIcon id={icon} size={26} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ---- Hebrew stems with numbers --------------------------------------------------
// Every run of digits sits in its own LTR isolate (<bdi>) so multi-digit numbers never flip inside RTL text, and
// "___" becomes a visible blank. The sentence itself keeps RTL order (first number of a list on the right).
export function StemText({ text }) {
  const parts = String(text).split(/(\d+|_{2,})/);
  return (
    <>
      {parts.map((p, i) =>
        /^\d+$/.test(p) ? (
          <bdi class="n" key={i}>{p}</bdi>
        ) : /^_{2,}$/.test(p) ? (
          <span class="fillblank" key={i} aria-label="___" />
        ) : (
          p
        ),
      )}
    </>
  );
}

// Bonus/series stems: "איזה מספר ממשיך את הסדרה? 2, 4, 6, 8, ?" → the question, then the series as big chips laid
// out RTL like the booklet (first number on the right). Analogy stems ("ציפור : קן = דבורה : ?") get a large line.
export function BonusStem({ item }) {
  const s = String(item.stem);
  const series = item.type === 'series' && /^(.*?\?)\s*((?:[\d]+|\?)(?:\s*,\s*(?:[\d]+|\?))+)\s*$/.exec(s);
  if (series) {
    const list = series[2].split(',').map((x) => x.trim());
    return (
      <>
        <p class="stem">{series[1]}</p>
        <div class="series" dir="rtl">
          {list.map((x, i) => (x === '?' ? <span class="series-item ask" key={i}>?</span> : <bdi class="series-item" key={i}>{x}</bdi>))}
        </div>
      </>
    );
  }
  if (item.type === 'analogy') {
    const parts = s.split(/(\?)\s*$/);
    return (
      <p class="stem analogy">
        <StemText text={parts[0]} />
        {parts.length > 1 && <span class="series-item ask">?</span>}
      </p>
    );
  }
  return (
    <p class="stem">
      <StemText text={s} />
    </p>
  );
}
