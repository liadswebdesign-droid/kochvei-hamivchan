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
// Shape guards. Unparseable JSON already falls back above; these catch VALID JSON of the wrong shape (a hand-edited or
// half-migrated key), which would otherwise crash the app on every start.
export const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
// A stored list: not a list → []; entries that are not objects are dropped.
export function loadList(key) {
  const v = load(key, null);
  return Array.isArray(v) ? v.filter(isPlainObject) : [];
}
// A stored object: not an object → null.
export function loadObject(key) {
  const v = load(key, null);
  return isPlainObject(v) ? v : null;
}
// `defaults` overlaid with the stored fields whose kind (object / array / number / string / boolean) matches the
// default's; a field the default leaves null, or does not know, takes any stored value.
const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
export function withDefaults(defaults, raw) {
  const out = { ...defaults };
  if (!isPlainObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (!(k in defaults) || defaults[k] === null || kindOf(v) === kindOf(defaults[k])) out[k] = v;
  return out;
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
export const getProfiles = () =>
  loadList('profiles')
    .filter((p) => typeof p.id === 'string')
    .map((p) => ({ ...p, name: typeof p.name === 'string' ? p.name : '', companion: companionId(p.companion) }));
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
export const getProgress = (pid) => withDefaults(emptyProgress(), load(pk(pid, 'progress'), null));
export const saveProgress = (pid, p) => save(pk(pid, 'progress'), p);
export const skillState = (progress, skill) => withDefaults({ level: 1, best: 0, sessions: 0 }, progress.skills[skill]);

export const getReview = (pid) => loadList(pk(pid, 'review'));
export const saveReview = (pid, q) => save(pk(pid, 'review'), q);

const LOG_MAX = 5000;
export function logAttempt(pid, entry) {
  const log = getLog(pid);
  log.push({ t: Date.now(), ...entry });
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  save(pk(pid, 'log'), log);
}
export const getLog = (pid) => loadList(pk(pid, 'log'));

// ---- per-profile settings: the ONE settings store (sounds read it, the parent screen writes it) ---------------------
// kh:p:<id>:settings = { sound: bool, timeMode: 'timed' | 'free', dailyGoal: n }   Missing keys fall back to defaults.
//   sound     soft sounds on/off (lib/sound.js)
//   timeMode  default mode offered on the mock-exam start screen
//   dailyGoal sessions per day, shown on the parent dashboard
export const defaultSettings = () => ({ sound: true, timeMode: 'timed', dailyGoal: 3 });

// The first parent-screen build kept ONE device-wide blob at kh:settings. On first read it seeds the own settings of
// every profile that has none yet, and is then removed, so a device that already chose "sound off" keeps it.
function migrateLegacySettings() {
  const legacy = load('settings', null);
  if (legacy == null) return;
  if (isPlainObject(legacy)) {
    for (const p of loadList('profiles')) if (p.id && load(pk(p.id, 'settings'), null) == null) save(pk(p.id, 'settings'), { ...legacy });
  }
  remove('settings');
}
export function getSettings(pid) {
  migrateLegacySettings();
  return withDefaults(defaultSettings(), load(pk(pid, 'settings'), null));
}
export function saveSettings(pid, patch) {
  const s = { ...getSettings(pid), ...patch };
  save(pk(pid, 'settings'), s);
  return s;
}
export const isSoundOn = (pid) => getSettings(pid).sound !== false;

// ---- rewards blob (T5, shape owned by lib/rewards.js) ---------------------------------------------------------------
export const getRewardsRaw = (pid) => loadObject(pk(pid, 'rewards'));
export const saveRewardsRaw = (pid, r) => save(pk(pid, 'rewards'), r);
