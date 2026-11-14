// "חידות בציורים — בונים": the key shows what each picture is worth; she drags pictures into the row (or taps them)
// until the row adds up to the target. The reverse of task D: building the equation trains reading one.
import { Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { ICONS } from '../gen/index.js';
import { newSeed, rng } from '../gen/rng.js';
import { sfx } from '../lib/sound.js';
import { RiddleIcon } from '../components/Icons.jsx';
import { Btn } from '../components/Bits.jsx';

const MAX_IN_ROW = 5;

export function makeBuild(round, seed = newSeed()) {
  const r = rng(seed);
  const icons = r.shuffle(ICONS).slice(0, 3);
  const maxV = round < 3 ? 5 : 9;
  const values = {};
  const used = new Set();
  for (const ic of icons) {
    let v;
    do v = r.int(1, maxV);
    while (used.has(v));
    used.add(v);
    values[ic] = v;
  }
  const k = round < 2 ? 2 : r.int(2, round < 5 ? 3 : 4);
  const pick = Array.from({ length: k }, () => r.pick(icons));
  const target = pick.reduce((s, ic) => s + values[ic], 0);
  return { id: `game:builder:${seed}`, icons, values, target };
}

export function Builder({ api }) {
  const [round, setRound] = useState(0);
  const [b, setB] = useState(() => makeBuild(0));
  const [row, setRow] = useState([]);
  const [msg, setMsg] = useState(null); // null | { ok } | { got }
  const [drag, setDrag] = useState(null); // { icon, x, y }
  const rowRef = useRef(null);
  const tries = useRef(1);
  const t0 = useRef(performance.now());

  const add = (icon) => {
    if (msg && msg.ok) return;
    setMsg(null);
    setRow((r) => (r.length >= MAX_IN_ROW ? r : [...r, icon]));
  };
  const removeAt = (i) => {
    if (msg && msg.ok) return;
    setMsg(null);
    setRow((r) => r.filter((_, j) => j !== i));
  };

  const check = () => {
    const sum = row.reduce((s, ic) => s + b.values[ic], 0);
    if (sum === b.target) {
      api.log({ id: b.id, correct: tries.current === 1, solved: true, tries: tries.current, ms: Math.round(performance.now() - t0.current) });
      sfx.correct();
      api.add(1);
      setMsg({ ok: true });
      setTimeout(() => {
        const n = round + 1;
        setRound(n);
        setB(makeBuild(n));
        setRow([]);
        setMsg(null);
        tries.current = 1;
        t0.current = performance.now();
      }, 900);
    } else {
      sfx.tryAgain();
      tries.current += 1;
      setMsg({ got: sum });
    }
  };

  // Drag from the tray with any pointer. A plain tap (or Enter / a screen-reader activation) arrives as a click and
  // adds the picture too: the non-drag alternative. A finished drag swallows the click that follows it.
  const dragged = useRef(false);
  const onClick = (icon) => () => {
    if (dragged.current) return void (dragged.current = false);
    add(icon);
  };
  const onDown = (icon) => (e) => {
    dragged.current = false;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId); // keep the moves coming when the finger leaves the button
    } catch {
      /* synthetic or already-ended pointer */
    }
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) moved = true;
      if (moved) setDrag({ icon, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return;
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 400); // no click followed (pointer ended off the button)
      const r = rowRef.current && rowRef.current.getBoundingClientRect();
      if (r && ev.clientX >= r.left - 30 && ev.clientX <= r.right + 30 && ev.clientY >= r.top - 40 && ev.clientY <= r.bottom + 40) add(icon);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  if (import.meta.env.DEV) window.__khGame = { values: b.values, target: b.target }; // dev-only hook for scripts/qa-t5.mjs
  return (
    <div class="builder">
      <div class="builder-key" dir="ltr">
        {b.icons.map((ic) => (
          <span class="builder-key-item" key={ic}>
            <RiddleIcon id={ic} size={52} />
            <span class="op eq">=</span>
            <span class="num">{b.values[ic]}</span>
          </span>
        ))}
      </div>

      <div class={`builder-row ${msg && msg.ok ? 'ok' : ''} ${drag ? 'drop' : ''}`} ref={rowRef} dir="ltr">
        {row.length === 0 && <span class="builder-slot" aria-hidden="true" />}
        {row.map((ic, i) => (
          <Fragment key={i}>
            {i > 0 && <span class="op">+</span>}
            <button type="button" class="builder-placed" onClick={() => removeAt(i)} aria-label={ic}>
              <RiddleIcon id={ic} size={64} />
            </button>
          </Fragment>
        ))}
        <span class="op eq">=</span>
        <span class="num builder-target">{b.target}</span>
      </div>

      <p class={`builder-msg ${msg && msg.ok ? 'ok' : ''}`} role="status">
        {msg ? (msg.ok ? t('feedback.correct.4') : t('game.builder.got', { n: msg.got })) : t('game.builder.target', { n: b.target })}
      </p>

      <div class="builder-tray" role="group" aria-label={t('game.builder.tray')}>
        {b.icons.map((ic) => (
          <button type="button" class="builder-pick" key={ic} onPointerDown={onDown(ic)} onClick={onClick(ic)} aria-label={ic}>
            <RiddleIcon id={ic} size={78} />
          </button>
        ))}
      </div>

      <div class="row-btns">
        <Btn kind="ghost" icon="backspace" onClick={() => setRow([])} disabled={!row.length || (msg && msg.ok)} aria-label={t('game.builder.clear')} />
        <Btn kind="check" onClick={check} disabled={!row.length || (msg && msg.ok)}>{t('common.check')}</Btn>
      </div>

      {drag && (
        <span class="builder-ghost" style={{ transform: `translate(${drag.x - 40}px, ${drag.y - 40}px)` }} aria-hidden="true">
          <RiddleIcon id={drag.icon} size={80} />
        </span>
      )}
    </div>
  );
}
