// "מרוץ חשבון": + − × facts against the clock (task A). Each right answer moves the companion one step along the
// track; ten steps make a lap. The answer checks itself once enough digits are typed, so the pace stays quick.
import { useRef, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { exercise } from '../gen/index.js';
import { newSeed } from '../gen/rng.js';
import { sfx } from '../lib/sound.js';
import { Companion, MathLine } from '../components/Bits.jsx';
import { NumPad } from '../components/NumPad.jsx';
import { UiIcon } from '../components/Icons.jsx';

const LAP = 10;
// Warm up with level-1 facts, then the official test's mix (carrying +/−, then × tables).
const levelFor = (score) => (score < 3 ? 1 : score < 9 ? 2 : 3);

export function Race({ profile, api }) {
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(() => exercise(1, newSeed()));
  const [value, setValue] = useState('');
  const [state, setState] = useState(''); // '' | 'ok' | 'bad'
  const tries = useRef(1);
  const t0 = useRef(performance.now());
  const busy = useRef(false);

  const next = (s) => {
    let it;
    do it = exercise(levelFor(s), newSeed());
    while (it.sig === q.sig);
    setQ(it);
    setValue('');
    setState('');
    tries.current = 1;
    t0.current = performance.now();
    busy.current = false;
  };

  const onChange = (v) => {
    if (busy.current) return;
    setValue(v);
    if (v.length < String(q.answer).length) return;
    busy.current = true;
    const ok = Number(v) === q.answer;
    if (ok) {
      api.log({ id: q.id, correct: tries.current === 1, solved: true, tries: tries.current, ms: Math.round(performance.now() - t0.current) });
      sfx.correct();
      api.add(1);
      setState('ok');
      const s = score + 1;
      setScore(s);
      setTimeout(() => next(s), 380);
    } else {
      sfx.tryAgain();
      tries.current += 1;
      setState('bad');
      setTimeout(() => {
        setValue('');
        setState('');
        busy.current = false;
      }, 420);
    }
  };

  if (import.meta.env.DEV) window.__khGame = { answer: q.answer }; // dev-only hook for scripts/qa-t5.mjs
  const lap = Math.floor(score / LAP);
  const step = score % LAP;
  return (
    <div class="race">
      <div class="race-track" dir="rtl" aria-hidden="true">
        <span class="race-start" />
        {Array.from({ length: LAP - 1 }, (_, i) => (
          <span class={`race-tick ${i < step ? 'on' : ''}`} style={{ insetInlineStart: `${((i + 1) / LAP) * 100}%` }} />
        ))}
        <span class="race-finish">
          <UiIcon id="flag" size={34} />
        </span>
        <span class="race-runner" style={{ '--p': step / LAP }}>
          <Companion id={profile.companion} size={86} variant="figure" />
        </span>
        {lap > 0 && <span class="race-lap">{t('game.race.lap', { n: lap + 1 })}</span>}
      </div>
      <div class="race-play">
        <div class={`race-q ${state}`} key={q.id}>
          <MathLine expr={q.expr} value={value} active={state !== 'ok'} filled={state === 'ok' ? value : null} />
        </div>
        <NumPad value={value} onChange={onChange} maxLen={3} />
      </div>
    </div>
  );
}
