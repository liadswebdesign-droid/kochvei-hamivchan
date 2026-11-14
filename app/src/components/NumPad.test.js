import { describe, it, expect } from 'vitest';
import { pressDigit } from './NumPad.jsx';
import { daysUntil, msToMidnight } from '../screens/MapScreen.jsx';

const type = (digits, maxLen, keepZeros) => [...digits].reduce((v, d) => pressDigit(v, d, maxLen, keepZeros), '');

describe('number pad', () => {
  it('an answer drops a leading zero (0 then 7 is 7)', () => {
    expect(type('07', 3)).toBe('7');
    expect(type('00', 3)).toBe('0');
    expect(type('105', 3)).toBe('105');
  });
  it('keepZeros types every digit as is, for the PIN (0123 stays 0123)', () => {
    expect(type('0123', 4, true)).toBe('0123');
    expect(type('0000', 4, true)).toBe('0000');
  });
  it('stops at maxLen either way', () => {
    expect(type('12345', 4)).toBe('1234');
    expect(type('01234', 4, true)).toBe('0123');
  });
});

describe('map countdown', () => {
  it('steps by local calendar day, and the next refresh is due at the coming midnight', () => {
    const late = new Date(2026, 10, 28, 23, 59, 30);
    expect(daysUntil('2026-11-30', late)).toBe(2);
    expect(msToMidnight(late)).toBe(30000);
    const after = new Date(late.getTime() + msToMidnight(late) + 1000);
    expect(daysUntil('2026-11-30', after)).toBe(1);
    expect(daysUntil('2026-11-30', new Date(2026, 10, 30, 8))).toBe(0);
  });
});
