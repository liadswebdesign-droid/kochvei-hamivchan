// After the simulation: a celebration for finishing (whatever the score), the score per part, then the mistakes one by
// one, with her answer, the right answer and the explanation.
import { useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { TASKS, TIME_LIMIT_MS, answerText, correctText } from '../lib/sim.js';
import { Companion, Btn, MathLine } from '../components/Bits.jsx';
import { BkItem, Say } from '../components/Booklet.jsx';
import { UiIcon } from '../components/Icons.jsx';

const TASK_LABEL = { reading: 'sim.res.reading', A: 'sim.taskA.title', B: 'sim.taskB.title', C: 'sim.taskC.title', D: 'sim.taskD.title' };
const labelOf = (n) => t('mc.label.' + n);
const isWritten = (it) => it.kind === 'numeric' || it.kind === 'inequality';

function Summary({ result, profile, onReview, onDone, onMore }) {
  const { scored, mode, ms } = result;
  const mistakes = scored.mistakes.length;
  const minutes = Math.max(1, Math.round(ms / 60000));
  return (
    <div class="screen results simres">
      <div class="confetti calm" aria-hidden="true">
        {Array.from({ length: 26 }, (_, i) => <span style={{ '--i': i }} />)}
      </div>
      <div class="results-card sr-card">
        <div class="sr-left">
          <Companion id={profile.companion} size={120} mood="happy" />
          <h1 class="title">{t('sim.res.title')}</h1>
          <p class="results-msg">{t('sim.res.sub')}</p>
          <div class="sr-score">
            <span class="sr-label">{t('sim.res.scoreLabel')}</span>
            <span class="sr-big">{t('sim.res.score', { score: scored.score, max: scored.max })}</span>
          </div>
        </div>

        <div class="sr-right">
        <ul class="sr-tasks" aria-label={t('sim.res.byTask')}>
          {TASKS.map((k) => {
            const { score, max } = scored.byTask[k];
            return (
              <li class="sr-task" key={k}>
                <span class="sr-task-name">{t(TASK_LABEL[k])}</span>
                <span class="sr-bar" aria-hidden="true">
                  <span style={{ width: (max ? (100 * score) / max : 0) + '%' }} />
                </span>
                <bdi class="sr-task-score">{score}/{max}</bdi>
              </li>
            );
          })}
        </ul>

        <p class="results-score">{t('sim.res.time', { min: minutes })}</p>
        {mode === 'timed' && ms > TIME_LIMIT_MS && <p class="results-review">{t('sim.res.timeOver')}</p>}

        <div class="row-btns">
          <Btn kind="ghost" onClick={onDone}>{t('sim.res.done')}</Btn>
          <Btn kind="ghost" onClick={onMore}>{t('sim.res.more')}</Btn>
          {mistakes > 0 ? (
            <Btn kind="primary" onClick={onReview}>{t('sim.res.look')}</Btn>
          ) : (
            <p class="results-msg sr-nomiss">{t('sim.res.noMistakes')}</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// The passage lines an item cites (reading questions), so she can see where the answer was.
function CitedLines({ item }) {
  if (!item.passage || !item.lineRef || !item.lineRef.length) return null;
  const lines = item.passage.paragraphs.flat();
  const refs = [...new Set(item.lineRef)].filter((n) => lines[n - 1]).slice(0, 4);
  if (!refs.length) return null;
  return (
    <article class="passage bk-mini rev-lines" lang="he">
      {refs.map((n) => (
        <div class="pline hl" key={n}>
          <span class="pline-n" aria-hidden="true">{n}</span>
          <span class="pline-text">{lines[n - 1]}</span>
        </div>
      ))}
    </article>
  );
}

function ReviewCard({ r, profile }) {
  const it = r.item;
  const written = isWritten(it);
  const mine = answerText(it, r.answer, labelOf);
  const right = correctText(it, labelOf);
  const hint = it.explain || it.hintText || (it.hint ? t(it.hint.key, it.hint.vars) : null);
  return (
    <div class="rev-card">
      <CitedLines item={it} />
      <div class="bk-items">
        {written ? (
          <div class="bk-item bk-written is-example">
            <span class="bk-no">{it.no}.</span>
            <div class="bk-math">
              <MathLine expr={it.expr} value={r.answer == null ? '' : String(r.answer)} size="md" />
            </div>
          </div>
        ) : (
          <BkItem item={it} answer={r.answer == null ? null : r.answer} readOnly rightIdx={it.answer} />
        )}
      </div>
      <dl class="rev-answers">
        <div class="rev-row mine">
          <dt>{t('sim.rev.yours')}</dt>
          <dd>{mine ? <>{mine.label && <b class="rev-letter">{mine.label}</b>}<bdi class="rev-val">{mine.text}</bdi></> : <span class="rev-none">{t('sim.rev.none')}</span>}</dd>
        </div>
        <div class="rev-row right">
          <dt>{t('feedback.answerWas')}</dt>
          <dd>
            {right.label && <b class="rev-letter">{right.label}</b>}
            <bdi class="rev-val">{right.text}</bdi>
            {it.kind === 'inequality' && (
              <span class="rev-note">{t(it.direction === 'greater' ? 'feedback.ineq.greater' : 'feedback.ineq.less', { bound: it.bound, example: it.example })}</span>
            )}
          </dd>
        </div>
      </dl>
      {hint && (
        <Say companion={profile.companion}>
          <span class="rev-hint-lbl">{t('sim.rev.hint')}</span> {hint}
        </Say>
      )}
    </div>
  );
}

export function MockResults({ profile, result, onDone, onMore }) {
  const [phase, setPhase] = useState('summary');
  const [pos, setPos] = useState(0);
  const list = result.scored.mistakes;
  if (phase === 'summary') return <Summary result={result} profile={profile} onReview={() => setPhase('review')} onDone={onDone} onMore={onMore} />;

  const last = pos === list.length - 1;
  return (
    <div class="screen review">
      <header class="ptop">
        <button type="button" class="corner-btn" onClick={() => setPhase('summary')} aria-label={t('common.back')}>
          <UiIcon id="close" />
        </button>
        <h1 class="ms-title">{t('sim.rev.title')}</h1>
        <span class="ptop-count">{t('sim.rev.count', { pos: pos + 1, total: list.length })}</span>
      </header>
      <main class="rev-stage">
        <ReviewCard r={list[pos]} profile={profile} key={list[pos].id} />
      </main>
      <nav class="enav rev-nav">
        <div class="enav-prev">
          {pos > 0 && (
            <button type="button" class="btn btn-ghost" onClick={() => setPos(pos - 1)}>
              <UiIcon id="back" size={28} />
              <span>{t('sim.rev.prev')}</span>
            </button>
          )}
        </div>
        <div class="enav-pad" />
        <div class="enav-next">
          {last ? (
            <Btn kind="primary" onClick={onMore}>{t('sim.rev.finish')}</Btn>
          ) : (
            <button type="button" class="btn btn-primary" onClick={() => setPos(pos + 1)}>
              <span>{t('sim.rev.next')}</span>
              <span class="flip"><UiIcon id="back" size={28} /></span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
