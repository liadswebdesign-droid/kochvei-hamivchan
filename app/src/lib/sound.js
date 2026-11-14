// Soft synthesized sounds (WebAudio, no files). Everything is quiet, rounded (sine/triangle through a low-pass) and
// short; the "try again" boop is low and gentle, never a buzzer. Silent when the active profile's settings say
// sound: false (T6's parent screen sets it), and before the first touch unlocks audio.
import { getActiveId, isSoundOn } from './storage.js';

let ctx = null;
let master = null;

function audio() {
  if (ctx) return ctx;
  const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!C) return null;
  try {
    ctx = new C();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(lp).connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function enabled() {
  const pid = getActiveId();
  return !pid || isSoundOn(pid);
}

// Browsers keep audio locked until a user gesture. The first touch anywhere unlocks it; every later tap on an
// enabled button gets the soft tap sound.
export function initSound() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    const c = audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('touchstart', unlock, { capture: true, passive: true });
  window.addEventListener(
    'pointerdown',
    (e) => {
      const b = e.target && e.target.closest && e.target.closest('button:not(:disabled), [data-tap]');
      if (b && !b.hasAttribute('data-silent')) sfx.tap();
    },
    { passive: true },
  );
}

// One enveloped note. `at` = seconds from now.
function note(freq, { at = 0, dur = 0.18, gain = 0.12, type = 'sine', glide = null, attack = 0.008 } = {}) {
  const c = ctx;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// A bell-ish tone: fundamental + a quiet octave partial.
function bell(freq, at, dur = 0.42, gain = 0.1) {
  note(freq, { at, dur, gain, type: 'triangle' });
  note(freq * 2, { at, dur: dur * 0.6, gain: gain * 0.25 });
}

function noise(at, dur, gain, from, to) {
  const c = ctx;
  const t0 = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t0);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;

const play = (fn) => () => {
  if (!enabled()) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  try {
    fn();
  } catch {
    /* never let a sound break the app */
  }
};

export const sfx = {
  tap: play(() => note(700, { dur: 0.06, gain: 0.035, glide: 560 })),
  correct: play(() => {
    bell(E6, 0, 0.32, 0.09);
    bell(G6 * 1.0, 0.11, 0.5, 0.09);
  }),
  tryAgain: play(() => {
    note(311, { dur: 0.26, gain: 0.09, glide: 233, attack: 0.02 });
  }),
  star: play(() => {
    [E6, G6, C7].forEach((f, i) => note(f, { at: i * 0.055, dur: 0.16, gain: 0.045, type: 'triangle' }));
  }),
  sticker: play(() => {
    noise(0, 0.22, 0.05, 900, 3500); // the peel
    note(880, { at: 0.24, dur: 0.12, gain: 0.08, glide: 1175, type: 'triangle' }); // the pop as it sticks
    bell(C7 * 0.75, 0.3, 0.4, 0.05);
  }),
  fanfare: play(() => {
    [C5, E5, G5].forEach((f, i) => bell(f, i * 0.12, 0.28, 0.07));
    [C5, E5, G5, C6].forEach((f) => bell(f, 0.4, 0.9, 0.045));
    note(E6, { at: 0.42, dur: 0.6, gain: 0.03, type: 'triangle' });
  }),
};
