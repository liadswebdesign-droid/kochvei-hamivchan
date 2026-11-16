// Strict request validation. Anything that is not exactly the expected shape is refused (the caller answers 400).

export const MAX_BODY = 1024; // bytes
export const DEVICE_ID = /^[A-Z2-7]{16}$/; // RFC 4648 base32, 80 random bits
const BUILD_ID = /^[A-Za-z0-9._-]{1,40}$/;
const PING_KEYS = ['d', 'ev', 'min', 'v', 'p', 'standalone'];
export const LABEL_MAX = 40;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const sameKeys = (o, keys) => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => Object.prototype.hasOwnProperty.call(o, x));
};

// Raw body bytes → parsed JSON object, or null. Refuses bodies over MAX_BODY and invalid UTF-8.
export function parseJsonBody(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0 || buf.byteLength > MAX_BODY) return null;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
  try {
    const v = JSON.parse(text);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

// → { d, ev, min, v, p, standalone } or null
export function parsePing(o) {
  if (!isObj(o) || !sameKeys(o, PING_KEYS)) return null;
  const { d, ev, min, v, p, standalone } = o;
  if (typeof d !== 'string' || !DEVICE_ID.test(d)) return null;
  if (ev !== 'open' && ev !== 'beat') return null;
  if (!intIn(min, 0, 10)) return null;
  if (typeof v !== 'string' || !BUILD_ID.test(v)) return null;
  if (!intIn(p, 0, 10)) return null;
  if (typeof standalone !== 'boolean') return null;
  return { d, ev, min, v, p, standalone };
}

// { d, label } → { d, label: string | null } or null. An empty label clears it. Control and bidi-override characters
// are refused; the dashboard renders labels as text only.
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩﻿]/;
export function parseLabel(o) {
  if (!isObj(o) || !sameKeys(o, ['d', 'label'])) return null;
  const { d, label } = o;
  if (typeof d !== 'string' || !DEVICE_ID.test(d)) return null;
  if (label === null) return { d, label: null };
  if (typeof label !== 'string' || BAD_CHARS.test(label)) return null;
  const s = label.trim().replace(/\s+/g, ' ');
  if ([...s].length > LABEL_MAX) return null;
  return { d, label: s || null };
}
