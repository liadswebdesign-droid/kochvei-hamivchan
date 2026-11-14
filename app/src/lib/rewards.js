// Stickers, daily streak, mini-game bests (T5). One blob per profile: kh:p:<id>:rewards
//
//   { stickers: { "<n>": { reason, t } },   earned stickers, n = 1..STICKER_COUNT
//     unseen: [n],                          earned but not yet stuck into the album (album animates these)
//     sessions: 0,                          finished practice sessions (all islands)
//     streak: { last: 'YYYY-MM-DD', days, hit: [2, 4] },   local calendar days; `hit` = milestones paid this run
//     games: { <gameId>: { best, plays } },
//     starsSeen: null | number }            star total the map last showed (drives the "stars fly in" moment)
//
// Rules (PLAN §2 rewards): a sticker for every practice session finished with 3 stars, for every 5th finished session,
// for a daily streak of 2, 4 and 6 days, and for finishing a mock exam. The mock exam (T6) calls
// onMockComplete(profile) — or awardSticker(profile, 'mock') directly — and shows <StickerReward> with the result.
import { STICKER_COUNT, STREAK_MILESTONES, STICKER_EVERY_SESSIONS } from '../config.js';
import { getRewardsRaw, saveRewardsRaw } from './storage.js';

export const REASONS = ['three-stars', 'five-sessions', 'streak', 'mock'];

// ---- local calendar days ------------------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The calendar day before `day` (built from y/m/d parts, so DST changes never skip or repeat a day).
export function prevDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

export const emptyRewards = () => ({ stickers: {}, unseen: [], sessions: 0, streak: { last: null, days: 0, hit: [] }, games: {}, starsSeen: null });

// ---- pure rules (unit-tested) -------------------------------------------------------------------------------------
// Count `today` as an active day. Returns the new streak and the milestone reached today (or null).
export function applyStreak(streak, today) {
  const s = streak || { last: null, days: 0, hit: [] };
  if (s.last === today) return { streak: s, milestone: null };
  const next = s.last && s.last === prevDay(today) ? { last: today, days: s.days + 1, hit: s.hit || [] } : { last: today, days: 1, hit: [] };
  const milestone = STREAK_MILESTONES.includes(next.days) && !next.hit.includes(next.days) ? next.days : null;
  if (milestone) next.hit = [...next.hit, milestone];
  return { streak: next, milestone };
}

// The streak as the girl sees it today: yesterday's run still counts until today ends; older runs show 0.
export function currentStreak(streak, today) {
  if (!streak || !streak.last) return 0;
  return streak.last === today || streak.last === prevDay(today) ? streak.days : 0;
}

// Stickers come in album order: the lowest number not yet earned. null once the album is full.
export function nextSticker(stickers) {
  for (let n = 1; n <= STICKER_COUNT; n++) if (!stickers[n]) return n;
  return null;
}

// Mutates `r`. Returns { n, reason, days? } or null when the album is full.
function give(r, reason, now, extra = {}) {
  const n = nextSticker(r.stickers);
  if (n == null) return null;
  r.stickers[n] = { reason, t: now.getTime(), ...extra };
  r.unseen = [...r.unseen.filter((x) => x !== n), n];
  return { n, reason, ...extra };
}

// What a finished practice session earns. Mutates `r`; returns the stickers given, in order.
export function practiceRewards(r, { rating }, now) {
  const out = [];
  r.sessions += 1;
  if (rating === 3) out.push(give(r, 'three-stars', now));
  if (r.sessions % STICKER_EVERY_SESSIONS === 0) out.push(give(r, 'five-sessions', now));
  out.push(...activityRewards(r, now));
  return out.filter(Boolean);
}

// Any finished activity (practice session, mini-game, mock exam) counts the day for the streak.
export function activityRewards(r, now) {
  const { streak, milestone } = applyStreak(r.streak, localDay(now));
  r.streak = streak;
  return milestone ? [give(r, 'streak', now, { days: milestone })].filter(Boolean) : [];
}

// ---- storage-backed API -------------------------------------------------------------------------------------------
const pidOf = (profile) => (typeof profile === 'string' ? profile : profile.id);
export const getRewards = (profile) => ({ ...emptyRewards(), ...(getRewardsRaw(pidOf(profile)) || {}) });
const put = (profile, r) => saveRewardsRaw(pidOf(profile), r);

function update(profile, fn) {
  const r = getRewards(profile);
  const out = fn(r);
  put(profile, r);
  return out;
}

// Give one sticker for `reason` ('three-stars' | 'five-sessions' | 'streak' | 'mock'). Returns { n, reason } or null.
export function awardSticker(profile, reason, now = new Date()) {
  return update(profile, (r) => give(r, reason, now));
}

// Call when a practice session ends. Returns the stickers earned (possibly []).
export const onPracticeComplete = (profile, summary, now = new Date()) => update(profile, (r) => practiceRewards(r, summary, now));

// For T6: the mock exam finished. Gives the 'mock' sticker and counts the day for the streak.
export const onMockComplete = (profile, now = new Date()) =>
  update(profile, (r) => [give(r, 'mock', now), ...activityRewards(r, now)].filter(Boolean));

// A mini-game round ended with `score`. Returns { best, prevBest, record, stickers }.
export function onGameComplete(profile, gameId, score, now = new Date()) {
  return update(profile, (r) => {
    const g = r.games[gameId] || { best: 0, plays: 0 };
    const prevBest = g.best;
    r.games = { ...r.games, [gameId]: { best: Math.max(prevBest, score), plays: g.plays + 1 } };
    const stickers = activityRewards(r, now);
    return { best: Math.max(prevBest, score), prevBest, record: score > prevBest && score > 0, stickers };
  });
}

export const gameBest = (profile, gameId) => (getRewards(profile).games[gameId] || { best: 0 }).best;
export const earnedCount = (profile) => Object.keys(getRewards(profile).stickers).length;
export const unseenStickers = (profile) => getRewards(profile).unseen;
export const markStickersSeen = (profile, ns) => update(profile, (r) => void (r.unseen = r.unseen.filter((n) => !ns.includes(n))));
export const streakDays = (profile, now = new Date()) => currentStreak(getRewards(profile).streak, localDay(now));
export const getStarsSeen = (profile) => getRewards(profile).starsSeen;
export const setStarsSeen = (profile, n) => update(profile, (r) => void (r.starsSeen = n));
