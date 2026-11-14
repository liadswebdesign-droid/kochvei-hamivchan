// Celebrations (T5): canvas confetti, the sticker reward card with its peel-and-stick moment, and stars flying into
// a counter. All of it honours prefers-reduced-motion (confetti and flight are skipped; the sticker just appears).
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { sfx } from '../lib/sound.js';
import { StarIcon } from './Icons.jsx';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = ['#ff7a45', '#ffc933', '#4fb3d9', '#2fa866', '#f58fb4', '#b49af0', '#ffd84d'];

// A light, short confetti burst: ~110 pieces falling from the top with drag and a little flutter, then gone.
export function Confetti({ pieces = 110, duration = 2600 }) {
  const ref = useRef(null);
  const [done, setDone] = useState(reducedMotion());
  useEffect(() => {
    if (done) return;
    const cv = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const P = Array.from({ length: pieces }, (_, i) => ({
      x: W * (0.1 + 0.8 * Math.random()),
      y: -20 - Math.random() * H * 0.35,
      vx: (Math.random() - 0.5) * 3.2,
      vy: 1.5 + Math.random() * 2.5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.22,
      w: 8 + Math.random() * 7,
      h: 10 + Math.random() * 8,
      c: COLORS[i % COLORS.length],
      round: i % 4 === 0,
      flutter: Math.random() * Math.PI * 2,
    }));
    const t0 = performance.now();
    let last = t0, raf;
    const frame = (now) => {
      const dt = Math.min(2.5, (now - last) / 16.7);
      last = now;
      const age = now - t0;
      g.clearRect(0, 0, W, H);
      const fadeOut = Math.max(0, Math.min(1, (duration - age) / 600));
      for (const p of P) {
        p.vy = Math.min(p.vy + 0.07 * dt, 4.2);
        p.vx *= 0.99;
        p.flutter += 0.08 * dt;
        p.x += (p.vx + Math.sin(p.flutter) * 0.6) * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        g.save();
        g.globalAlpha = fadeOut;
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.scale(1, Math.cos(p.flutter)); // the flip of a paper piece
        g.fillStyle = p.c;
        if (p.round) {
          g.beginPath();
          g.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (age < duration) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (done) return null;
  return <canvas class="confetti-canvas" ref={ref} aria-hidden="true" />;
}

export const stickerSrc = (n) => `${import.meta.env.BASE_URL}art/stickers/sticker-${String(n).padStart(2, '0')}.webp`;

export function reasonText(s) {
  return s.reason === 'streak' ? t('sticker.reason.streak', { n: s.days }) : t('sticker.reason.' + s.reason);
}

// A sticker that peels off its backing and sticks down. `play` starts the animation (album slots wait their turn).
export function Sticker({ n, size = 120, peel = false, delay = 0, tilt = 0 }) {
  return (
    <span class={`sticker ${peel ? 'peel' : ''}`} style={{ '--s': size + 'px', '--d': delay + 'ms', '--tilt': tilt + 'deg' }}>
      <img src={stickerSrc(n)} alt="" draggable={false} width={size} height={size} />
      {peel && <span class="sticker-corner" aria-hidden="true" />}
    </span>
  );
}

// Overlay shown when stickers were earned (results, game over, mock exam). One sticker at a time.
export function StickerReward({ stickers, onClose, onAlbum }) {
  const [i, setI] = useState(0);
  const s = stickers[i];
  const btn = useRef(null);
  useEffect(() => {
    const id = setTimeout(() => sfx.sticker(), reducedMotion() ? 0 : 380);
    btn.current && btn.current.focus();
    return () => clearTimeout(id);
  }, [i]);
  if (!s) return null;
  const last = i + 1 >= stickers.length;
  const gold = s.n == null; // album full: the reward is a gold star
  return (
    <div class="overlay sticker-overlay" role="dialog" aria-live="polite" aria-label={gold ? t('sticker.gold') : t('sticker.new')}>
      <Confetti key={i} pieces={80} />
      <div class="sticker-card" key={'c' + i}>
        <p class="sticker-new">{gold ? t('sticker.gold') : t('sticker.new')}</p>
        <div class={`sticker-stage ${gold ? 'is-gold' : ''}`}>
          {gold ? (
            <span class="gold-star">
              <StarIcon size={180} />
            </span>
          ) : (
            <Sticker n={s.n} size={220} peel delay={200} tilt={-4} />
          )}
        </div>
        <p class="sticker-reason">{reasonText(s)}</p>
        <div class="row-btns">
          {onAlbum && last && (
            <button type="button" class="btn btn-ghost" onClick={onAlbum}>
              <span>{t('sticker.toAlbum')}</span>
            </button>
          )}
          <button type="button" class="btn btn-primary" ref={btn} onClick={() => (last ? onClose() : setI(i + 1))}>
            <span>{t('sticker.ok')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Fly `n` stars (capped at 8) from the middle of the screen into `target` (an element), one after another.
// Calls onLand(k) as each one lands. Returns a cancel function.
export function flyStars(n, target, onLand) {
  if (!n || !target) return () => {};
  if (reducedMotion()) {
    for (let k = 1; k <= n; k++) onLand(k, n);
    return () => {};
  }
  const to = target.getBoundingClientRect();
  const shown = Math.min(n, 8);
  const timers = [];
  const els = [];
  for (let k = 0; k < shown; k++) {
    timers.push(
      setTimeout(() => {
        const el = document.createElement('span');
        el.className = 'flystar';
        el.innerHTML = '<svg viewBox="0 0 48 48" width="56" height="56"><path d="M24 4.5l5.9 12.1 13.3 1.9-9.6 9.3 2.3 13.2L24 34.8 12.1 41l2.3-13.2-9.6-9.3 13.3-1.9z" fill="#ffc933" stroke="#d99a00" stroke-width="2.4" stroke-linejoin="round"/></svg>';
        document.body.appendChild(el);
        els.push(el);
        const sx = innerWidth / 2 + (k % 2 ? 1 : -1) * (20 + k * 14) - 28;
        const sy = innerHeight * 0.55 - 28;
        const ex = to.left + to.width * 0.22 - 28;
        const ey = to.top + to.height / 2 - 28;
        const mx = (sx + ex) / 2 + (k % 2 ? 60 : -60);
        const my = Math.min(sy, ey) - 80;
        const a = el.animate(
          [
            { transform: `translate(${sx}px, ${sy}px) scale(0.6)`, opacity: 0 },
            { transform: `translate(${sx}px, ${sy - 30}px) scale(1.15)`, opacity: 1, offset: 0.18 },
            { transform: `translate(${mx}px, ${my}px) scale(0.95)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${ex}px, ${ey}px) scale(0.5)`, opacity: 0.9 },
          ],
          { duration: 820, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'forwards' },
        );
        a.onfinish = () => {
          el.remove();
          const landed = k === shown - 1 ? n : Math.round(((k + 1) * n) / shown);
          onLand(landed, n);
          sfx.star();
          target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        };
      }, 250 + k * 150),
    );
  }
  return () => {
    timers.forEach(clearTimeout);
    els.forEach((e) => e.remove());
  };
}
