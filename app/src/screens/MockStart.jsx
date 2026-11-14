// The mock island's start screen: pick a time mode and a simulation (each with its best score).
import { useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { getSettings } from '../lib/storage.js';
import { bestScores, getRun, clearRun, FIXED_SIM_COUNT } from '../lib/simStore.js';
import { ENDLESS, simId } from '../lib/sim.js';
import { Btn } from '../components/Bits.jsx';
import { SandClock } from '../components/Booklet.jsx';
import { UiIcon } from '../components/Icons.jsx';

export function MockStart({ profile, onBack, onStart }) {
  const pid = profile.id;
  const [mode, setMode] = useState(() => getSettings(profile.id).timeMode);
  const [run, setRun] = useState(getRun(pid));
  const best = bestScores(pid);
  const ids = [...Array.from({ length: FIXED_SIM_COUNT }, (_, i) => simId(i + 1)), ENDLESS];

  return (
    <div class="screen mockstart">
      <header class="ptop">
        <button type="button" class="corner-btn" onClick={onBack} aria-label={t('common.back')}>
          <UiIcon id="close" />
        </button>
        <h1 class="ms-title">{t('sim.start.title')}</h1>
      </header>

      <div class="ms-body">
        <p class="ms-intro">{t('sim.start.intro')}</p>

        {run && (
          <div class="ms-resume">
            <span>{t('sim.start.resume')}</span>
            <Btn kind="primary" onClick={() => onStart(run.simId, run.mode, run)}>{t('sim.start.resumeBtn')}</Btn>
            <Btn
              kind="ghost"
              onClick={() => {
                clearRun(pid);
                setRun(null);
              }}
            >
              {t('sim.start.discard')}
            </Btn>
          </div>
        )}

        <section class="ms-section">
          <h2 class="ms-h">{t('sim.mode.title')}</h2>
          <div class="ms-modes" role="radiogroup">
            {['timed', 'free'].map((m) => (
              <button type="button" role="radio" aria-checked={mode === m} class={`ms-mode ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)} key={m}>
                <span class={`ms-mode-ico ${m === 'free' ? 'no-clock' : ''}`}>
                  <SandClock progress={m === 'timed' ? 0.35 : 0} size={52} />
                </span>
                <span class="ms-mode-txt">
                  <strong>{t(m === 'timed' ? 'sim.mode.timed' : 'sim.mode.free')}</strong>
                  <span>{t(m === 'timed' ? 'sim.mode.timed.sub' : 'sim.mode.free.sub')}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section class="ms-section">
          <h2 class="ms-h">{t('sim.start.pick')}</h2>
          <div class="ms-grid">
            {ids.map((id, i) => {
              const b = best[id];
              const endless = id === ENDLESS;
              return (
                <button type="button" class={`ms-card ${endless ? 'endless' : ''}`} onClick={() => onStart(id, mode)} key={id} style={{ '--i': i }}>
                  <span class="ms-booklet" aria-hidden="true">
                    <span class="ms-num">{endless ? '?' : i + 1}</span>
                  </span>
                  <span class="ms-card-txt">
                    <strong>{endless ? t('sim.start.endless') : t('sim.start.name', { n: i + 1 })}</strong>
                    <span class="ms-best">{endless ? t('sim.start.endless.sub') : b ? t('sim.start.best', { score: b.score, max: b.max }) : t('sim.start.new')}</span>
                  </span>
                  {b && (
                    <span class="ms-badge" aria-hidden="true">
                      <bdi>{b.score}/{b.max}</bdi>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
