// Sticker album (T5): 24 slots. Locked slots show the sticker's silhouette; stickers earned since the last visit
// peel off and stick into their slot one after another.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { STICKER_COUNT } from '../config.js';
import { getRewards, markStickersSeen, streakDays } from '../lib/rewards.js';
import { sfx } from '../lib/sound.js';
import { Sticker, stickerSrc, reducedMotion } from '../components/Celebrate.jsx';
import { Companion } from '../components/Bits.jsx';
import { UiIcon, StarIcon } from '../components/Icons.jsx';

// A stable, slight tilt per slot so the page looks hand-stuck.
const tiltOf = (n) => ((n * 37) % 11) - 5;
const STEP = 650; // ms between stickers sticking down

export function Album({ profile, onBack }) {
  const r = useMemo(() => getRewards(profile), [profile.id]);
  const fresh = useMemo(() => r.unseen.slice(), []);
  const count = Object.keys(r.stickers).length;
  const streak = streakDays(profile);
  const [wiggle, setWiggle] = useState(null);

  useEffect(() => {
    if (!fresh.length) return;
    const rm = reducedMotion();
    const timers = fresh.map((n, i) => setTimeout(() => sfx.sticker(), rm ? 0 : 500 + i * STEP));
    markStickersSeen(profile, fresh);
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div class="screen album">
      <header class="album-top">
        <button type="button" class="corner-btn" onClick={onBack} aria-label={t('common.back')}>
          <UiIcon id="back" />
        </button>
        <h1 class="title album-title">{t('album.title')}</h1>
        {r.gold > 0 && (
          <span class="chip album-gold">
            <StarIcon size={26} />
            <span>{r.gold === 1 ? t('album.gold.one') : t('album.gold', { n: r.gold })}</span>
          </span>
        )}
        <span class="chip album-count">{t('album.count', { n: count, total: STICKER_COUNT })}</span>
      </header>
      <main class="album-page">
        <div class="album-grid" role="list">
          {Array.from({ length: STICKER_COUNT }, (_, i) => {
            const n = i + 1;
            const got = !!r.stickers[n];
            const k = fresh.indexOf(n);
            return (
              <div class={`album-slot ${got ? 'got' : 'locked'}`} role="listitem" key={n} aria-label={got ? undefined : t('album.locked')}>
                {got ? (
                  <button
                    type="button"
                    class={`album-sticker ${wiggle === n ? 'wiggle' : ''}`}
                    onClick={() => {
                      setWiggle(n);
                      setTimeout(() => setWiggle(null), 500);
                    }}
                    aria-label={String(n)}
                  >
                    <Sticker n={n} size={120} peel={k >= 0} delay={500 + k * STEP} tilt={tiltOf(n)} />
                  </button>
                ) : (
                  <img class="album-ghost" src={stickerSrc(n)} alt="" draggable={false} style={{ rotate: tiltOf(n) + 'deg' }} />
                )}
              </div>
            );
          })}
        </div>
        <aside class="album-side">
          <Companion id={profile.companion} size={150} mood={fresh.length ? 'happy' : undefined} />
          {streak > 0 && (
            <p class="album-streak">
              <UiIcon id="flame" size={30} />
              <span>{streak === 1 ? t('album.streak.one') : t('album.streak', { n: streak })}</span>
            </p>
          )}
          <div class="album-how">
            <p class="album-how-title">{t('album.how')}</p>
            <ul>
              <li>{t('album.rule.threeStars')}</li>
              <li>{t('album.rule.fiveSessions')}</li>
              <li>{t('album.rule.streak')}</li>
              <li>{t('album.rule.mock')}</li>
              <li>{t('album.rule.gold')}</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
