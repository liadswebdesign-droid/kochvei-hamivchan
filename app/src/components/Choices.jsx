import { t } from '../lib/content.js';

// Multiple choice: four big touch cards labelled א ב ג ד (right-to-left, so א sits on the right).
// One tap selects; the parent shows the "בדיקה" button. `marks[i]` is 'wrong' (crossed, disabled) or 'correct'.
export function Choices({ options, selected, onSelect, marks = {}, locked, layout = 'list', render }) {
  return (
    <div class={`choices choices-${layout}`} role="radiogroup">
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
            <span class="choice-text">{render ? render(opt, i) : opt}</span>
          </button>
        );
      })}
    </div>
  );
}
