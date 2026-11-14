// Shared frame for the mini-games (T5): intro card → timed play (a draining time bar + score) → result card with the
// personal best. Every answer a game reports is logged with { game, skill } so the parent screen can count them.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { logAttempt } from '../lib/storage.js';
import { onGameComplete, gameBest } from '../lib/rewards.js';
import { sfx } from '../lib/sound.js';
import { Companion, Btn } from '../components/Bits.jsx';
import { UiIcon, StarIcon } from '../components/Icons.jsx';
import { Confetti, StickerReward } from '../components/Celebrate.jsx';

// The clock only runs while the tab is visible (rAF pauses when hidden; dt is clamped so a resume never jumps).
function TimeBar({ seconds, onEnd }) {
  const bar = useRef(null);
  const label = useRef(null);
  useEffect(() => {
    let left = seconds * 1000;
    let last = performance.now();
    let raf;
    const tick = (now) => {
      left -= Math.min(250, now - last);
      last = now;
      const f = Math.max(0, left / (seconds * 1000));
      if (bar.current) bar.current.style.transform = `scaleX(${f})`;
      if (label.current) label.current.textContent = String(Math.ceil(Math.max(0, left) / 1000));
      if (bar.current) bar.current.classList.toggle('low', left < 10000);
      if (left <= 0) return onEnd();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div class="timebar" role="timer" aria-label={t('game.time')}>
      <UiIcon id="timer" size={26} />
      <span class="timebar-track">
        <span class="timebar-fill" ref={bar} />
      </span>
      <span class="timebar-n" ref={label}>{seconds}</span>
    </div>
  );
}

export function GameShell({ profile, game, onExit, onAlbum, children }) {
  const [phase, setPhase] = useState('intro'); // intro | play | over
  const [run, setRun] = useState(0);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState(null);
  const [showStickers, setShowStickers] = useState(false);
  const scoreRef = useRef(0);
  const best = gameBest(profile, game.id);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setResult(null);
    setRun((r) => r + 1);
    setPhase('play');
  };
  const end = () => {
    const r = onGameComplete(profile, game.id, scoreRef.current);
    setResult(r);
    setPhase('over');
    if (r.record) sfx.fanfare();
    else sfx.star();
    if (r.stickers.length) setTimeout(() => setShowStickers(true), 1400);
  };
  const api = {
    add(points = 1) {
      scoreRef.current += points;
      setScore(scoreRef.current);
    },
    log(entry) {
      logAttempt(profile.id, { skill: game.skill, game: game.id, ...entry });
    },
  };

  const title = t(`games.${game.id}.title`);
  return (
    <div class={`screen game game-${game.id} phase-${phase}`} style={{ '--c': game.color, '--deep': game.deep }}>
      {phase === 'play' && (
        <header class="game-hud">
          <button type="button" class="corner-btn" onClick={onExit} aria-label={t('game.quit')}>
            <UiIcon id="close" />
          </button>
          <TimeBar key={run} seconds={(import.meta.env.DEV && window.__khGameSeconds) || game.seconds} onEnd={end} />
          <span class="game-score" aria-live="polite">
            <StarIcon size={30} />
            <span key={score} class="game-score-n">{score}</span>
          </span>
        </header>
      )}
      {phase === 'play' && <div class="game-body">{children({ ...api, run })}</div>}

      {phase === 'intro' && (
        <div class="game-card">
          <Companion id={profile.companion} size={170} />
          <h1 class="title">{title}</h1>
          <p class="game-how">{t(`games.${game.id}.how`)}</p>
          <p class="game-best">
            <UiIcon id="trophy" size={28} /> <span>{best > 0 ? t('games.best', { n: best }) : t('games.new')}</span>
          </p>
          <div class="row-btns">
            <Btn kind="ghost" icon="back" onClick={onExit} aria-label={t('common.back')} />
            <Btn kind="primary" onClick={start}>{t('game.start')}</Btn>
          </div>
        </div>
      )}

      {phase === 'over' && result && (
        <div class="game-card over">
          {result.record && <Confetti />}
          <Companion id={profile.companion} size={170} mood={score > 0 ? 'happy' : undefined} />
          <h1 class="title">{t('game.over')}</h1>
          <p class="game-final">
            <StarIcon size={44} /> <span>{score === 1 ? t('game.final.one') : t('game.final', { n: score })}</span>
          </p>
          {result.record ? (
            <p class="game-record">{t('game.record')}</p>
          ) : (
            <p class="game-best">
              <UiIcon id="trophy" size={28} /> <span>{t('game.bestWas', { n: result.best })}</span>
            </p>
          )}
          <div class="row-btns">
            <Btn kind="ghost" onClick={onExit}>{t('game.toGames')}</Btn>
            <Btn kind="primary" onClick={start}>{t('game.again')}</Btn>
          </div>
          {showStickers && <StickerReward stickers={result.stickers} onClose={() => setShowStickers(false)} onAlbum={onAlbum} />}
        </div>
      )}
    </div>
  );
}
