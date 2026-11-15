import { t } from '../lib/content.js';
import { Rich } from './Bits.jsx';

// Multiple choice: four big touch cards labelled א ב ג ד (right-to-left, so א sits on the right).
// One tap selects; the parent shows the "בדיקה" button. `marks[i]` is 'wrong' (crossed, disabled) or 'correct'.
// `variant` adds a `choices-<variant>` class (e.g. "shapes": the options are shape tiles).
export function Choices({ options, selected, onSelect, marks = {}, locked, layout = 'list', variant, render }) {
  return (
    <div class={`choices choices-${layout}${variant ? ' choices-' + variant : ''}`} role="radiogroup">
      {options.map((opt, i) => {
        const mark = marks[i];
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected === i}
            class={`choice ${selected === i ? 'selected' : ''} ${mark || ''}`}
            disabled={locked || mark === 'wrong'}
            onClick={() => onSelect(i)}
            key={i}
            style={{ '--i': i }}
          >
            <span class="choice-label">{t('mc.label.' + (i + 1))}</span>
            <span class="choice-text">{render ? render(opt, i) : <Rich text={opt} />}</span>
          </button>
        );
      })}
    </div>
  );
}
