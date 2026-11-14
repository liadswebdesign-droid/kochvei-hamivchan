import { exercise, missing, inequality } from './arithmetic.js';
import { pictureRiddle, digitRiddle } from './riddles.js';

export const GENERATORS = { ex: exercise, mn: missing, iq: inequality, pr: pictureRiddle, dr: digitRiddle };

// Regenerate an item from its id (used by the review queue). Returns null for non-generated ids.
export function itemFromId(id) {
  const m = /^g:(\w+):(\d):(\d+)$/.exec(id);
  if (!m || !GENERATORS[m[1]]) return null;
  return GENERATORS[m[1]](Number(m[2]), Number(m[3]));
}

export { exercise, missing, inequality, pictureRiddle, digitRiddle };
export { checkInequality } from './arithmetic.js';
export { solveRiddle, solveDigit, ICONS, SHAPES } from './riddles.js';
