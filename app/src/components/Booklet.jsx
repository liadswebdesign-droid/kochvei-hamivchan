// Pieces of the paper test booklet: the page, the pencil circle, the sand clock, the stop-sign dog and one test item.
import { t, tx } from '../lib/content.js';
import { stripBold } from '../lib/rich.js';
import { Companion, MathLine, DigitEquation, RiddleRows, StemText, Rich } from './Bits.jsx';
import { RiddleIcon } from './Icons.jsx';

// ---- pencil circle ---------------------------------------------------------------------------------------------
// A loose hand-drawn loop (it overshoots and doesn't close) that draws itself with a stroke animation. Three variants
// so neighbouring answers don't look stamped. Remount (key) to redraw.
const LOOPS = [
  'M33 5.5C16 4 4.5 18 6 33c1.5 17 17 26 32 23.5C53 54 61 40 58.5 25 56.5 12.5 43 4.5 27 9',
  'M9 21C15.5 8.5 40 3.5 52 14c11 10 8.5 34-8 41.5C28 62.5 8.5 52 6.5 36 5 24 14 13.5 31 10.5',
  'M52.5 11.5C41 2.5 16.5 5.5 8.5 22 1.5 38 12.5 56.5 32.5 58 50.5 59.5 61.5 44 58.5 28 56.5 17.5 47 9.5 33.5 7.5',
];
export function PencilCircle({ variant = 0, delay = 0 }) {
  const d = LOOPS[variant % LOOPS.length];
  return (
    <svg class="pencil-circle" viewBox="0 0 64 64" aria-hidden="true" style={{ '--delay': delay + 'ms' }}>
      <path d={d} pathLength="1" class="pc-faint" transform="translate(1.2 1)" />
      <path d={d} pathLength="1" class="pc-main" />
    </svg>
  );
}

// ---- sand clock ---------------------------------------------------------------------------------------------------
// `progress` 0..1 = share of the time already used (sand moves from the top bulb to the bottom one). No numbers.
export function SandClock({ progress = 0, size = 64 }) {
  const p = Math.max(0, Math.min(1, progress));
  const glass = 'M12 8H48V13C48 29 35 36 32 42C35 48 48 55 48 71V76H12V71C12 55 25 48 28 42C25 36 12 29 12 13Z';
  const top = 30 * (1 - p);
  const bottom = 30 * p;
  const id = 'sc-glass';
  return (
    <svg class={`sandclock ${p >= 1 ? 'done' : ''}`} viewBox="0 0 60 84" width={size * 0.72} height={size} role="img" aria-label={t('sim.timer.label')}>
      <defs>
        <clipPath id={id}>
          <path d={glass} />
        </clipPath>
      </defs>
      <path d={glass} class="sc-glass" />
      <g clip-path={`url(#${id})`}>
        <rect class="sc-sand" x="10" y={42 - top} width="40" height={top} />
        <rect class="sc-sand" x="10" y={74 - bottom} width="40" height={bottom + 4} />
        {p > 0 && p < 1 && <rect class="sc-stream" x="31" y="40" width="2" height="34" />}
      </g>
      <path d={glass} class="sc-outline" />
      <rect class="sc-cap" x="6" y="3" width="48" height="7" rx="3.5" />
      <rect class="sc-cap" x="6" y="74" width="48" height="7" rx="3.5" />
    </svg>
  );
}

