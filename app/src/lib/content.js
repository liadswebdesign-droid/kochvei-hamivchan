import { stripBold } from './rich.js';

// Loads the vocalized content from public/content/ (copied from content/build by `npm run content`).
const BASE = import.meta.env.BASE_URL + 'content/';

let ui = {};
const cache = new Map();

async function getJSON(path, optional = false) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(BASE + path);
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`content ${path}: ${res.status}`);
  }
  const data = await res.json();
  cache.set(path, data);
  return data;
}

export async function loadCore() {
  const [manifest, uiData, passages, wordProblems] = await Promise.all([
    getJSON('manifest.json'),
    getJSON('ui.json'),
    getJSON('passages/index.json'),
    getJSON('word-problems.json'),
  ]);
  ui = uiData;
  const has = (f) => manifest.optional.includes(f);
  const [pictureRiddles, ...bonus] = await Promise.all([
    has('picture-riddles.json') ? getJSON('picture-riddles.json') : [],
    ...['analogies', 'series', 'shape-series', 'sentences', 'odd-one-out'].map((b) => (has(`bonus/${b}.json`) ? getJSON(`bonus/${b}.json`) : [])),
  ]);
  return { manifest, passages, wordProblems, pictureRiddles, bonus: bonus.flat() };
}

export const loadPassage = (id) => getJSON(`passages/${id}.json`);

// UI text lookup: t('map.stars', { n: 5 }). Every Hebrew string in the app comes through here.
// t() returns plain text: any `**bold**` markers are removed, so it is safe in labels, buttons and aria attributes.
// tx() keeps the markers, for text rendered through <Rich> / <StemText> (instructions, the companion's lines, examples).
export function tx(key, vars) {
  let s = ui[key];
  if (s == null) {
    if (import.meta.env.DEV) console.warn('missing ui key', key);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}
export const t = (key, vars) => stripBold(tx(key, vars));
export const hasKey = (key) => ui[key] != null;
