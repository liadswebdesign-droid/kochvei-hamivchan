// Single place for app-wide constants.

// The real test: Monday 30.11.2026, 4th lesson (~45 min). Countdown on the map is computed from the device date.
export const TEST_DATE = '2026-11-30';

export const SESSION_SIZE = 8;
export const MAX_REVIEW_PER_SESSION = 3;

// ---- T5: companions (art in public/art/companions, made by tools/art/convert.py) ------------------------------------
// `img` = idle pose, `cheer` = success pose (both 512px, full figure), `face` = 160px head crop for small chips.
// Names come from ui.json key `companion.<id>`.
const art = (id) => ({ id, img: `art/companions/${id}-idle.webp`, cheer: `art/companions/${id}-cheer.webp`, face: `art/companions/${id}-face.webp` });
export const companions = [
  { ...art('fox'), color: '#ffd9b8' },
  { ...art('bunny'), color: '#f3dff5' },
  { ...art('unicorn'), color: '#fbd3ea' },
  { ...art('owl'), color: '#e6d8c6' },
  { ...art('panda'), color: '#d8efd4' },
  { ...art('kitten-astronaut'), color: '#cfe3fa' },
  { ...art('baby-dragon'), color: '#cdeccf' },
  { ...art('dolphin'), color: '#c9edf3' },
];
// Profiles saved before the art stored these ids (T1 emoji placeholders).
export const COMPANION_ALIASES = { dragon: 'baby-dragon', rocket: 'kitten-astronaut' };
export const companionId = (id) => COMPANION_ALIASES[id] || id;

// ---- T5: sticker album + mini-games ---------------------------------------------------------------------------------
export const STICKER_COUNT = 24; // public/art/stickers/sticker-01..24.webp
export const STREAK_MILESTONES = [2, 4, 6, 8, 10];
export const STICKER_EVERY_SESSIONS = 5;
// skill = the practice skill a game trains (the attempt log tags every game attempt with `game` and this skill).
export const games = [
  { id: 'race', skill: 'exercises', seconds: 75, color: '#7fd18b', deep: '#3f9a52' },
  { id: 'catch', skill: 'missing', seconds: 75, color: '#6cc3f0', deep: '#2f86c0' },
  { id: 'detective', skill: 'reading', seconds: 90, color: '#ffb84d', deep: '#d9822b' },
  { id: 'builder', skill: 'riddles', seconds: 90, color: '#b49af0', deep: '#7a5cc9' },
];

// Islands on the map. `skill` keys the per-profile progress. Layout lives in CSS (.isl-<id>).
export const islands = [
  { id: 'reading', titleKey: 'island.reading', instrKey: 'instr.reading', color: '#ffb84d', deep: '#d9822b', icon: 'book' },
  { id: 'exercises', titleKey: 'island.exercises', instrKey: 'instr.exercises', color: '#7fd18b', deep: '#3f9a52', icon: 'plus' },
  { id: 'missing', titleKey: 'island.missing', instrKey: 'instr.missing', color: '#6cc3f0', deep: '#2f86c0', icon: 'blank' },
  { id: 'wordProblems', titleKey: 'island.wordProblems', instrKey: 'instr.wordProblems', color: '#f58fb4', deep: '#c94f7f', icon: 'bubble' },
  { id: 'riddles', titleKey: 'island.riddles', instrKey: 'instr.riddles', color: '#b49af0', deep: '#7a5cc9', icon: 'shapes' },
  { id: 'bonus', titleKey: 'island.bonus', color: '#ffd84d', deep: '#c9a21f', icon: 'gift' },
  { id: 'mock', titleKey: 'island.mock', locked: true, color: '#c9c2b6', deep: '#8f877a', icon: 'flag' },
];
