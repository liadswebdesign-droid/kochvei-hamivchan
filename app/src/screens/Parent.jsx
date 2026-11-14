// Parent screen: PIN gate, then per-profile statistics and settings. Plain (unvocalized) Hebrew is fine here: an adult
// reads it. All text still comes from ui.json keys with the `parent.` prefix.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, loadPassage } from '../lib/content.js';
import { getLog, getSettings, saveSettings, getProgress } from '../lib/storage.js';
import { getSims } from '../lib/simStore.js';
import {
  hasPin, setPin, checkPin, makeGate, checkGate, lockedFor, resetProfileData, deleteProfile,
} from '../lib/parentData.js';
import { accuracy, minutesPerDay, sessionsOn, recentMistakes, withTrend, describeItem, passageOf, bucketOf } from '../lib/stats.js';
import { Companion, Btn, Rich } from '../components/Bits.jsx';
import { NumPad } from '../components/NumPad.jsx';
import { UiIcon } from '../components/Icons.jsx';

const SKILL_LABEL = {
  exercises: 'parent.skill.exercises', missing: 'parent.skill.missing', inequality: 'parent.skill.inequality',
  wordProblems: 'parent.skill.wordProblems', riddles: 'parent.skill.riddles', bonus: 'parent.skill.bonus',
};
const TYPE_LABEL = {
  detail: 'parent.type.detail', vocab: 'parent.type.vocab', reference: 'parent.type.reference', purpose: 'parent.type.purpose',
  'not-answered': 'parent.type.not-answered', synonyms: 'parent.type.synonyms', inference: 'parent.type.inference',
  why: 'parent.type.why', title: 'parent.type.title', sequence: 'parent.type.sequence', other: 'parent.type.other',
};
const TASK_HEAD = { reading: 'parent.sims.t.reading', A: 'parent.sims.t.A', B: 'parent.sims.t.B', C: 'parent.sims.t.C', D: 'parent.sims.t.D' };
const TASKS = ['reading', 'A', 'B', 'C', 'D'];
const TREND = { up: ['▲', 'parent.trend.up'], down: ['▼', 'parent.trend.down'], same: ['＝', 'parent.trend.same'] };

const typeLabel = (key) => t(TYPE_LABEL[key.slice(8)] || TYPE_LABEL.other);
const labelFor = (key) => (key.startsWith('reading:') ? `${t('parent.reading')}: ${t(TYPE_LABEL[key.slice(8)] || TYPE_LABEL.other)}` : t(SKILL_LABEL[key]));
const fmtDate = (ts) => {
  const d = new Date(ts);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

// ---- PIN ----------------------------------------------------------------------------------------------------------------
function PinPad({ title, error, onSubmit, maxLen = 4, explicit, extra, resetKey }) {
  const [v, setV] = useState('');
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (error) setShake((s) => s + 1);
  }, [error]);
  useEffect(() => setV(''), [resetKey]);
  const submit = (val) => {
    onSubmit(val);
    setV('');
  };
  useEffect(() => {
    if (explicit || v.length !== maxLen) return;
    const id = setTimeout(() => submit(v), 160);
    return () => clearTimeout(id);
  }, [v]);
  return (
    <div class={`pin-card ${shake ? 'shake-' + (shake % 2) : ''}`}>
      <p class="pin-title">{title}</p>
      <div class="pin-dots" dir="ltr" aria-label={t('parent.pin.digits')}>
        {explicit ? <span class="pin-num">{v || ' '}</span> : Array.from({ length: maxLen }, (_, i) => <span class={`pin-dot ${i < v.length ? 'on' : ''}`} key={i} />)}
      </div>
      <p class="pin-error" role="alert">{error || ' '}</p>
      <NumPad value={v} onChange={setV} maxLen={maxLen} keepZeros />
      <div class="pin-actions">
        {explicit && <Btn kind="primary" onClick={() => v && submit(v)} disabled={!v}>{t('common.check')}</Btn>}
        {extra}
      </div>
    </div>
  );
}

