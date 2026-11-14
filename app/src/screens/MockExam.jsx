// The simulated test: a paper booklet you page through. No right/wrong feedback until the end.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, tx, loadPassage } from '../lib/content.js';
import { STOP_PAUSE_MS } from '../config.js';
import { logAttempt, getProgress, skillState } from '../lib/storage.js';
import { recordForReview } from '../lib/session.js';
import { newSeed } from '../gen/rng.js';
import {
  ENDLESS, TIME_LIMIT_MS, simNumber, planEndless, loadSim, canGoBack, scoreSim, isAnswered, historyEntry,
} from '../lib/sim.js';
import { defFor, addSim, saveRun, clearRun } from '../lib/simStore.js';
import { onMockComplete } from '../lib/rewards.js';
import { Btn, Companion, Rich } from '../components/Bits.jsx';
import { NumPad } from '../components/NumPad.jsx';
import { UiIcon } from '../components/Icons.jsx';
import { PassageView } from '../components/PassageView.jsx';
import { BkItem, SandClock, Sheet, Say, StopDog } from '../components/Booklet.jsx';

const TITLE = { A: 'sim.taskA.title', B: 'sim.taskB.title', C: 'sim.taskC.title', D: 'sim.taskD.title' };
const INSTR = { A: 'sim.taskA.instr', B: 'sim.taskB.instr', C: 'sim.taskC.instr' };
const SAY = { reading: 'sim.example.reading.say', A: 'sim.example.A.say', B: 'sim.example.B.say', C: 'sim.example.C.say', D: 'sim.example.D.say' };
const EX_OPTIONS = ['sim.example.reading.o1', 'sim.example.reading.o2', 'sim.example.reading.o3', 'sim.example.reading.o4'];
const isWritten = (it) => it.kind === 'numeric' || it.kind === 'inequality';
const flip = (id) => <span class="flip"><UiIcon id={id} size={28} /></span>;

// ---- sand clock bar -------------------------------------------------------------------------------------------------
function ClockBar({ t0 }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const p = t0 ? (Date.now() - t0) / TIME_LIMIT_MS : 0;
  return (
    <div class={`clockbar ${p >= 1 ? 'over' : ''}`} role="timer">
      <SandClock progress={p} size={56} />
      {p >= 1 && (
        <p class="clock-msg" role="status">
          <strong>{t('sim.timer.over')}</strong>
          <span>{t('sim.timer.overSub')}</span>
        </p>
      )}
    </div>
  );
}

// ---- example pages (worked with the companion, never scored) ----------------------------------------------------
function exampleItem(task) {
  if (task === 'reading') return { kind: 'mc', no: 1, stem: tx('sim.example.reading.q'), options: EX_OPTIONS.map((k) => tx(k)), answer: 0 };
  if (task === 'A') return [{ kind: 'numeric', no: 1, expr: [24, '+', 13, '=', { blank: true }], answer: 37 }];
  if (task === 'B') return [
    { kind: 'numeric', no: 1, expr: [5, '+', { blank: true }, '=', 9], answer: 4 },
    { kind: 'inequality', no: 2, expr: [3, '+', 2, '<', 3, '+', { blank: true }], answer: 5, ineq: true },
  ];
  if (task === 'C') return { kind: 'mc', no: 1, stem: tx('sim.example.C.stem'), options: [6, 7, 8, 9], answer: 2 };
  return { kind: 'mc', no: 1, riddle: { rows: [{ terms: ['flower', 'flower'], total: 6 }], ask: 'flower' }, options: [2, 3, 4, 6], answer: 1 };
}

