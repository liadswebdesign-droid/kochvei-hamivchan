// "Hold the tablet upright, like the real booklet": a small, friendly note on the mock start screen and in the
// booklet's top bar while the tablet is in landscape. The real booklet is a portrait page, and in landscape long
// passages scroll and question pages hold fewer questions. Never blocks anything: the mock works in landscape exactly
// as in portrait, and it sits inline (start screen) or in the top bar (booklet), so it never covers a button.
// Once she taps "אפשר גם ככה" it stays away for the rest of that mock (start screen → booklet → finish); finishing a
// mock (resetRotateHint) lets it show again before the next one. It disappears by itself when the tablet is upright.
import { useEffect, useState } from 'preact/hooks';
import { t } from '../lib/content.js';

let dismissed = false;
export const resetRotateHint = () => {
  dismissed = false;
};

const LANDSCAPE = '(orientation: landscape)';
function useLandscape() {
  const [land, setLand] = useState(() => typeof matchMedia === 'function' && matchMedia(LANDSCAPE).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(LANDSCAPE);
    const on = () => setLand(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return land;
}

// A tablet that turns from lying down to standing up, with a curved arrow. Inline SVG, no art file.
function RotateArt({ size = 64 }) {
  return (
    <svg class="rot-art" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path class="rot-arrow" d="M50 14a24 24 0 0 1 4 26" />
      <path class="rot-arrow" d="M49 34l5 6 5-7" />
      <g class="rot-tab">
        <rect x="14" y="21" width="36" height="24" rx="4" />
        <circle cx="46" cy="33" r="1.6" />
      </g>
    </svg>
  );
}

export function RotateHint({ where }) {
  const land = useLandscape();
  const [hidden, setHidden] = useState(dismissed);
  if (!land || hidden) return null;
  return (
    <div class={`rot-hint rot-${where}`} role="note">
      <RotateArt size={where === 'bar' ? 48 : 64} />
      <p class="rot-txt">
        <strong>{t('sim.rotate.title')}</strong>
        <span>{t('sim.rotate.text')}</span>
      </p>
      <button
        type="button"
        class="rot-close"
        onClick={() => {
          dismissed = true;
          setHidden(true);
        }}
      >
        {t('sim.rotate.close')}
      </button>
    </div>
  );
}
