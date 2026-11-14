import { companionId } from '../config.js';

// Tiny localStorage wrapper. Every read/write is guarded: private mode, quota, or blocked storage must never crash
// the app (it then simply runs without persistence). Names stay on this device only.
const NS = 'kh:';
const mem = new Map(); // fallback when localStorage throws

function rawGet(key) {
  try {
    const v = window.localStorage.getItem(NS + key);
    return v === null ? (mem.has(key) ? mem.get(key) : null) : v;
  } catch {
    return mem.has(key) ? mem.get(key) : null;
  }
}
function rawSet(key, value) {
  mem.set(key, value);
  try {
    window.localStorage.setItem(NS + key, value);
  } catch {
    /* keep in memory only */
  }
}
function rawDel(key) {
  mem.delete(key);
  try {
    window.localStorage.removeItem(NS + key);
  } catch {
    /* ignore */
  }
}

export function load(key, fallback) {
  const v = rawGet(key);
  if (v == null) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  rawSet(key, JSON.stringify(value));
}
export function remove(key) {
  rawDel(key);
}

// ---- profiles --------------------------------------------------------------
// kh:profiles = [{ id, name, companion, created }]   kh:active = id
// Old companion ids (dragon, rocket) map to the art companions on read (T5).
export const getProfiles = () => load('profiles', []).map((p) => ({ ...p, companion: companionId(p.companion) }));
export const getActiveId = () => load('active', null);
export const setActiveId = (id) => save('active', id);

export function createProfile(name, companion) {
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const profiles = getProfiles();
  profiles.push({ id, name: name.trim().slice(0, 24), companion, created: Date.now() });
  save('profiles', profiles);
  setActiveId(id);
  return id;
}

// ---- per-profile data --------------------------------------------------------
// kh:p:<id>:progress = { stars, skills: { <skill>: { level, best, sessions } } }
// kh:p:<id>:review   = [{ id, skill, due, box }]      due = that skill's session counter value
// kh:p:<id>:log      = [{ t, skill, id, correct, tries, ms }]   (for the parent screen, T6)
const pk = (pid, k) => `p:${pid}:${k}`;

export const emptyProgress = () => ({ stars: 0, skills: {} });
export const getProgress = (pid) => ({ ...emptyProgress(), ...load(pk(pid, 'progress'), {}) });
export const saveProgress = (pid, p) => save(pk(pid, 'progress'), p);
export const skillState = (progress, skill) => progress.skills[skill] || { level: 1, best: 0, sessions: 0 };

export const getReview = (pid) => load(pk(pid, 'review'), []);
export const saveReview = (pid, q) => save(pk(pid, 'review'), q);

const LOG_MAX = 5000;
export function logAttempt(pid, entry) {
  const log = load(pk(pid, 'log'), []);
  log.push({ t: Date.now(), ...entry });
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  save(pk(pid, 'log'), log);
}
export const getLog = (pid) => load(pk(pid, 'log'), []);

// ---- per-profile settings (T5 reads; T6's parent screen writes) ---------------------------------------------------
// kh:p:<id>:settings = { sound: true }   Missing keys fall back to the defaults.
export const defaultSettings = () => ({ sound: true });
export const getSettings = (pid) => ({ ...defaultSettings(), ...load(pk(pid, 'settings'), {}) });
export const saveSettings = (pid, s) => save(pk(pid, 'settings'), { ...getSettings(pid), ...s });
export const isSoundOn = (pid) => getSettings(pid).sound !== false;

// ---- rewards blob (T5, shape owned by lib/rewards.js) ---------------------------------------------------------------
export const getRewardsRaw = (pid) => load(pk(pid, 'rewards'), null);
export const saveRewardsRaw = (pid, r) => save(pk(pid, 'rewards'), r);