// m:ss, for the lockout countdown.
const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function PinGate({ onOpen, onClose }) {
  const [stage, setStage] = useState(hasPin() ? 'enter' : 'set');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [wait, setWait] = useState(lockedFor()); // lockout after wrong answers (lib/parentData.js), survives a reload
  const gate = useRef(null);
  useEffect(() => {
    if (!wait) return;
    const id = setInterval(() => setWait(lockedFor()), 1000);
    return () => clearInterval(id);
  }, [wait > 0]);
  const fail = (msg) => {
    const w = lockedFor();
    setWait(w);
    setError(w ? '' : msg);
    setTick((x) => x + 1);
  };
  const to = (s) => {
    setError('');
    setStage(s);
    setTick((x) => x + 1);
  };
  let pad;
  if (stage === 'set') {
    pad = <PinPad title={t('parent.pin.set')} error={error} resetKey={stage + tick} onSubmit={(p) => { setFirst(p); to('confirm'); }} />;
  } else if (stage === 'confirm') {
    pad = (
      <PinPad
        title={t('parent.pin.confirm')}
        error={error}
        resetKey={stage + tick}
        onSubmit={(p) => {
          if (p === first) {
            setPin(p);
            onOpen();
          } else {
            setStage('set');
            fail(t('parent.pin.mismatch'));
          }
        }}
      />
    );
  } else if (wait > 0) {
    pad = (
      <div class="pin-card">
        <p class="pin-title">{t('parent.pin.locked', { time: fmtWait(wait) })}</p>
      </div>
    );
  } else if (stage === 'gate') {
    if (!gate.current) gate.current = makeGate();
    pad = (
      <PinPad
        title={t('parent.pin.gate', { a: gate.current.a, b: gate.current.b })}
        error={error}
        explicit
        maxLen={3}
        resetKey={stage + tick}
        onSubmit={(v) => {
          // The old PIN stays valid until the new one is confirmed (setPin in the confirm stage).
          if (checkGate(gate.current, v)) {
            gate.current = null;
            to('set');
          } else {
            gate.current = makeGate(); // a new question after every wrong answer
            fail(t('parent.pin.gateWrong'));
          }
        }}
      />
    );
  } else {
    pad = (
      <PinPad
        title={t('parent.pin.enter')}
        error={error}
        resetKey={stage + tick}
        onSubmit={(p) => (checkPin(p) ? onOpen() : fail(t('parent.pin.wrong')))}
        extra={<button type="button" class="linkbtn" onClick={() => to('gate')}>{t('parent.pin.forgot')}</button>}
      />
    );
  }
  return (
    <div class="screen parent pin-screen">
      <header class="ptop">
        <button type="button" class="corner-btn" onClick={onClose} aria-label={t('parent.close')}>
          <UiIcon id="close" />
        </button>
        <h1 class="ms-title">{t('parent.title')}</h1>
      </header>
      <div class="pin-wrap">{pad}</div>
    </div>
  );
}

// ---- dashboard pieces ----------------------------------------------------------------------------------------------------
function Card({ title, children, cls = '' }) {
  return (
    <section class={`pcard ${cls}`}>
      <h2 class="pcard-h">{title}</h2>
      {children}
    </section>
  );
}

function AccuracyBars({ rows }) {
  if (!rows.length) return <p class="pempty">{t('parent.nodata')}</p>;
  return (
    <ul class="pbars">
      {rows.map((r, i) => [
        r.key.startsWith('reading:') && !(i > 0 && rows[i - 1].key.startsWith('reading:')) ? <li class="pbar-group" key={'g' + r.key}>{t('parent.reading')}</li> : null,
        <li class={`pbar ${r.pct >= 80 ? 'good' : r.pct >= 50 ? 'mid' : 'low'} ${r.key.startsWith('reading:') ? 'sub' : ''}`} key={r.key}>
          <span class="pbar-name">{r.key.startsWith('reading:') ? typeLabel(r.key) : labelFor(r.key)}</span>
          <span class="pbar-track" aria-hidden="true"><span style={{ width: r.pct + '%' }} /></span>
          <span class="pbar-val"><bdi>{r.pct}%</bdi></span>
          <span class="pbar-n">{t('parent.acc.count', { n: r.total })}</span>
        </li>,
      ])}
    </ul>
  );
}

function MinutesChart({ days }) {
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const total = days.reduce((a, d) => a + d.minutes, 0);
  return (
    <>
      <div class="pchart" role="img" aria-label={t('parent.minutes.title')}>
        {days.map((d) => (
          <div class="pcol" key={d.date}>
            <span class="pcol-val">{d.minutes > 0 ? <bdi>{d.minutes}</bdi> : ''}</span>
            <span class="pcol-bar"><span style={{ height: (100 * d.minutes) / max + '%' }} class={d.minutes ? 'on' : ''} /></span>
            <span class="pcol-day"><bdi>{Number(d.date.slice(8))}</bdi></span>
          </div>
        ))}
      </div>
      <p class="pchart-total">{t('parent.minutes.total', { n: total })}</p>
    </>
  );
}

