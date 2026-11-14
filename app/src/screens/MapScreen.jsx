import { t } from '../lib/content.js';
import { islands, TEST_DATE } from '../config.js';
import { getProgress, skillState } from '../lib/storage.js';
import { islandAvailable, reviewCount } from '../lib/session.js';
import { bestOverall } from '../lib/simStore.js';
import { Companion, StarRow } from '../components/Bits.jsx';
import { UiIcon, StarIcon } from '../components/Icons.jsx';
// T5: album / streak / games corner / stars flying into the counter
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { unseenStickers, streakDays, getStarsSeen, setStarsSeen } from '../lib/rewards.js';
import { flyStars } from '../components/Celebrate.jsx';

// Whole days from the device's today to the test date (local calendar days).
export function daysUntil(dateStr, now = new Date()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const test = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((test - today) / 86400000);
}

function Countdown() {
  const n = daysUntil(TEST_DATE);
  if (n < 0) return null;
  const text = n === 0 ? t('map.countdown.today') : n === 1 ? t('map.countdown.one') : t('map.countdown', { n });
  return (
    <div class="chip chip-count">
      <UiIcon id="flag" size={24} />
      <span>{text}</span>
    </div>
  );
}

export function MapScreen({ profile, content, onIsland, onSwitch, onParent, onAlbum, onGames }) {
  const progress = getProgress(profile.id);
  const mockBest = bestOverall(profile.id);
  // T5: stars earned since the map was last shown fly in from the middle and the counter ticks up as they land.
  const starsRef = useRef(null);
  const [seen] = useState(() => getStarsSeen(profile));
  const [shownStars, setShownStars] = useState(seen == null ? progress.stars : Math.min(seen, progress.stars));
  useLayoutEffect(() => {
    const from = shownStars;
    const gained = progress.stars - from;
    setStarsSeen(profile, progress.stars);
    if (gained <= 0) return;
    return flyStars(gained, starsRef.current, (k) => setShownStars(from + k));
  }, []);
  const unseen = unseenStickers(profile).length;
  const streak = streakDays(profile);
  return (
    <div class="screen map">
      <header class="topbar">
        <button type="button" class="me" onClick={onSwitch} aria-label={t('profile.switch')}>
          <Companion id={profile.companion} size={56} />
          <span class="me-name" dir="auto">{t('map.hello', { name: profile.name })}</span>
          <span class="me-swap"><UiIcon id="swap" size={22} /></span>
        </button>
        <div class="topbar-chips">
          <Countdown />
          {streak >= 2 && (
            <div class="chip chip-streak">
              <UiIcon id="flame" size={26} />
              <span>{t('map.streak', { n: streak })}</span>
            </div>
          )}
          <div class="chip chip-stars" ref={starsRef}>
            <StarIcon size={28} />
            <span>{t('map.stars', { n: shownStars })}</span>
          </div>
          <button type="button" class="chip chip-album" onClick={onAlbum}>
            <UiIcon id="album" size={28} />
            <span>{t('map.album')}</span>
            {unseen > 0 && <span class="chip-badge">{unseen}</span>}
          </button>
        </div>
      </header>

      <main class="sea">
        <svg class="waves" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 18 Q 12 14 25 18 T 50 18 T 75 18 T 100 18" />
          <path d="M0 48 Q 12 44 25 48 T 50 48 T 75 48 T 100 48" />
          <path d="M0 78 Q 12 74 25 78 T 50 78 T 75 78 T 100 78" />
        </svg>
        <div class="islands">
          {islands.map((isl, i) => {
            const st = skillState(progress, isl.id);
            const available = !isl.locked && islandAvailable(isl.id, content);
            const rc = available ? reviewCount(profile.id, isl.id) : 0;
            return (
              <button
                type="button"
                class={`island isl-${isl.id} ${available ? '' : 'locked'}`}
                style={{ '--c': isl.color, '--deep': isl.deep, '--i': i }}
                disabled={!available}
                onClick={() => onIsland(isl.id)}
              >
                <span class="island-land" aria-hidden="true">
                  <svg class="island-shape" viewBox="0 0 200 150">
                    <ellipse class="isl-water" cx="100" cy="98" rx="96" ry="44" />
                    <path class="isl-sand" d="M18 92c0-30 30-58 82-58s82 24 82 54c0 26-38 40-84 40s-80-12-80-36z" />
                    <path class="isl-grass" d="M34 84c0-22 26-42 66-42s66 18 66 40c0 16-30 26-68 26s-64-8-64-24z" />
                  </svg>
                  <span class="island-icon">
                    <UiIcon id={isl.locked ? 'lock' : isl.icon} size={46} />
                  </span>
                </span>
                <span class="island-sign">
                  <span class="island-title">{t(isl.titleKey)}</span>
                  {isl.locked || !available ? (
                    <span class="island-meta">{t('map.locked')}</span>
                  ) : (
                    <span class="island-meta">
                      {isl.id === 'mock' ? (
                        <span class="island-level">{mockBest ? t('map.mock.best', { score: mockBest.score, max: mockBest.max }) : t('map.mock.none')}</span>
                      ) : (
                        <>
                          <StarRow n={st.best} size={20} />
                          <span class="island-level">{t('map.level', { n: st.level })}</span>
                        </>
                      )}
                    </span>
                  )}
                </span>
                {rc > 0 && <span class="island-badge">{t('map.review', { n: rc })}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" class="games-corner" onClick={onGames}>
          <span class="games-corner-art" aria-hidden="true">
            <UiIcon id="games" size={52} />
          </span>
          <span class="games-corner-sign">{t('map.games')}</span>
        </button>
      </main>
      <button type="button" class="parent-btn" onClick={onParent} aria-label={t('map.parent')}>
        <UiIcon id="gear" size={26} />
      </button>
    </div>
  );
}
