import { t } from '../lib/content.js';
import { UiIcon } from './Icons.jsx';

// Large on-screen number pad. Never opens the device keyboard. Digits are laid out LTR (1 2 3 like a calculator)
// even though the page is RTL.
// An answer is a number, so a leading 0 is replaced by the next digit (0 then 7 → 7). `keepZeros` types every digit as
// is, for codes: a PIN may start with 0 (0123 stays 0123).
export const pressDigit = (value, d, maxLen, keepZeros = false) => (value.length >= maxLen ? value : !keepZeros && value === '0' ? d : value + d);

export function NumPad({ value, onChange, disabled, maxLen = 3, keepZeros = false }) {
  const press = (d) => {
    if (disabled) return;
    const next = pressDigit(value, d, maxLen, keepZeros);
    if (next !== value) onChange(next);
  };
  const back = () => !disabled && onChange(value.slice(0, -1));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div class="numpad" dir="ltr" role="group" aria-label={t('numpad.label')}>
      {keys.map((k) => (
        <button type="button" class="key" key={k} onClick={() => press(k)} disabled={disabled}>
          {k}
        </button>
      ))}
      <span class="key-spacer" />
      <button type="button" class="key" onClick={() => press('0')} disabled={disabled}>
        0
      </button>
      <button type="button" class="key key-back" onClick={back} disabled={disabled || !value} aria-label={t('numpad.backspace')}>
        <UiIcon id="backspace" size={34} />
      </button>
    </div>
  );
}
