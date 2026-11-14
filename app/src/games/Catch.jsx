// "תפסו את המספר": a missing-number or inequality sentence sits on top; number bubbles drift down, and she taps one
// that makes the sentence true (task B). Inequalities accept every number that works, like the real test.
import { useEffect, useRef, useState } from 'preact/hooks';
import { missing, inequality, checkInequality } from '../gen/index.js';
import { newSeed, rng } from '../gen/rng.js';
import { sfx } from '../lib/sound.js';
import { MathLine } from '../components/Bits.jsx';
import { reducedMotion } from '../components/Celebrate.jsx';

const LANES = 5;

function makeRound(score) {
  const level = score < 4 ? 1 : 2;
  const item = score % 3 === 2 ? inequality(level, newSeed()) : missing(level, newSeed());
  const ok = (n) => (item.kind === 'inequality' ? checkInequality(item, n) : n === item.answer);
  return { item, ok };
}

// Bubble values for a round: 1–2 right ones among near misses (typical slips: ±1, ±10, the total, the shown number).
function roundValues(round, r) {
  const { item, ok } = round;
  const right = [];
  const wrong = new Set();
  if (item.kind === 'inequality') {
    const { direction, bound } = item;
    for (let k = 0; k < 4; k++) right.push(direction === 'greater' ? bound + 1 + r.int(0, 12) : Math.max(0, bound - 1 - r.int(0, Math.min(12, bound - 1))));
    for (const d of [0, -1, -2, 1, 2, -5, 5, 10, -10]) wrong.add(direction === 'greater' ? bound + Math.min(d, 0) : bound + Math.max(d, 0));
  } else {
    right.push(item.answer);
    const nums = item.expr.filter((x) => typeof x === 'number');
    for (const c of [item.answer + 1, item.answer - 1, item.answer + 10, item.answer - 10, item.answer + 2, ...nums, nums[0] + nums[1]]) wrong.add(c);
  }
  const wrongs = [...wrong].filter((n) => Number.isInteger(n) && n >= 0 && n <= 100 && !ok(n));
  return { right: [...new Set(right)].filter(ok), wrongs: r.shuffle(wrongs) };
}

export function Catch({ api }) {
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(() => makeRound(0));
  const [bubbles, setBubbles] = useState([]); // { key, lane, value, state }
  const field = useRef(null);
  const pos = useRef(new Map()); // key → { y, speed, phase }
  const els = useRef(new Map());
  const seq = useRef(0);
  const tries = useRef(1);
  const t0 = useRef(performance.now());
  const rm = reducedMotion();
  const roundRef = useRef(round);
  roundRef.current = round;

  // A fresh set of bubbles for a round, spread over the upper half (one just above it) so play starts at once.
  const spawnRound = (rd, s) => {
    const r = rng(newSeed());
    const { right, wrongs } = roundValues(rd, r);
    const nRight = Math.min(right.length, rd.item.kind === 'inequality' ? 2 : 1);
    const values = r.shuffle([...right.slice(0, nRight), ...wrongs.slice(0, LANES - nRight)]);
    const lanes = r.shuffle([...Array(LANES).keys()]);
    pos.current = new Map();
    const list = values.map((value, i) => {
      const key = ++seq.current;
      const speed = (0.085 + Math.min(s, 12) * 0.003) * (0.85 + r.next() * 0.3); // field heights per second
      pos.current.set(key, { y: rm ? 0.18 + (i % 3) * 0.26 : 0.5 - i * 0.17, speed: rm ? 0 : speed, phase: r.next() * 6.28 });
      return { key, lane: lanes[i], value, state: '' };
    });
    setBubbles(list);
  };

  useEffect(() => spawnRound(round, 0), []);

  // Animation loop: write transforms straight to the bubbles; recycle a bubble that falls out with a new value.
  useEffect(() => {
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const H = field.current ? field.current.clientHeight : 600;
      const recycle = [];
      for (const [key, p] of pos.current) {
        p.y += p.speed * dt;
        p.phase += dt * 1.6;
        const el = els.current.get(key);
        if (el) el.style.transform = `translate(${Math.sin(p.phase) * 10}px, ${p.y * H}px)`;
        if (p.y > 1.02) recycle.push(key);
      }
      if (recycle.length) {
        setBubbles((list) => {
          const r = rng(newSeed());
          const rd = roundRef.current;
          const { right, wrongs } = roundValues(rd, r);
          const live = list.filter((b) => !recycle.includes(b.key));
          const hasRight = live.some((b) => b.state === '' && rd.ok(b.value));
          return list.map((b) => {
            if (!recycle.includes(b.key)) return b;
            const key = ++seq.current;
            const p = pos.current.get(b.key);
            pos.current.delete(b.key);
            pos.current.set(key, { ...p, y: -0.15 - r.next() * 0.2 });
            const value = !hasRight || r.chance(0.3) ? r.pick(right) : r.pick(wrongs);
            return { key, lane: b.lane, value, state: '' };
          });
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tap = (b) => {
    if (b.state) return;
    if (round.ok(b.value)) {
      api.log({ id: round.item.id, correct: tries.current === 1, solved: true, tries: tries.current, ms: Math.round(performance.now() - t0.current) });
      sfx.correct();
      api.add(1);
      const s = score + 1;
      setScore(s);
      setBubbles((list) => list.map((x) => (x.key === b.key ? { ...x, state: 'pop' } : { ...x, state: 'away' })));
      setTimeout(() => {
        const rd = makeRound(s);
        setRound(rd);
        roundRef.current = rd;
        tries.current = 1;
        t0.current = performance.now();
        spawnRound(rd, s);
      }, 520);
    } else {
      sfx.tryAgain();
      tries.current += 1;
      setBubbles((list) => list.map((x) => (x.key === b.key ? { ...x, state: 'nope' } : x)));
      setTimeout(() => setBubbles((list) => list.map((x) => (x.key === b.key && x.state === 'nope' ? { ...x, state: '' } : x))), 450);
    }
  };

  if (import.meta.env.DEV) window.__khGame = { ok: round.ok }; // dev-only hook for scripts/qa-t5.mjs
  return (
    <div class="catch">
      <div class="catch-q" key={round.item.id}>
        <MathLine expr={round.item.expr} active={false} />
      </div>
      <div class="catch-field" ref={field}>
        {bubbles.map((b) => (
          <button
            type="button"
            key={b.key}
            class={`bubble-n ${b.state}`}
            style={{ insetInlineStart: `calc(${(b.lane + 0.5) * (100 / LANES)}% - var(--bs) / 2)` }}
            ref={(el) => {
              if (!el) return void els.current.delete(b.key);
              els.current.set(b.key, el);
              const p = pos.current.get(b.key);
              if (p && !el.style.transform) el.style.transform = `translate(0px, ${p.y * (field.current ? field.current.clientHeight : 600)}px)`;
            }}
            onClick={() => tap(b)}
            data-silent
          >
            <span class="bubble-in">{b.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
