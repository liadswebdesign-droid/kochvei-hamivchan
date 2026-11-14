import { useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { companions } from '../config.js';
import { createProfile } from '../lib/storage.js';
import { Companion, Btn } from '../components/Bits.jsx';
import { UiIcon } from '../components/Icons.jsx';

// First launch (and "new profile"): name → companion → start. The name is typed with the tablet's own keyboard and
// stored only in this device's localStorage.
export function ProfileCreate({ onDone, canCancel, onCancel }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [comp, setComp] = useState(null);
  const clean = name.trim();

  return (
    <div class="screen create">
      <div class="sky-deco" aria-hidden="true">
        <span class="cloud c1" />
        <span class="cloud c2" />
      </div>
      {canCancel && (
        <button type="button" class="corner-btn" onClick={onCancel} aria-label={t('common.cancel')}>
          <UiIcon id="close" />
        </button>
      )}
      {step === 0 ? (
        <form
          class="create-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean) setStep(1);
          }}
        >
          <div class="create-hero" aria-hidden="true">
            {companions.slice(0, 3).map((c, i) => (
              <span class="create-hero-item" style={{ '--i': i }}>
                <Companion id={c.id} size={84} />
              </span>
            ))}
          </div>
          <h1 class="title">{t('profile.welcome')}</h1>
          <label class="field">
            <span class="field-label">{t('profile.nameLabel')}</span>
            <input
              class="name-input"
              type="text"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder={t('profile.namePlaceholder')}
              maxLength={24}
              autocomplete="off"
              autocapitalize="words"
              enterkeyhint="next"
              dir="auto"
              spellcheck={false}
            />
          </label>
          <Btn kind="primary" type="submit" disabled={!clean}>
            {t('profile.next')}
          </Btn>
        </form>
      ) : (
        <div class="create-card wide">
          <h1 class="title">{t('profile.pickCompanionNamed', { name: clean })}</h1>
          <div class="comp-grid" role="radiogroup">
            {companions.map((c, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={comp === c.id}
                class={`comp-card ${comp === c.id ? 'selected' : ''}`}
                onClick={() => setComp(c.id)}
                style={{ '--i': i, '--bg': c.color }}
              >
                <Companion id={c.id} size={104} />
                <span class="comp-name">{t('companion.' + c.id)}</span>
              </button>
            ))}
          </div>
          <div class="row-btns">
            <Btn kind="ghost" icon="back" onClick={() => setStep(0)} aria-label={t('common.back')} />
            <Btn
              kind="primary"
              disabled={!comp}
              onClick={() => {
                createProfile(clean, comp);
                onDone();
              }}
            >
              {t('profile.start')}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfileSwitcher({ profiles, activeId, onPick, onAdd }) {
  return (
    <div class="screen create">
      <div class="create-card wide">
        <h1 class="title">{t('profile.whoPlays')}</h1>
        <div class="comp-grid">
          {profiles.map((p, i) => (
            <button type="button" class={`comp-card ${p.id === activeId ? 'selected' : ''}`} onClick={() => onPick(p.id)} style={{ '--i': i }}>
              <Companion id={p.companion} size={104} />
              <span class="comp-name" dir="auto">{p.name}</span>
            </button>
          ))}
          <button type="button" class="comp-card add" onClick={onAdd} style={{ '--i': profiles.length }}>
            <span class="add-plus" aria-hidden="true">
              <UiIcon id="plus" size={56} />
            </span>
            <span class="comp-name">{t('profile.add')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