function ExamplePage({ task, companion }) {
  const ex = exampleItem(task);
  const list = Array.isArray(ex) ? ex : [ex];
  return (
    <>
      {task === 'reading' && <h1 class="bk-part">{t('sim.part1.title')}</h1>}
      {task === 'A' && <h1 class="bk-part">{t('sim.part2.title')}</h1>}
      {task !== 'reading' && <h2 class="bk-task">{t(TITLE[task])}</h2>}
      <div class="bk-stamp-row">
        <span class="bk-stamp">{t('sim.example.tag')}</span>
        <p class="bk-unscored">{t('sim.example.unscored')}</p>
      </div>
      {task === 'reading' && (
        <article class="passage bk-mini" lang="he">
          <div class="pline"><span class="pline-n" aria-hidden="true">1</span><span class="pline-text"><Rich text={tx('sim.example.reading.line1')} /></span></div>
          <div class="pline"><span class="pline-n" aria-hidden="true">2</span><span class="pline-text"><Rich text={tx('sim.example.reading.line2')} /></span></div>
        </article>
      )}
      <div class="bk-items">
        {list.map((it) => {
          const written = isWritten(it);
          return (
            <BkItem
              key={it.no}
              item={it}
              answer={written ? String(it.answer) : it.answer}
              readOnly
              delay={900}
              onAnswer={() => {}}
            />
          );
        })}
      </div>
      {task === 'B' && <p class="bk-instr bk-instr-soft"><Rich text={tx('sim.example.B.ineq')} /></p>}
      <Say companion={companion} mood="happy">{tx(SAY[task])}</Say>
    </>
  );
}

// ---- stop page ------------------------------------------------------------------------------------------------------------------
// The companion plays the teacher: a short break, then "you may continue".
function StopPage({ companion, ready, onReady, onContinue }) {
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(onReady, window.__khStopMs != null ? window.__khStopMs : STOP_PAUSE_MS);
    return () => clearTimeout(id);
  }, [ready]);
  return (
    <div class="bk-stop">
      <StopDog />
      <div class="bk-stop-col">
        <p class="bk-stop-text">{t('sim.stop.text')}</p>
        <Say companion={companion} mood={ready ? 'happy' : 'think'}>{ready ? t('sim.stop.go') : t('sim.stop.wait')}</Say>
        {ready ? (
          <Btn kind="primary" onClick={onContinue}>{t('sim.stop.btn')}</Btn>
        ) : (
          <div class="bk-wait" aria-hidden="true"><span /><span /><span /></div>
        )}
      </div>
    </div>
  );
}