function SimTable({ sims }) {
  if (!sims.length) return <p class="pempty">{t('parent.sims.none')}</p>;
  const rows = withTrend(sims).reverse();
  return (
    <div class="ptable-wrap">
      <table class="ptable">
        <thead>
          <tr>
            <th>{t('parent.sims.date')}</th>
            <th>{t('parent.sims.sim')}</th>
            <th>{t('parent.sims.score')}</th>
            {TASKS.map((k) => <th key={k}>{t(TASK_HEAD[k])}</th>)}
            <th>{t('parent.sims.time')}</th>
            <th>{t('parent.sims.mode')}</th>
            <th>{t('parent.sims.trend')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.t + ':' + i}>
              <td><bdi>{fmtDate(s.t)}</bdi></td>
              <td>{s.sim === 'endless' ? t('parent.sims.endless') : <bdi>{s.sim.replace('sim-', '#')}</bdi>}</td>
              <td class="strong"><bdi>{s.score}/{s.max}</bdi></td>
              {TASKS.map((k) => <td key={k}><bdi>{s.tasks[k][0]}/{s.tasks[k][1]}</bdi></td>)}
              <td><bdi>{s.minutes}</bdi></td>
              <td>{t(s.mode === 'timed' ? 'parent.sims.timed' : 'parent.sims.free')}</td>
              <td class={`trend ${s.trend || ''}`}>{s.trend ? <span role="img" aria-label={t(TREND[s.trend][1])}>{TREND[s.trend][0]}</span> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mistakes({ list, ctx, readingTypes }) {
  if (!list.length) return <p class="pempty">{t('parent.mistakes.none')}</p>;
  return (
    <ol class="pmist">
      {list.map((e) => {
        const d = describeItem(e.id, ctx);
        return (
          <li class="pmist-item" key={e.id}>
            <span class={`pmist-text ${d.math ? 'math' : ''}`}><bdi dir={d.math ? 'ltr' : 'auto'}><Rich text={d.text} /></bdi></span>
            <span class="pmist-tags">
              <span class="ptag">{labelFor(bucketOf(e, readingTypes))}</span>
              {e.sim && <span class="ptag sim">{t('parent.mistakes.sim')}</span>}
              <span class="ptag date"><bdi>{fmtDate(e.t)}</bdi></span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stepper({ value, min, max, onChange }) {
  return (
    <span class="stepper">
      <button type="button" class="step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="−">−</button>
      <bdi class="step-val">{value}</bdi>
      <button type="button" class="step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="+">+</button>
    </span>
  );
}

// ---- dashboard --------------------------------------------------------------------------------------------------------------------
function Dashboard({ profiles, activeId, content, onClose, onChanged }) {
  const [pid, setPid] = useState(profiles.some((p) => p.id === activeId) ? activeId : profiles[0] && profiles[0].id);
  const [settings, setSettings] = useState(() => getSettings(pid));
  const [confirm, setConfirm] = useState(null); // 'reset' | 'delete'
  const [notice, setNotice] = useState('');
  const [rev, setRev] = useState(0);
  const [data, setData] = useState(null);
  const profile = profiles.find((p) => p.id === pid);

  useEffect(() => {
    if (!pid) return;
    setSettings(getSettings(pid));
    let alive = true;
    (async () => {
      const log = getLog(pid);
      const sims = getSims(pid);
      const recent = recentMistakes(log, 20);
      // reading question types and stems live in the passages: load the ones the log mentions
      const needed = [...new Set([...log, ...recent].filter((e) => e.skill === 'reading' && !e.game).map((e) => passageOf(e.id)))];
      const readingTypes = {};
      const questions = {};
      await Promise.all(
        needed.map((id) =>
          loadPassage(id).then(
            (p) => p.questions.forEach((q) => { readingTypes[q.id] = q.type; questions[q.id] = q.stem; }),
            () => {},
          ),
        ),
      );
      if (!alive) return;
      setData({
        acc: accuracy(log, readingTypes),
        days: minutesPerDay(log, sims),
        today: sessionsOn(log, sims, Date.now(), getProgress(pid).days),
        sims,
        recent,
        readingTypes,
        ctx: { wordProblems: content.wordProblems, pictureRiddles: content.pictureRiddles, bonus: content.bonus, questions },
      });
    })();
    return () => (alive = false);
  }, [pid, rev]);

  const update = (patch) => setSettings(saveSettings(pid, patch));
  const doReset = () => {
    resetProfileData(pid);
    setConfirm(null);
    setNotice(t('parent.set.resetDone'));
    setRev((x) => x + 1);
    onChanged();
  };
  const doDelete = () => {
    deleteProfile(pid);
    setConfirm(null);
    onChanged();
    const left = profiles.filter((p) => p.id !== pid);
    if (!left.length) return onClose(true);
    setPid(left[0].id);
  };

  if (!profile) return null;
  return (
    <div class="screen parent dash">
      <header class="ptop">
        <button type="button" class="corner-btn" onClick={() => onClose()} aria-label={t('parent.close')}>
          <UiIcon id="close" />
        </button>
        <h1 class="ms-title">{t('parent.title')}</h1>
        <div class="ptabs" role="tablist">
          {profiles.map((p) => (
            <button type="button" role="tab" aria-selected={p.id === pid} class={`ptab ${p.id === pid ? 'on' : ''}`} onClick={() => { setPid(p.id); setNotice(''); }} key={p.id}>
              <Companion id={p.companion} size={40} />
              <span dir="auto">{p.name}</span>
            </button>
          ))}
        </div>
      </header>

      {!data ? (
        <div class="center pgrow"><div class="loader" aria-busy="true" /></div>
      ) : (
        <div class="pgrid">
          <Card title={t('parent.acc.title')} cls="acc">
            <AccuracyBars rows={data.acc} />
          </Card>
          <Card title={t('parent.minutes.title')} cls="min">
            <p class="ptoday">{t('parent.today', { n: data.today, goal: settings.dailyGoal })}</p>
            <MinutesChart days={data.days} />
          </Card>
          <Card title={t('parent.sims.title')} cls="sims">
            <SimTable sims={data.sims} />
          </Card>
          <Card title={t('parent.mistakes.title')} cls="mist">
            <Mistakes list={data.recent} ctx={data.ctx} readingTypes={data.readingTypes} />
          </Card>
          <Card title={t('parent.settings.title')} cls="sett">
            <div class="prow">
              <span class="prow-lbl">{t('parent.set.timeMode')}</span>
              <span class="seg" role="radiogroup">
                {['timed', 'free'].map((m) => (
                  <button type="button" role="radio" aria-checked={settings.timeMode === m} class={`seg-btn ${settings.timeMode === m ? 'on' : ''}`} onClick={() => update({ timeMode: m })} key={m}>
                    {t(m === 'timed' ? 'parent.set.timed' : 'parent.set.free')}
                  </button>
                ))}
              </span>
            </div>
            <div class="prow">
              <span class="prow-lbl">{t('parent.set.sound')}</span>
              <span class="seg" role="radiogroup">
                {[true, false].map((on) => (
                  <button type="button" role="radio" aria-checked={settings.sound === on} class={`seg-btn ${settings.sound === on ? 'on' : ''}`} onClick={() => update({ sound: on })} key={String(on)}>
                    {t(on ? 'parent.set.on' : 'parent.set.off')}
                  </button>
                ))}
              </span>
            </div>
            <div class="prow">
              <span class="prow-lbl">{t('parent.set.goal')}</span>
              <Stepper value={settings.dailyGoal} min={1} max={10} onChange={(v) => update({ dailyGoal: v })} />
            </div>
            <div class="prow danger-row">
              <button type="button" class="dangerbtn" onClick={() => setConfirm('reset')}>{t('parent.set.reset', { name: profile.name })}</button>
              <button type="button" class="dangerbtn hard" onClick={() => setConfirm('delete')}>{t('parent.set.delete', { name: profile.name })}</button>
            </div>
            {notice && <p class="pnotice" role="status">{notice}</p>}
          </Card>
        </div>
      )}

      {confirm && (
        <div class="overlay" role="dialog">
          <div class="confirm-card">
            <p class="confirm-text" dir="auto">{t(confirm === 'reset' ? 'parent.set.resetConfirm' : 'parent.set.deleteConfirm', { name: profile.name })}</p>
            <div class="row-btns">
              <Btn kind="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Btn>
              <button type="button" class="btn btn-danger" onClick={confirm === 'reset' ? doReset : doDelete}>
                <span>{t(confirm === 'reset' ? 'parent.set.resetYes' : 'parent.set.deleteYes')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Parent({ profiles, activeId, content, onClose, onChanged }) {
  const [open, setOpen] = useState(false);
  if (!open) return <PinGate onOpen={() => setOpen(true)} onClose={() => onClose()} />;
  return <Dashboard profiles={profiles} activeId={activeId} content={content} onClose={onClose} onChanged={onChanged} />;
}
