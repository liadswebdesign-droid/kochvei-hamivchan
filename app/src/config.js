// Single place for app-wide constants.

// The real test: Monday 30.11.2026, 4th lesson (~45 min). Countdown on the map is computed from the device date.
export const TEST_DATE = '2026-11-30';

export const SESSION_SIZE = 8;
export const MAX_REVIEW_PER_SESSION = 3;

// Companions. T5 replaces `emoji` with art: give an entry `img: 'companions/owl.svg'` (path under public/) and the
// <Companion> component renders the image instead of the emoji. Names come from ui.json key `companion.<id>`.
export const companions = [
  { id: 'unicorn', emoji: '🦄', color: '#f6c6e6' },
  { id: 'fox', emoji: '🦊', color: '#ffd2a8' },
  { id: 'owl', emoji: '🦉', color: '#d9c9f2' },
  { id: 'dragon', emoji: '🐲', color: '#bfe8c8' },
  { id: 'rocket', emoji: '🚀', color: '#c4defa' },
  { id: 'dolphin', emoji: '🐬', color: '#bfeaf0' },
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
