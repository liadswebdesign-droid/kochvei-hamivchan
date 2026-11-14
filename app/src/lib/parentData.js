// Parent-screen data: PIN and the two destructive actions. Device-local; no server.
//   kh:pin       = hash of the 4-digit PIN
//   kh:pin-lock  = { fails, until, last }   wrong answers (PIN and "forgot" question share it) and the lockout
// Settings (sound, default time mode, daily goal) are per profile: getSettings/saveSettings in storage.js.
import { load, save, remove, getProfiles, getActiveId, setActiveId } from './storage.js';

// A 4-digit PIN is a lock against a seven-year-old, not a vault: a salted hash keeps it from sitting in plain sight.
export function hashPin(pin) {
  let h = 2166136261;
  for (const ch of 'kh-pin:' + pin) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return String(h);
}
export const hasPin = () => load('pin', null) != null;
export const setPin = (pin) => save('pin', hashPin(pin));

// Lockout: every third wrong answer in a row locks both the PIN and the "forgot" question, for longer each time
// (30 s, 2 min, then 10 min per round). Stored, so a reload does not reset it; a day without wrong answers does.
// A clock moved back past the last wrong answer opens the lock (the count stays), so a parent is never stuck.
const FREE_TRIES = 3;
const LOCK_STEPS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000];
const LOCK_FORGET = 24 * 60 * 60 * 1000;
export const lockAfter = (fails) => (fails > 0 && fails % FREE_TRIES === 0 ? LOCK_STEPS[Math.min(fails / FREE_TRIES, LOCK_STEPS.length) - 1] : 0);
function lockState(now) {
  const s = load('pin-lock', null);
  const ok = s && typeof s === 'object' && Number.isFinite(s.fails) && Number.isFinite(s.until) && Number.isFinite(s.last);
  return ok && now - s.last < LOCK_FORGET ? s : { fails: 0, until: 0, last: 0 };
}
// Milliseconds until the gate opens again (0 = open).
export function lockedFor(now = Date.now()) {
  const s = lockState(now);
  return now < s.last ? 0 : Math.max(0, s.until - now);
}
function recordFail(now) {
  const fails = lockState(now).fails + 1;
  const lock = lockAfter(fails);
  save('pin-lock', { fails, until: lock ? now + lock : 0, last: now });
}
const clearFails = () => remove('pin-lock');
// Both checks refuse while locked (without counting), count a wrong answer and clear the count on a right one.
function attempt(right, now) {
  if (lockedFor(now) > 0) return false;
  if (right) clearFails();
  else recordFail(now);
  return right;
}
export const checkPin = (pin, now = Date.now()) => attempt(load('pin', null) === hashPin(pin), now);

// "I forgot": two-digit × two-digit, easy for an adult with a calculator or paper, out of reach for a grade-2 child who
// practises times tables in this very app. Round tens (20) are left out: 20 × 14 is too easy to guess. A new question
// after every wrong answer, so trying numbers one by one gets nowhere. Answers are 169..841, always three digits.
const GATE_NUMS = Array.from({ length: 17 }, (_, i) => 13 + i).filter((n) => n % 10);
export function makeGate(random = Math.random) {
  const pick = () => GATE_NUMS[Math.min(GATE_NUMS.length - 1, Math.floor(random() * GATE_NUMS.length))];
  const a = pick();
  const b = pick();
  return { a, b, answer: a * b };
}
export const checkGate = (gate, answer, now = Date.now()) => attempt(Number(answer) === gate.answer, now);

// Reset = everything earned or answered (stars, stickers, streak, results, mistakes). The parent's settings stay.
const PROFILE_KEYS = ['progress', 'review', 'log', 'sims', 'simrun', 'rewards'];
export function resetProfileData(pid) {
  for (const k of PROFILE_KEYS) remove(`p:${pid}:${k}`);
}
export function deleteProfile(pid) {
  resetProfileData(pid);
  remove(`p:${pid}:settings`);
  const left = getProfiles().filter((p) => p.id !== pid);
  save('profiles', left);
  if (getActiveId() === pid) setActiveId(left.length ? left[0].id : null);
}