// ---- the dog with the stop sign ------------------------------------------------------------------------------
export function StopDog() {
  return (
    <svg class="stopdog" viewBox="0 0 340 320" role="img" aria-label={t('sim.stop.title')}>
      <ellipse cx="150" cy="300" rx="104" ry="13" fill="#2d2442" opacity="0.1" />
      {/* tail */}
      <path d="M86 238c-34-6-46-34-34-54 6 12 18 20 38 22z" fill="#d9a05b" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      {/* body */}
      <path d="M96 292c-14-4-18-40-8-68 8-22 30-34 62-34s54 12 62 34c10 28 6 64-8 68z" fill="#e9b87a" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      <ellipse cx="150" cy="248" rx="30" ry="40" fill="#fbe7c4" />
      {/* feet */}
      <ellipse cx="116" cy="292" rx="22" ry="11" fill="#fbe7c4" stroke="#6b4a2a" stroke-width="4" />
      <ellipse cx="184" cy="292" rx="22" ry="11" fill="#fbe7c4" stroke="#6b4a2a" stroke-width="4" />
      {/* left arm hangs */}
      <path d="M96 214c-14 18-16 40-8 56 8 2 16-2 18-10 2-16 0-30 0-46z" fill="#e9b87a" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      <circle cx="98" cy="272" r="10" fill="#fbe7c4" stroke="#6b4a2a" stroke-width="4" />
      {/* pole */}
      <rect x="234" y="112" width="12" height="176" rx="6" fill="#b98a55" stroke="#6b4a2a" stroke-width="4" />
      {/* sign */}
      <path d="M217 8.6H263L297.4 43V89L263 123.4H217L182.6 89V43Z" fill="#e5484d" stroke="#fff" stroke-width="7" stroke-linejoin="round" />
      <path d="M217 8.6H263L297.4 43V89L263 123.4H217L182.6 89V43Z" fill="none" stroke="#b9292e" stroke-width="3" stroke-linejoin="round" />
      <text x="240" y="77" text-anchor="middle" class="stopdog-text">{t('sim.stop.title')}</text>
      {/* right arm raised to the pole */}
      <path d="M204 208c24-2 34-20 36-40l12 4c-2 26-20 50-48 58z" fill="#e9b87a" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      <circle cx="240" cy="170" r="14" fill="#fbe7c4" stroke="#6b4a2a" stroke-width="4" />
      <path d="M232 166v10M240 164v12M248 166v10" stroke="#6b4a2a" stroke-width="2.5" stroke-linecap="round" />
      {/* head */}
      <path d="M92 96c-30-6-42 22-34 54 4 16 18 18 26 8 8-14 8-42 8-62z" fill="#8b5a2b" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      <path d="M208 96c30-6 42 22 34 54-4 16-18 18-26 8-8-14-8-42-8-62z" fill="#8b5a2b" stroke="#6b4a2a" stroke-width="4" stroke-linejoin="round" />
      <ellipse cx="150" cy="118" rx="66" ry="60" fill="#e9b87a" stroke="#6b4a2a" stroke-width="4" />
      <path d="M126 70c8 12 40 12 48 0 6 8 4 18-2 26-14 8-30 8-44 0-6-8-8-18-2-26z" fill="#d9a05b" opacity="0.6" />
      <ellipse cx="150" cy="144" rx="38" ry="28" fill="#fbe7c4" stroke="#6b4a2a" stroke-width="3" />
      <ellipse cx="150" cy="130" rx="13" ry="9" fill="#2d2442" />
      <ellipse cx="146" cy="127" rx="4" ry="2.5" fill="#fff" opacity="0.7" />
      <path d="M150 138v10M150 148c-8 10-20 8-24 2M150 148c8 10 20 8 24 2" fill="none" stroke="#2d2442" stroke-width="3.5" stroke-linecap="round" />
      <path d="M142 158c2 16 16 16 18 0z" fill="#ff8fa3" stroke="#2d2442" stroke-width="3" stroke-linejoin="round" />
      {/* serious-but-kind eyes and brows */}
      <circle cx="122" cy="104" r="12" fill="#fff" stroke="#2d2442" stroke-width="3" />
      <circle cx="178" cy="104" r="12" fill="#fff" stroke="#2d2442" stroke-width="3" />
      <circle cx="124" cy="106" r="6.5" fill="#2d2442" />
      <circle cx="176" cy="106" r="6.5" fill="#2d2442" />
      <circle cx="126.5" cy="103.5" r="2.2" fill="#fff" />
      <circle cx="178.5" cy="103.5" r="2.2" fill="#fff" />
      <path d="M108 86c8-6 20-6 28 0M164 86c8-6 20-6 28 0" fill="none" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round" />
    </svg>
  );
}

