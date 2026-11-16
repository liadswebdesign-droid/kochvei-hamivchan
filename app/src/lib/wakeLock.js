// Keeps the tablet screen on while the app is open and in use (Screen Wake Lock API, Chrome on Android).
// The lock drops by itself when the app is hidden; it is re-taken when the app is visible again. After IDLE_MS
// with no touch it is released, so a tablet left open on a table still goes dark; the next touch takes it again.
// Where the API is missing or the request is refused (battery saver), the screen simply follows the system timeout.

export const IDLE_MS = 10 * 60 * 1000;

export function initWakeLock({ nav = globalThis.navigator, doc = globalThis.document, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!nav || !nav.wakeLock || !doc) return null;
  let sentinel = null;
  let pending = false;
  let idleTimer = null;
  let lastTouch = now();

  const release = () => {
    const s = sentinel;
    sentinel = null;
    if (s) s.release().catch(() => {});
  };

  const take = async () => {
    if (sentinel || pending || doc.visibilityState !== 'visible') return;
    pending = true;
    try {
      const s = await nav.wakeLock.request('screen');
      if (doc.visibilityState !== 'visible' || now() - lastTouch >= IDLE_MS) s.release().catch(() => {});
      else {
        sentinel = s;
        s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
      }
    } catch {
      // refused (battery saver, policy): the system screen timeout applies
    } finally {
      pending = false;
    }
  };

  const armIdle = () => {
    clearTimer(idleTimer);
    idleTimer = setTimer(release, IDLE_MS);
  };

  const onActivity = () => {
    lastTouch = now();
    armIdle();
    take();
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') onActivity();
  };

  doc.addEventListener('pointerdown', onActivity, { passive: true });
  doc.addEventListener('keydown', onActivity);
  doc.addEventListener('visibilitychange', onVisibility);
  onActivity();

  return {
    get held() { return !!sentinel; },
    stop() {
      clearTimer(idleTimer);
      doc.removeEventListener('pointerdown', onActivity);
      doc.removeEventListener('keydown', onActivity);
      doc.removeEventListener('visibilitychange', onVisibility);
      release();
    },
  };
}