// ---- the exam -------------------------------------------------------------------------------------------------------------------------
export function MockExam({ profile, content, simId: id, mode, resume, onQuit, onFinish }) {
  const pid = profile.id;
  const [sim, setSim] = useState(null);
  const [answers, setAnswers] = useState((resume && resume.answers) || {});
  const [page, setPage] = useState((resume && resume.pageIdx) || 0);
  const [dir, setDir] = useState('next');
  const [active, setActive] = useState(null);
  const [stopOk, setStopOk] = useState(false);
  const [ask, setAsk] = useState(null); // 'quit' | { unanswered }
  const [t0, setT0] = useState(resume && resume.pageIdx >= 1 ? Date.now() - (resume.elapsed || 0) : null);
  const seed = useRef(resume && resume.seed != null ? resume.seed : id === ENDLESS ? newSeed() : null);

  useEffect(() => {
    let alive = true;
    const def = id === ENDLESS ? planEndless(content, seed.current) : defFor(simNumber(id), content);
    loadSim(def, content, loadPassage).then((s) => alive && setSim(s));
    return () => (alive = false);
  }, []);

  // the clock starts when the booklet is opened
  useEffect(() => {
    if (page >= 1 && t0 == null) setT0(Date.now());
  }, [page]);

  // keep the run so a tablet restart mid-test can resume
  useEffect(() => {
    if (!sim) return;
    saveRun(pid, { simId: id, seed: seed.current, mode, elapsed: t0 ? Date.now() - t0 : 0, answers, pageIdx: page, saved: Date.now() });
  }, [sim, answers, page, t0]);

  const cur = sim && sim.pages[page];

  // On a new page the first unanswered written item gets the pencil
  useEffect(() => {
    if (!cur || cur.type !== 'items') return setActive(null);
    const written = cur.items.filter(isWritten);
    const first = written.find((it) => !isAnswered(answers[it.id])) || written[0];
    setActive(first ? first.id : null);
  }, [page, !!sim]);

  if (import.meta.env.DEV && sim) window.__khExam = { sim, page, setPage, answers, setAnswers, setT0, setStopOk, active };

  if (!sim) return <div class="screen center"><div class="loader" aria-busy="true" /></div>;

  const go = (to) => {
    setDir(to > page ? 'next' : 'prev');
    setPage(to);
  };
  const back = canGoBack(sim.pages, page);
  const last = page === sim.pages.length - 1;
  const canNext = !last && cur.type !== 'cover' && cur.type !== 'stop';
  const showPad = cur.type === 'items' && cur.items.some(isWritten);
  const pageNo = cur.pageNo;
  const showNext = canNext && cur.type !== 'example';

  const setAnswer = (item, v) =>
    setAnswers((a) => {
      const n = { ...a };
      if (v == null || v === '') delete n[item.id];
      else n[item.id] = v;
      return n;
    });

  function finish(force) {
    const missing = sim.items.filter((it) => !isAnswered(answers[it.id])).length;
    if (missing && !force) return setAsk({ unanswered: missing });
    const ms = t0 ? Date.now() - t0 : 0;
    const scored = scoreSim(sim, answers);
    const progress = getProgress(pid);
    for (const r of scored.results) {
      const { item } = r;
      logAttempt(pid, { skill: item.skill, id: item.id, correct: r.correct, solved: r.correct, tries: 1, ms: 0, sim: sim.id, task: item.task, ...(item.type ? { type: item.type } : {}), ...(r.answered ? {} : { blank: true }) });
      recordForReview(pid, item, r.correct, skillState(progress, item.skill).sessions);
    }
    const entry = historyEntry(sim, scored, { mode, ms });
    addSim(pid, entry);
    clearRun(pid);
    // the 'mock' sticker (a gold star once the album is full) + the day counts for the streak; shown on the results
    const stickers = onMockComplete(profile);
    onFinish({ sim, scored, entry, ms, mode, stickers });
  }

  function quit() {
    // nothing answered yet and still on the cover: no run worth keeping
    if (page <= 1 && !Object.keys(answers).length) clearRun(pid);
    onQuit();
  }

  const body = (() => {
    switch (cur.type) {
      case 'cover':
        return (
          <div class="bk-cover">
            <p class="cover-kicker">{sim.endless ? t('sim.cover.endless') : t('sim.cover.name', { n: sim.n })}</p>
            <h1 class="cover-title">{t('sim.cover.title')}</h1>
            <Say companion={profile.companion} mood="happy">{t('sim.cover.hello', { name: profile.name })}</Say>
            <p class="cover-note">{mode === 'timed' ? t('sim.cover.timed') : t('sim.cover.free')}</p>
            <Btn kind="primary" onClick={() => go(1)}>{t('sim.cover.open')}</Btn>
          </div>
        );
      case 'example':
        return <ExamplePage task={cur.task} companion={profile.companion} />;
      case 'passage':
        return (
          <>
            <p class="bk-instr"><Rich text={tx(cur.story ? 'sim.part1.storyInstr' : 'sim.part1.instr')} /></p>
            <PassageView passage={cur.passage} />
          </>
        );
      case 'stop':
        return <StopPage companion={profile.companion} ready={stopOk} onReady={() => setStopOk(true)} onContinue={() => go(page + 1)} />;
      case 'end': {
        return (
          <div class="bk-end">
            <h1 class="bk-part">{t('sim.end.title')}</h1>
            <Say companion={profile.companion} mood="happy">{tx('sim.end.text')}</Say>
            <Btn kind="primary" onClick={() => finish(false)}>{t('sim.end.finish')}</Btn>
          </div>
        );
      }
      default: {
        const reading = cur.task === 'reading';
        const digit = cur.items.some((it) => it.digit);
        const instrKey = cur.ineq ? 'sim.taskB.ineq' : reading ? (cur.first ? 'sim.part1.questions' : null) : cur.task === 'D' ? (digit ? 'instr.digit' : 'instr.riddles') : INSTR[cur.task];
        return (
          <>
            {reading ? <p class="bk-ctx">{cur.ctxTitle}</p> : <h2 class="bk-task">{t(TITLE[cur.task])}</h2>}
            {instrKey && <p class="bk-instr"><Rich text={tx(instrKey)} /></p>}
            <div class="bk-items">
              {cur.items.map((it, i) => (
                <BkItem
                  key={it.id}
                  item={it}
                  answer={answers[it.id]}
                  onAnswer={(v) => setAnswer(it, v)}
                  active={active === it.id}
                  onActivate={() => setActive(it.id)}
                />
              ))}
            </div>
          </>
        );
      }
    }
  })();

  const activeItem = showPad && cur.items.find((it) => it.id === active);

  return (
    <div class={`screen exam page-${cur.type} task-${cur.task || 'none'}`}>
      <header class="etop">
        <button type="button" class="corner-btn" onClick={() => setAsk('quit')} aria-label={t('sim.quit')}>
          <UiIcon id="close" />
        </button>
        <span class="etop-title">{sim.endless ? t('sim.cover.endless') : t('sim.cover.name', { n: sim.n })}</span>
        <span class="etop-spacer" />
        {mode === 'timed' && page >= 1 && <ClockBar t0={t0} />}
      </header>

      <main class="exam-stage">
        <Sheet key={cur.key} pageNo={pageNo} showNext={showNext} dir={dir} kind={`sheet-${cur.type}`}>
          {body}
        </Sheet>
      </main>

      <nav class="enav" aria-label={t('sim.nav.next')}>
        <div class="enav-prev">
          {back && (
            <button type="button" class="btn btn-ghost" onClick={() => go(page - 1)}>
              <UiIcon id="back" size={28} />
              <span>{t('sim.nav.prev')}</span>
            </button>
          )}
        </div>
        <div class="enav-pad">
          {showPad && (
            <NumPad
              value={(activeItem && answers[activeItem.id]) || ''}
              onChange={(v) => activeItem && setAnswer(activeItem, v)}
              disabled={!activeItem}
            />
          )}
        </div>
        <div class="enav-next">
          {canNext && (
            <button type="button" class="btn btn-primary" onClick={() => go(page + 1)}>
              <span>{cur.type === 'example' ? t('sim.example.go') : t('sim.nav.next')}</span>
              {flip('back')}
            </button>
          )}
        </div>
      </nav>

      {ask === 'quit' && (
        <div class="overlay" role="dialog">
          <div class="confirm-card">
            <Companion id={profile.companion} size={88} mood="think" />
            <p class="confirm-text">{t('sim.quit.confirm')}</p>
            <div class="row-btns">
              <Btn kind="ghost" onClick={() => setAsk(null)}>{t('common.cancel')}</Btn>
              <Btn kind="primary" onClick={quit}>{t('sim.quit.yes')}</Btn>
            </div>
          </div>
        </div>
      )}
      {ask && ask.unanswered != null && (
        <div class="overlay" role="dialog">
          <div class="confirm-card">
            <Companion id={profile.companion} size={88} mood="think" />
            <p class="confirm-text">{t('sim.end.unanswered', { n: ask.unanswered })}</p>
            <div class="row-btns">
              <Btn kind="ghost" onClick={() => finish(true)}>{t('sim.end.finishAnyway')}</Btn>
              <Btn kind="primary" onClick={() => setAsk(null)}>{t('sim.end.goBack')}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
