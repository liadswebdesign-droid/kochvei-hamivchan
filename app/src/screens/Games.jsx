// The "משחקים" corner (T5): four short timed games with a personal best each.
import { t } from '../lib/content.js';
import { games } from '../config.js';
import { gameBest } from '../lib/rewards.js';
import { Companion } from '../components/Bits.jsx';
import { UiIcon, RiddleIcon } from '../components/Icons.jsx';
import { GameShell } from '../games/GameShell.jsx';
import { Race } from '../games/Race.jsx';
import { Catch } from '../games/Catch.jsx';
import { Detective } from '../games/Detective.jsx';
import { Builder } from '../games/Builder.jsx';

// Small picture for each game card (drawn, not emoji).
function GameArt({ id }) {
  if (id === 'race')
    return (
      <span class="gart gart-race" dir="ltr">
        <b>7</b>+<b>5</b>
      </span>
    );
  if (id === 'catch')
    return (
      <span class="gart gart-catch">
        <i>15</i>
        <i>9</i>
        <i>12</i>
      </span>
    );
  if (id === 'detective')
    return (
      <span class="gart gart-detective">
        <UiIcon id="search" size={58} />
      </span>
    );
  return (
    <span class="gart gart-builder">
      <RiddleIcon id="flower" size={44} />
      <RiddleIcon id="star" size={44} />
    </span>
  );
}

export function GamesHub({ profile, onPick, onBack }) {
  return (
    <div class="screen games-hub">
      <header class="album-top">
        <button type="button" class="corner-btn" onClick={onBack} aria-label={t('common.back')}>
          <UiIcon id="back" />
        </button>
        <h1 class="title album-title">{t('games.title')}</h1>
        <Companion id={profile.companion} size={64} />
      </header>
      <main class="games-grid">
        {games.map((g, i) => {
          const best = gameBest(profile, g.id);
          return (
            <button type="button" class={`game-tile gt-${g.id}`} style={{ '--c': g.color, '--deep': g.deep, '--i': i }} onClick={() => onPick(g.id)}>
              <GameArt id={g.id} />
              <span class="game-tile-title">{t(`games.${g.id}.title`)}</span>
              <span class="game-tile-how">{t(`games.${g.id}.how`)}</span>
              <span class="game-tile-best">
                <UiIcon id="trophy" size={24} />
                <span>{best > 0 ? t('games.best', { n: best }) : t('games.new')}</span>
              </span>
            </button>
          );
        })}
      </main>
    </div>
  );
}

const BODIES = { race: Race, catch: Catch, detective: Detective, builder: Builder };

export function GameScreen({ id, profile, content, onExit, onAlbum }) {
  const game = games.find((g) => g.id === id);
  const Body = BODIES[id];
  return (
    <GameShell profile={profile} game={game} onExit={onExit} onAlbum={onAlbum}>
      {(api) => <Body key={api.run} profile={profile} content={content} api={api} />}
    </GameShell>
  );
}
