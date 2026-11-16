// VITE_STATS_URL → its origin, or '' when unset. Used by vite.config.js for the CSP connect-src. https only (http only
// for a localhost check); anything else fails the build rather than shipping a CSP or an endpoint nobody meant.
export function statsOrigin(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`VITE_STATS_URL is not a URL: ${v}`);
  }
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error(`VITE_STATS_URL must be https: ${v}`);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error(`VITE_STATS_URL must be a bare origin: ${v}`);
  return u.origin;
}
