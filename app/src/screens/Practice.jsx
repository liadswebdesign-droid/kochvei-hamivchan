import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t, tx } from '../lib/content.js';
import { stripBold } from '../lib/rich.js';
import { islands } from '../config.js';
import { getProgress, saveProgress, skillState, logAttempt, countFinishedSession } from '../lib/storage.js';
import { buildSession, recordForReview, sessionStars } from '../lib/session.js';
import { checkInequality } from '../gen/index.js';
import { Companion, MathLine, DigitEquation, RiddleRows, Btn, StemText, BonusStem, Rich, LoadFailed } from '../components/Bits.jsx';
import { Choices } from '../components/Choices.jsx';
import { NumPad } from '../components/NumPad.jsx';
import { PassageView } from '../components/PassageView.jsx';
import { ShapeSeries, ShapeTile } from '../components/Shapes.jsx';
import { RiddleIcon, StarIcon, UiIcon } from '../components/Icons.jsx';
import { onPracticeComplete } from '../lib/rewards.js'; // T5
import { sfx } from '../lib/sound.js'; // T5

const isPortrait = () => window.matchMedia('(orientation: portrait)').matches;

function scrollParent(el) {
  for (let p = el && el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

function revealFeedback(scroller, foot) {
  const bubble = scroller && scroller.querySelector('.bubble');
  const sc = scrollParent(bubble);
  if (!sc) return;
  const s = sc.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  // Bottom target: the button too when it scrolls along with the bubble; leave room for the fixed portrait toggle.
  const end = foot && sc.contains(foot) ? foot.getBoundingClientRect().bottom : b.bottom;
  const room = document.querySelector('.passage-toggle') && isPortrait() ? 104 : 16;
  const down = Math.min(end + room - s.bottom, b.top - s.top - 12); // never push the bubble's top out of view
  if (down > 0) sc.scrollBy({ top: down, behavior: 'smooth' });
}
const lineLabel = (refs) => (refs.length > 1 ? `${Math.min(...refs)}–${Math.max(...refs)}` : String(refs[0]));

function instruction(item) {
  if (item.kind === 'inequality') return tx('instr.inequality');
  if (item.digit) return tx('instr.digit');
  if (item.riddle) return tx('instr.riddles');
  if (item.skill === 'bonus') return tx('instr.bonus.' + item.type);
  const isl = islands.find((i) => i.id === item.skill);
  return item.skill === 'reading' ? null : tx(isl.instrKey);
}

function hintText(item) {
  if (item.hintText) return item.hintText;
  if (item.hint) return tx(item.hint.key, item.hint.vars);
  return null;
}

// Validate an answer. Inequalities accept ANY whole number that makes the statement true (evaluated, not compared).
function isRight(item, choice, value) {
  if (item.kind === 'mc') return choice === item.answer;
  const n = Number(value);
  if (value === '' || !Number.isInteger(n)) return false;
  if (item.kind === 'inequality') return checkInequality(item, n);
  return n === item.answer;
}

function IneqNote({ item }) {
  return (
    <p class="ineq-note">
      {t(item.direction === 'greater' ? 'feedback.ineq.greater' : 'feedback.ineq.less', { bound: item.bound, example: item.example })}
    </p>
  );
}

// The question body: stem / equation / riddle (without the answer controls).
function Prompt({ item, value, phase, attempt }) {
  const done = phase === 'correct' || phase === 'explain';
  if (item.kind === 'numeric' || item.kind === 'inequality') {
    const filled = phase === 'explain' ? (item.kind === 'inequality' ? item.example : item.answer) : phase === 'correct' ? value : null;
    return <MathLine expr={item.expr} value={value} active={!done} filled={filled} />;
  }
  if (item.digit) {
    return (
      <>
        <DigitEquation digit={item.digit} />
        <p class="ask"><Rich text={tx('instr.digit.ask.' + item.digit.shape)} /></p>
      </>
    );
  }
  if (item.riddle) {
    return (
      <>
        <RiddleRows rows={item.riddle.rows} />
        <p class="ask">
          <span><Rich text={tx('instr.riddles.ask')} /></span>
          <RiddleIcon id={item.riddle.ask} size={52} />
          <span>?</span>
        </p>
      </>
    );
  }
  if (item.skill === 'bonus') return <BonusStem item={item} />;
  return (
    <p class="stem">
      {item.lineRef && item.lineRef.length > 0 && attempt > 1 && <span class="stem-lines">{t(item.lineRef.length > 1 ? 'practice.lines' : 'practice.line', { lines: lineLabel(item.lineRef) })}</span>}
      <StemText text={item.stem} />
    </p>
  );
}

function Explanation({ item }) {
  const right = item.kind === 'mc' ? item.options[item.answer] : null;
  return (
    <div class="explain">
      {item.kind === 'inequality' && (
        <>
          <MathLine expr={item.expr} filled={item.example} size="md" />
          <IneqNote item={item} />
        </>
      )}
      {item.kind === 'numeric' && (
        <>
          <p class="explain-lead">{t('feedback.answerWas')}</p>
          <MathLine expr={item.expr} filled={item.answer} size="md" />
        </>
      )}
      {item.riddle && (
        <>
          <p class="explain-lead">{t('feedback.riddle.solution')}</p>
          <RiddleRows rows={item.riddle.rows} solution={item.solution || null} />
        </>
      )}
      {item.digit && (
        <>
          <p class="explain-lead">{t('feedback.digit.solution')}</p>
          <DigitEquation digit={item.digit} reveal={item.options[item.answer]} />
        </>
      )}
      {item.seq && (
        <>
          <p class="explain-lead">
            {t('feedback.answerWas')} <strong>{t('mc.label.' + (item.answer + 1))}</strong>
          </p>
          <ShapeSeries seq={item.seq} reveal={right} size="sm" />
          {item.explain && <p class="explain-text"><StemText text={item.explain} /></p>}
        </>
      )}
      {item.kind === 'mc' && !item.riddle && !item.digit && !item.seq && (
        <>
          <p class="explain-lead">
            {t('feedback.answerWas')} <strong>{t('mc.label.' + (item.answer + 1))}. <StemText text={right} /></strong>
          </p>
          {item.explain && <p class="explain-text"><StemText text={item.explain} /></p>}
        </>
      )}
    </div>
  );
}

function Celebration({ companion, firstTry, item, onNext }) {
  const cheer = useMemo(() => (firstTry ? t('feedback.correct.' + (1 + Math.floor(Math.random() * 4))) : t('feedback.secondTry')), []);
  const btn = useRef(null);
  useEffect(() => {
    btn.current && btn.current.focus();
    const id = setTimeout(() => sfx.star(), 420); // T5: as the star pops in
    return () => clearTimeout(id);
  }, []);
  return (
    <div class="overlay celebrate" role="dialog" aria-live="polite">
      <div class="confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => <span style={{ '--i': i }} />)}
      </div>
      <div class="celebrate-card">
        <Companion id={companion} size={150} mood="happy" />
        <p class="cheer">{cheer}</p>
        {item.kind === 'inequality' && <IneqNote item={item} />}
        <p class="star-earned">
          <span class="star-pop"><StarIcon size={44} /></span>
          <span>{t('feedback.star')}</span>
        </p>
        <button type="button" class="btn btn-primary" ref={btn} onClick={onNext}>
          <span>{t('common.continue')}</span>
        </button>
      </div>
    </div>
  );
}

export function Practice({ profile, skill, content, onQuit, onFinish }) {
  const pid = profile.id;
  const [session, setSession] = useState(null);
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState(null);
  const [value, setValue] = useState('');
  const [attempt, setAttempt] = useState(1);
  const [phase, setPhase] = useState('answer'); // answer | hint | correct | explain
  const [marks, setMarks] = useState({});
  const [shake, setShake] = useState(0);
  const [results, setResults] = useState([]);
  const [qVisible, setQVisible] = useState(true);
  const [qPeek, setQPeek] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const started = useRef(0);
  const bodyRef = useRef(null);
  const passageRef = useRef(null);
  const questionRef = useRef(null);
  const scrollRef = useRef(null);
  const footRef = useRef(null);

  const progress0 = useMemo(() => getProgress(pid), [pid]);
  const st = skillState(progress0, skill);

  useEffect(() => {
    let alive = true;
    buildSession({ pid, skill, level: st.level, sessions: st.sessions, content, readingDone: st.readingDone || [] }).then(
      (s) => alive && setSession(s),
      () => alive && setLoadFailed(true), // no passage could be loaded: an error with a way back, not an endless loader
    );
    return () => (alive = false);
  }, []);

  const item = session && session.items[idx];
  useEffect(() => {
    started.current = performance.now();
  }, [idx, session]);
  if (import.meta.env.DEV) window.__khItem = item; // dev-only hook for the screenshot/QA script

  // Portrait: the question counts as "in view" once its top has scrolled into the upper part of the screen; this flips
  // the sticky toggle between "to the passage" and "to the question". While the question's first lines peek in at the
  // bottom of the screen (its top in the lower part, the passage end above it) the toggle steps away: it would sit on
  // exactly those lines, and the question is already in view. That is also the first view of a passage that fits.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !questionRef.current) return;
    const onScroll = () => {
      const q = questionRef.current;
      if (!q) return;
      const top = q.getBoundingClientRect().top - body.getBoundingClientRect().top;
      setQVisible(top < body.clientHeight * 0.45);
      setQPeek(top >= body.clientHeight * 0.45 && top < body.clientHeight);
    };
    onScroll();
    body.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      body.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [item && item.passageId, !!session]);

  // When a hint or explanation appears, scroll it into full view (with the check/continue button after it when that
  // shares the scroller) so the feedback is never half-hidden below the fold.
  useEffect(() => {
    if (phase !== 'hint' && phase !== 'explain') return;
    const raf = requestAnimationFrame(() => revealFeedback(scrollRef.current, footRef.current));
    return () => cancelAnimationFrame(raf);
  }, [phase, idx]);

  if (loadFailed) return <LoadFailed onBack={onQuit} label={t('practice.quit')} />;
  if (!session) return <div class="screen center"><div class="loader" aria-busy="true" /></div>;
  if (!item) return null;

  const passage = item.passage || null;
  const highlight = passage && attempt > 1 ? item.lineRef || [] : [];
  const canCheck = phase === 'answer' || phase === 'hint' ? (item.kind === 'mc' ? choice != null : value !== '') : false;

  function finishItem(firstTry, solved) {
    const ms = Math.round(performance.now() - started.current);
    logAttempt(pid, { skill, id: item.id, correct: firstTry, solved, tries: firstTry ? 1 : 2, ms, review: !!item.review });
    recordForReview(pid, item, firstTry, st.sessions);
    if (solved) {
      const p = getProgress(pid);
      p.stars += 1;
      saveProgress(pid, p);
    }
    setResults((r) => [...r, { id: item.id, firstTry, solved }]);
  }

  function check() {
    if (!canCheck) return;
    if (isRight(item, choice, value)) {
      sfx.correct();
      finishItem(attempt === 1, true);
      if (item.kind === 'mc') setMarks({ ...marks, [item.answer]: 'correct' });
      setPhase('correct');
      return;
    }
    setShake((s) => s + 1);
    sfx.tryAgain();
    if (attempt === 1) {
      if (item.kind === 'mc') setMarks({ ...marks, [choice]: 'wrong' });
      setChoice(null);
      setValue('');
      setAttempt(2);
      setPhase('hint');
      if (passage && item.lineRef && item.lineRef.length && !isPortrait()) {
        requestAnimationFrame(() => {
          const el = passageRef.current && passageRef.current.querySelector(`[data-line="${item.lineRef[0]}"]`);
          el && el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
    } else {
      finishItem(false, false);
      if (item.kind === 'mc') setMarks({ ...marks, [choice]: 'wrong', [item.answer]: 'correct' });
      setChoice(null);
      setPhase('explain');
    }
  }

  function next() {
    if (idx + 1 >= session.items.length) {
      const all = [...results];
      const mistakes = all.filter((r) => !r.firstTry).length;
      const rating = sessionStars(mistakes);
      const p = getProgress(pid);
      const s = skillState(p, skill);
      const levelUp = rating === 3 && s.level < 3;
      const readingDone = session.passageId ? [...new Set([...(s.readingDone || []), session.passageId])] : s.readingDone;
      p.skills[skill] = { ...s, sessions: s.sessions + 1, best: Math.max(s.best, rating), level: levelUp ? s.level + 1 : s.level, ...(readingDone ? { readingDone } : {}) };
      countFinishedSession(p); // the parent's "rounds today"
      saveProgress(pid, p);
      const stickers = onPracticeComplete(profile, { rating }); // T5: album + streak
      onFinish({ skill, rating, total: all.length, firstTry: all.length - mistakes, starsEarned: all.filter((r) => r.solved).length, levelUp, level: p.skills[skill].level, reviewAdded: mistakes, stickers });
      return;
    }
    setIdx(idx + 1);
    setChoice(null);
    setValue('');
    setAttempt(1);
    setPhase('answer');
    setMarks({});
    if (bodyRef.current && !passage) bodyRef.current.scrollTop = 0;
    if (questionRef.current) questionRef.current.scrollTop = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  const togglePassage = () => {
    const target = qVisible ? passageRef.current : questionRef.current;
    target && target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const instr = instruction(item);
  const hint = hintText(item);
  const numericOptions = item.kind === 'mc' && item.options.every((o) => typeof o === 'number' || /^[\d\s־]+$/.test(String(o)));

  return (
    <div class={`screen practice sk-${skill} pk-${item.kind} ${passage ? 'with-passage' : ''}`}>
      <header class="ptop">
        <button type="button" class="corner-btn" onClick={onQuit} aria-label={t('practice.quit')}>
          <UiIcon id="close" />
        </button>
        <div class="dots" aria-label={t('practice.progress', { n: idx + 1, total: session.items.length })}>
          {session.items.map((_, i) => (
            <span class={`dot ${i < idx ? (results[i] && results[i].firstTry ? 'ok' : 'miss') : i === idx ? 'now' : ''}`} />
          ))}
        </div>
        <span class="ptop-count">{t('practice.progress', { n: idx + 1, total: session.items.length })}</span>
      </header>

      <div class="pbody" ref={bodyRef}>
        {passage && (
          <section class="ppassage" ref={passageRef}>
            <p class="instr"><Rich text={tx('instr.reading')} /></p>
            <PassageView passage={passage} highlight={highlight} />
          </section>
        )}
        <section class={`pquestion kind-${item.kind}`} ref={questionRef}>
          <div class="pscroll" ref={scrollRef}>
          <div class={`qcard ${shake ? 'shake-' + (shake % 2) : ''}`} key={idx}>
            {item.review && <span class="review-tag">{t('practice.review')}</span>}
            {instr && <p class="instr"><Rich text={instr} /></p>}
            <Prompt item={item} value={value} phase={phase} attempt={attempt} />

            {item.kind === 'mc' ? (
              <Choices
                options={item.options}
                selected={choice}
                onSelect={(i) => (phase === 'answer' || phase === 'hint') && setChoice(i)}
                marks={marks}
                locked={phase === 'correct' || phase === 'explain'}
                layout={numericOptions || item.seq ? 'row' : !passage && item.options.every((o) => stripBold(o).length <= 18) ? 'grid' : 'list'}
                variant={item.seq ? 'shapes' : null}
                render={item.seq ? (o) => <span class="stile"><ShapeTile tok={o} /></span> : numericOptions ? null : (o) => <StemText text={o} />}
              />
            ) : null}
          </div>

          {item.kind !== 'mc' && phase !== 'explain' && phase !== 'correct' && (
            <div class="pad-wrap">
              <NumPad value={value} onChange={setValue} />
            </div>
          )}

          {phase === 'hint' && (
            <div class="bubble hint" role="status">
              <Companion id={profile.companion} size={64} mood="think" />
              <div>
                <p class="bubble-title">{t('feedback.tryAgain')}</p>
                {passage && item.lineRef && item.lineRef.length ? <p>{t('feedback.lookAtLines')}</p> : null}
                {hint && (
                  <p class="hint-text">
                    <UiIcon id="bulb" size={22} /> <span><StemText text={hint} /></span>
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === 'explain' && (
            <div class="bubble explainbox" role="status">
              <Companion id={profile.companion} size={64} />
              <div>
                <p class="bubble-title">{t('feedback.explain')}</p>
                <Explanation item={item} />
              </div>
            </div>
          )}
          </div>

          <div class="pfoot" ref={footRef}>
            {phase === 'explain' ? (
              <Btn kind="primary" onClick={next}>{t('common.continue')}</Btn>
            ) : (
              phase !== 'correct' && (
                <Btn kind="check" onClick={check} disabled={!canCheck}>
                  {t('common.check')}
                </Btn>
              )
            )}
          </div>
        </section>
      </div>

      {passage && (
        <button type="button" class={`passage-toggle ${qPeek ? 'is-away' : ''}`} onClick={togglePassage}>
          <UiIcon id={qVisible ? 'passage' : 'question'} size={26} />
          <span>{qVisible ? t('practice.toPassage') : t('practice.toQuestion')}</span>
        </button>
      )}

      {phase === 'correct' && <Celebration companion={profile.companion} firstTry={attempt === 1} item={item} onNext={next} />}
    </div>
  );
}
