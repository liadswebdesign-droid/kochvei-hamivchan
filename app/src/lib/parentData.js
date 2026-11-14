// Parent-screen data: PIN, settings, and the two destructive actions. Device-local; no server.
//   kh:pin       = hash of the 4-digit PIN
//   kh:settings  = { timeMode: 'timed' | 'free', sound: bool, dailyGoal: n }
import { load, save, remove, getProfiles, getActiveId, setActiveId } from './storage.js';

export const DEFAULT_SETTINGS = { timeMode: 'timed', sound: true, dailyGoal: 3 };
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...load('settings', {}) });
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  save('settings', s);
  return s;
}

// A 4-digit PIN is a lock against a seven-year-old, not a vault: a salted hash keeps it from sitting in plain sight.
export function hashPin(pin) {
  let h = 2166136261;
  for (const ch of 'kh-pin:' + pin) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return String(h);
}
export const hasPin = () => load('pin', null) != null;
export const setPin = (pin) => save('pin', hashPin(pin));
export const checkPin = (pin) => load('pin', null) === hashPin(pin);

// "I forgot": an arithmetic gate a grade-2 child cannot do (tables 6–9).
export function makeGate(random = Math.random) {
  const a = 6 + Math.floor(random() * 4);
  let b = 6 + Math.floor(random() * 4);
  if (b === a) b = a === 9 ? 6 : a + 1;
  return { a, b, answer: a * b };
}

const PROFILE_KEYS = ['progress', 'review', 'log', 'sims', 'simrun'];
export function resetProfileData(pid) {
  for (const k of PROFILE_KEYS) remove(`p:${pid}:${k}`);
}
export function deleteProfile(pid) {
  resetProfileData(pid);
  const left = getProfiles().filter((p) => p.id !== pid);
  save('profiles', left);
  if (getActiveId() === pid) setActiveId(left.length ? left[0].id : null);
}
