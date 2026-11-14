// "בלש השורות": a passage with numbered lines and a word (or two-word phrase) to find; she taps the line it is on.
// Trains the line lookup that the reading questions ask for ("בשורות 5–6 כתוב…"). Targets appear in exactly one line.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, loadPassage } from '../lib/content.js';
import { sfx } from '../lib/sound.js';
import { PassageView } from '../components/PassageView.jsx';
import { UiIcon } from '../components/Icons.jsx';

const PER_PASSAGE = 6;
const MARKS = /[֑-ׇ]/g; // nikud and cantillation (incl. maqaf, which never splits a word here)
const EDGE = /^[\s.,!?:;"'()\[\]«»״׳\-–—…]+|[\s.,!?:;"'()\[\]«»״׳\-–—…]+$/g;
const bare = (s) => s.replace(MARKS, '').replace(EDGE, '');

// Every word / adjacent pair that occurs on exactly one line, at most once, with ≥ 3 letters.
export function targetsOf(passage) {
  const lines = passage.paragraphs.flat();
  const seen = new Map(); // key → Set(line numbers) + count
  const cands = [];
  lines.forEach((line, i) => {
    const words = line.split(/\s+/).map((w) => w.replace(EDGE, '')).filter(Boolean);
    const grams = [...words.map((w) => [w]), ...words.slice(1).map((w, j) => [words[j], w])];
    for (const g of grams) {
      const key = g.map(bare).join(' ');
      if (!seen.has(key)) seen.set(key, { lines: new Set(), count: 0 });
      const e = seen.get(key);
      e.lines.add(i + 1);
      e.count++;
      cands.push({ key, text: g.join(' '), line: i + 1, words: g.length });
    }
  });
  const ok = cands.filter((c) => {
    const e = seen.get(c.key);
    return e.count === 1 && c.key.replace(/\s/g, '').length >= (c.words === 1 ? 3 : 5);
  });
  return ok;
}

function pickTarget(list, used, lastLine) {
  const fresh = list.filter((c) => !used.has(c.line) && c.line !== lastLine);
  const pool = fresh.length ? fresh : list.filter((c) => c.line !== lastLine);
  const pairs = pool.filter((c) => c.words === 2);
  const from = pairs.length && Math.random() < 0.35 ? pairs : pool.filter((c) => c.words === 1).length ? pool.filter((c) => c.words === 1) : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export function Detective({ content, api }) {
  const [passage, setPassage] = useState(null);
  const [target, setTarget] = useState(null);
  const [found, setFound] = useState(null); // line number just found
  const wrap = useRef(null);
  const state = useRef({ list: [], used: new Set(), asked: 0, order: [], at: 0, tries: 1, t0: 0, last: 0, lock: false });

  const loadNext = async () => {
    const s = state.current;
    if (!s.order.length) s.order = content.passages.map((p) => p.id).sort(() => Math.random() - 0.5);
    const id = s.order[s.at++ % s.order.length];
    const p = await loadPassage(id);
    s.list = targetsOf(p);
    s.used = new Set();
    s.asked = 0;
    s.last = 0;
    setPassage(p);
    ask();
  };

  const ask = () => {
    const s = state.current;
    const tg = pickTarget(s.list, s.used, s.last);
    s.tries = 1;
    s.t0 = performance.now();
    s.lock = false;
    setFound(null);
    setTarget(tg);
  };

  useEffect(() => {
    loadNext();
  }, []);

  const flash = (n, cls) => {
    const el = wrap.current && wrap.current.querySelector(`[data-line="${n}"]`);
    if (!el) return;
    el.classList.remove('d-ok', 'd-no', 'd-hint');
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    if (cls === 'd-no') setTimeout(() => el.classList.remove('d-no'), 500);
  };

  const onTap = (e) => {
    const s = state.current;
    const line = e.target.closest && e.target.closest('[data-line]');
    if (!line || !target || s.lock) return;
    const n = Number(line.dataset.line);
    if (n === target.line) {
      s.lock = true;
      api.log({ id: `game:detective:${passage.id}:${n}`, correct: s.tries === 1, solved: true, tries: s.tries, ms: Math.round(performance.now() - s.t0) });
      sfx.correct();
      api.add(1);
      flash(n, 'd-ok');
      setFound(n);
      s.used.add(n);
      s.last = n;
      s.asked++;
      setTimeout(() => {
        wrap.current && wrap.current.querySelectorAll('.d-ok,.d-hint').forEach((el) => el.classList.remove('d-ok', 'd-hint'));
        if (s.asked >= PER_PASSAGE && content.passages.length > 1) loadNext();
        else ask();
      }, 900);
    } else {
      sfx.tryAgain();
      s.tries++;
      flash(n, 'd-no');
      if (s.tries >= 3) flash(target.line, 'd-hint'); // after two misses the right line glows gently
    }
  };

  if (!passage || !target) return <div class="screen center"><div class="loader" aria-busy="true" /></div>;
  if (import.meta.env.DEV) window.__khGame = { line: target.line }; // dev-only hook for scripts/qa-t5.mjs
  return (
    <div class="detective">
      <div class="detective-ask" role="status">
        <UiIcon id="search" size={34} />
        <span class="detective-label">{t('game.detective.ask')}</span>
        <span class="detective-word" key={target.key + target.line}>«{target.text}»</span>
        {found && <span class="detective-found">{t('game.detective.line', { n: found })}</span>}
      </div>
      <div class="detective-passage" ref={wrap} onClick={onTap}>
        <PassageView passage={passage} />
      </div>
    </div>
  );
}