// ---- the paper page -----------------------------------------------------------------------------------------------
// `scroll`: one question alone is taller than the page (see paginate() in lib/sim.js), so this page scrolls.
export function Sheet({ pageNo, showNext, dir, children, kind = '', scroll }) {
  return (
    <article class={`sheet ${kind} ${dir ? 'turn-' + dir : ''} ${scroll ? 'is-scroll' : ''}`}>
      <div class="sheet-body">{children}</div>
      {pageNo != null && (
        <footer class="sheet-foot">
          <span class="sheet-spacer" />
          <span class="sheet-no">{t('sim.page', { n: pageNo })}</span>
          <span class="sheet-next">{showNext ? t('sim.next') : ''}</span>
        </footer>
      )}
    </article>
  );
}

export function Say({ companion, children, mood }) {
  return (
    <div class="say">
      <Companion id={companion} size={76} mood={mood} />
      <p class="say-bubble">{typeof children === 'string' ? <Rich text={children} /> : children}</p>
    </div>
  );
}

// ---- answers ----------------------------------------------------------------------------------------------------------
// Four options א–ד. Tapping one draws a pencil circle around its LETTER; tapping another moves the circle.
export function BkChoices({ options, selected, onSelect, layout = 'list', render, delay = 0, readOnly, rightIdx }) {
  return (
    <div class={`bk-choices bk-${layout}`} role="radiogroup">
      {options.map((opt, i) => {
        const on = selected === i;
        return (
          <button type="button" role="radio" aria-checked={on} class={`bk-opt ${on ? 'on' : ''} ${rightIdx === i ? 'right' : ''}`} onClick={() => !readOnly && onSelect(i)} tabIndex={readOnly ? -1 : 0} key={i}>
            <span class="bk-letter">
              <span class="bk-letter-ch">{t('mc.label.' + (i + 1))}</span>
              {on && <PencilCircle variant={i} delay={delay} key={'c' + i} />}
            </span>
            <span class="bk-opt-text">{render ? render(opt, i) : <Rich text={opt} />}</span>
          </button>
        );
      })}
    </div>
  );
}

const isNumeric = (o) => typeof o === 'number' || /^[\d\s־]+$/.test(String(o));

// One test item, as printed in the booklet. `answer` is the chosen option index (mc) or the typed digits (written).
export function BkItem({ item, answer, onAnswer, active, onActivate, readOnly, delay, rightIdx }) {
  const written = item.kind === 'numeric' || item.kind === 'inequality';
  const no = item.no != null && <span class="bk-no">{item.no}.</span>;
  if (written) {
    const val = answer == null ? '' : String(answer);
    return (
      <div class={`bk-item bk-written ${active ? 'is-active' : ''} ${readOnly ? 'is-example' : ''}`} onClick={onActivate} role="group" data-item={item.id}>
        {no}
        <div class="bk-math">
          <MathLine expr={item.expr} value={val} active={!!active && !readOnly} size="md" />
        </div>
      </div>
    );
  }
  const numericOpts = item.options.every(isNumeric);
  const layout = numericOpts ? 'row' : item.options.every((o) => stripBold(o).replace(/[\u0591-\u05C7]/g, '').length <= 30) ? 'grid' : 'list';
  return (
    <div class="bk-item bk-mc" role="group" data-item={item.id}>
      <div class="bk-qhead">
        {no}
        <div class="bk-qbody">
          {item.digit ? (
            <>
              <DigitEquation digit={item.digit} />
              <p class="bk-stem"><Rich text={tx('instr.digit.ask.' + item.digit.shape)} /></p>
            </>
          ) : item.riddle ? (
            <>
              <RiddleRows rows={item.riddle.rows} />
              <p class="bk-stem bk-ask">
                <span><Rich text={tx('instr.riddles.ask')} /></span>
                <RiddleIcon id={item.riddle.ask} size={44} />
                <span>?</span>
              </p>
            </>
          ) : (
            <p class="bk-stem">
              <StemText text={item.stem} />
            </p>
          )}
        </div>
      </div>
      <BkChoices
        options={item.options}
        selected={answer == null ? null : answer}
        onSelect={onAnswer}
        layout={layout}
        render={numericOpts ? null : (o) => <StemText text={o} />}
        readOnly={readOnly}
        delay={delay}
        rightIdx={rightIdx}
      />
    </div>
  );
}
