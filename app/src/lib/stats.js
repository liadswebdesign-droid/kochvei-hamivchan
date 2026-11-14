// Aggregations for the parent screen. Pure: they read the per-profile log (storage.js shape
// { t, skill, id, correct, tries, ms, [sim], [task], [type] }) and the simulation history.
import { itemFromId } from '../gen/index.js';

export const READING_TYPES = ['detail', 'vocab', 'reference', 'purpose', 'not-answered', 'synonyms', 'inference', 'why', 'title', 'sequence'];
const SKILL_ORDER = ['exercises', 'missing', 'inequality', 'wordProblems', 'riddles', 'bonus'];

// Reading ids look like "<passage id>-q<n>" (content/SCHEMA.md); old log lines carry no question type.
export const passageOf = (qid) => String(qid).replace(/-q\d+$/, '');

// Which accuracy bucket a log line belongs to.
export function bucketOf(e, readingTypes = {}) {
  if (e.skill === 'reading') return 'reading:' + (e.type || readingTypes[e.id] || 'other');
  if (e.skill === 'bonus') return 'bonus';
  if (e.skill === 'missing') return String(e.id).startsWith('g:iq:') ? 'inequality' : 'missing';
  return e.skill;
}

// First-try accuracy per bucket: [{ key, correct, total, pct }] in a stable display order.
// Mini-game taps (log lines tagged `game`, T5) count as practice time (minutesPerDay, sessionsOn) but not here: a timed
// game is play, not a measure of the skill, and its ids (game:detective:…) name no question.
export function accuracy(log, readingTypes) {
  const acc = {};
  for (const e of log) {
    if (e.game) continue;
    const k = bucketOf(e, readingTypes);
    const a = (acc[k] ||= { key: k, correct: 0, total: 0 });
    a.total += 1;
    if (e.correct) a.correct += 1;
  }
  const rank = (k) => {
    if (k.startsWith('reading:')) {
      const i = READING_TYPES.indexOf(k.slice(8));
      return 100 + (i < 0 ? 99 : i);
    }
    return SKILL_ORDER.indexOf(k);
  };
  return Object.values(acc)
    .map((a) => ({ ...a, pct: Math.round((100 * a.correct) / a.total) }))
    .sort((x, y) => rank(x.key) - rank(y.key));
}

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const IDLE_CAP_MS = 120000; // a question left open while the tablet lay on the sofa must not count as 40 minutes

// Minutes practised on each of the last `days` days (oldest first). Simulations count by their recorded duration.
export function minutesPerDay(log, sims, days = 14, now = Date.now()) {
  const out = [];
  const idx = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    idx[key] = out.length;
    out.push({ date: key, day: d.getDay(), minutes: 0 });
  }
  for (const e of log) {
    if (e.sim) continue;
    const i = idx[dayKey(e.t)];
    if (i != null) out[i].minutes += Math.min(e.ms || 0, IDLE_CAP_MS) / 60000;
  }
  for (const s of sims) {
    const i = idx[dayKey(s.t)];
    if (i != null) out[i].minutes += (s.ms || 0) / 60000;
  }
  return out.map((d) => ({ ...d, minutes: Math.round(d.minutes) }));
}

// Sessions today: the practice sessions FINISHED today, as recorded per day in progress.days (storage.js
// countFinishedSession), plus one per simulation. Data saved before that record existed (no `days` object) falls back to
// the old estimate: a new session starts after a 15 minute gap in the log.
export function sessionsOn(log, sims, now = Date.now(), days = null, gapMs = 15 * 60000) {
  const today = dayKey(now);
  let n = sims.filter((s) => dayKey(s.t) === today).length;
  if (days && typeof days === 'object' && !Array.isArray(days)) return n + (Number(days[today]) || 0);
  let last = -Infinity;
  for (const e of log) {
    if (e.sim || dayKey(e.t) !== today) continue;
    if (e.t - last > gapMs) n += 1;
    last = e.t;
  }
  return n;
}

// The most recent first-try mistakes, one line per item id.
export function recentMistakes(log, n = 20) {
  const seen = new Set();
  const out = [];
  for (let i = log.length - 1; i >= 0 && out.length < n; i--) {
    const e = log[i];
    if (e.game || e.correct || seen.has(e.id)) continue; // games: see accuracy()
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

// Trend of a simulation history: percent vs the previous simulation of any kind ('up' | 'down' | 'same' | null).
export function withTrend(sims) {
  return sims.map((s, i) => {
    if (i === 0) return { ...s, trend: null };
    const d = s.score / s.max - sims[i - 1].score / sims[i - 1].max;
    return { ...s, trend: d > 0.001 ? 'up' : d < -0.001 ? 'down' : 'same' };
  });
}

const EMOJI = { flower: '🌸', star: '⭐', gem: '💎', key: '🔑', house: '🏠', car: '🚗', sun: '☀️', apple: '🍎', heart: '❤️', moon: '🌙', ball: '⚽', fish: '🐟' };
const SHAPE = { triangle: '△', square: '□', circle: '○' };
const riddleText = (rows, ask) => rows.map((r) => r.terms.map((x) => EMOJI[x] || x).join('+') + '=' + r.total).join('   ') + '   ?' + (EMOJI[ask] || ask);

// A one-line text for a logged item id, for the "recent mistakes" list. `ctx` = { wordProblems, pictureRiddles, bonus,
// questions } where `questions` maps a reading question id to its stem.
export function describeItem(id, ctx) {
  const gen = itemFromId(id);
  if (gen) {
    if (gen.riddle) return { text: riddleText(gen.riddle.rows, gen.riddle.ask), math: true };
    if (gen.digit) {
      const d = gen.digit;
      const term = (x) => x.replace(/S/g, SHAPE[d.shape]);
      return { text: d.terms.map(term).join(' ' + d.ops[0] + ' ') + ' = ' + d.total, math: true };
    }
    return { text: gen.expr.map((x) => (x && x.blank ? '__' : x)).join(' '), math: true };
  }
  const wp = ctx.wordProblems.find((x) => x.id === id);
  if (wp) return { text: wp.stem };
  const pr = ctx.pictureRiddles.find((x) => x.id === id);
  if (pr) return { text: riddleText(pr.rows, pr.ask), math: true };
  const b = ctx.bonus.find((x) => x.id === id);
  if (b) return { text: b.stem };
  if (ctx.questions[id]) return { text: ctx.questions[id] };
  return { text: String(id), math: true };
}
