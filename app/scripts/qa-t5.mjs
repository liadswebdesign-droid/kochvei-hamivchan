#!/usr/bin/env node
// Dev QA for T5 (companions, album, celebrations, mini-games): drives the dev server in headless Chrome over CDP and
// saves tablet screenshots in both orientations, with a horizontal-overflow check on every shot.
//   node scripts/qa-t5.mjs <outDir> [baseUrl=http://localhost:5173/] [orient=both|land|port]
// Needs the DEV server (reads the dev-only window.__khItem / window.__khGame hooks).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'qa-t5');
const BASE = process.argv[3] || 'http://localhost:5173/';
const ORIENT = process.argv[4] || 'both';
const REDUCED = process.argv[5] === 'reduced'; // emulate prefers-reduced-motion: reduce
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-qa5-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) res(m[1]);
  });
  setTimeout(() => rej(new Error('chrome did not start')), 15000);
});
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
await send('Runtime.enable');

const report = [];
async function shot(name, W, H, settle = 700) {
  await wait(settle);
  const checks = await js(`
    const vw = innerWidth;
    const over = document.documentElement.scrollWidth > vw + 1;
    const offenders = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.confetti,.waves,.sky-deco,.catch-field,.flystar'); }).slice(0, 5).map(el => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    const vOver = document.documentElement.scrollHeight > innerHeight + 1;
    return { over, offenders, vScroll: vOver, dir: document.documentElement.dir };
  `);
  const file = path.join(OUT, `${name}-${W}x${H}${REDUCED ? '-reduced' : ''}.png`);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  report.push({ shot: path.basename(file), ...checks });
  console.log(path.basename(file), JSON.stringify(checks));
}
const click = (sel, i = 0) => js(`const el = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click();`);
const item = () => js(`const it = window.__khItem; return it && { kind: it.kind, answer: it.answer, example: it.example };`);
const game = () => js(`return window.__khGame ? { ...window.__khGame, ok: undefined } : null;`);
async function typeDigits(n) {
  for (const d of String(n)) {
    await js(`[...document.querySelectorAll('.numpad .key')].find(k => k.textContent.trim() === '${d}').click();`);
    await wait(70);
  }
}
async function answerRight() {
  const it = await item();
  if (it.kind === 'mc') await js(`document.querySelectorAll('.choice')[${it.answer}].click();`);
  else await typeDigits(it.kind === 'inequality' ? it.example : it.answer);
  await wait(80);
  await click('.pfoot .btn');
  await wait(250);
}
const cont = async () => {
  await js(`const b = document.querySelector('.celebrate-card .btn') || document.querySelector('.pfoot .btn'); b && b.click();`);
  await wait(250);
};

async function run(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (REDUCED) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: BASE });
  await wait(1200);
  await js(`localStorage.clear(); location.reload();`).catch(() => {});
  await wait(1500);

  // 1. companion pick
  await js(`const i = document.querySelector('.name-input'); i.value = 'בודקת'; i.dispatchEvent(new Event('input', { bubbles: true }));`);
  await click('.create-card .btn-primary');
  await click('.comp-card', 2);
  await shot('t5-01-companion-pick', W, H);
  await click('.row-btns .btn-primary');
  await shot('t5-02-map-companion', W, H);

  // 2. a practice success (cheer pose) then a full 3-star session → results with confetti → sticker reward
  await click('.isl-exercises');
  await wait(700);
  await answerRight();
  await shot('t5-03-practice-cheer', W, H, 500);
  await cont();
  for (let k = 0; k < 12; k++) {
    if (!(await js(`return !!document.querySelector('.practice')`))) break;
    await answerRight();
    await cont();
  }
  await shot('t5-04-results-confetti', W, H, 450);
  await wait(1500);
  await shot('t5-05-sticker-reward', W, H, 1300);
  await click('.sticker-card .btn-primary');

  // 3. map: stars fly into the counter, album badge
  await click('.results .row-btns .btn-ghost');
  await shot('t5-06-map-stars-fly', W, H, 520);
  await wait(1800);
  await shot('t5-07-map-after', W, H, 200);

  // 4. album with 3 stickers (two more seeded, the last one still "unseen" so it peels in)
  await js(`
    const pid = JSON.parse(localStorage.getItem('kh:active'));
    const k = 'kh:p:' + pid + ':rewards';
    const r = JSON.parse(localStorage.getItem(k));
    r.stickers[2] = { reason: 'five-sessions', t: Date.now() };
    r.stickers[3] = { reason: 'streak', days: 2, t: Date.now() };
    r.unseen = [3];
    r.streak = { last: r.streak.last, days: 2, hit: [2] };
    localStorage.setItem(k, JSON.stringify(r));
  `);
  await click('.chip-album');
  await shot('t5-08-album-peeling', W, H, 780);
  await shot('t5-09-album-3-stickers', W, H, 1600);
  await click('.album-top .corner-btn');
  await wait(400);

  // 5. games
  await click('.games-corner');
  await shot('t5-10-games-hub', W, H);

  // race: two right answers, then mid-typing
  await click('.gt-race');
  await shot('t5-11-race-intro', W, H, 500);
  await click('.game-card .btn-primary');
  await wait(400);
  for (let k = 0; k < 3; k++) {
    await typeDigits((await game()).answer);
    await wait(500);
  }
  const a = String((await game()).answer);
  if (a.length > 1) await typeDigits(a[0]);
  await shot('t5-12-race-play', W, H, 300);
  await click('.game-hud .corner-btn');
  await wait(400);

  // catch: wait for bubbles, tap a right one, then shoot mid-fall
  await click('.gt-catch');
  await click('.game-card .btn-primary');
  await wait(4200);
  await js(`const ok = window.__khGame.ok; const b = [...document.querySelectorAll('.bubble-n')].find(b => { const r = b.getBoundingClientRect(); const f = document.querySelector('.catch-field').getBoundingClientRect(); return ok(Number(b.textContent)) && r.top > f.top && r.bottom < f.bottom; }); b && b.click();`);
  await wait(3200);
  await shot('t5-13-catch-play', W, H, 100);
  await click('.game-hud .corner-btn');
  await wait(400);

  // detective: one wrong tap, one right tap
  await click('.gt-detective');
  await click('.game-card .btn-primary');
  await wait(1200);
  let line = (await game()).line;
  await js(`document.querySelector('[data-line="${line === 1 ? 2 : 1}"] .pline-text').click();`);
  await wait(200);
  await js(`document.querySelector('[data-line="${line}"] .pline-text').click();`);
  await shot('t5-14-detective-found', W, H, 250);
  await wait(900);
  await shot('t5-15-detective-play', W, H, 300);
  await click('.game-hud .corner-btn');
  await wait(400);

  // builder: tap-add two pictures (the non-drag path), drag one with pointer events, check a wrong sum
  await click('.gt-builder');
  await click('.game-card .btn-primary');
  await wait(600);
  await click('.builder-pick', 0);
  await wait(150);
  await click('.builder-pick', 1);
  await wait(150);
  await js(`
    const b = document.querySelectorAll('.builder-pick')[2]; const r = b.getBoundingClientRect(); const row = document.querySelector('.builder-row').getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, pointerId: 8, clientX: x, clientY: y, isPrimary: true });
    b.dispatchEvent(new PointerEvent('pointerdown', o(r.left + 40, r.top + 40)));
    for (let i = 1; i <= 6; i++) b.dispatchEvent(new PointerEvent('pointermove', o(r.left + 40 + (row.left + row.width / 2 - r.left - 40) * i / 6, r.top + 40 + (row.top + row.height / 2 - r.top - 40) * i / 6)));
    window.__dragDone = () => b.dispatchEvent(new PointerEvent('pointerup', o(row.left + row.width / 2, row.top + row.height / 2)));
  `);
  await shot('t5-16-builder-dragging', W, H, 150);
  await js(`window.__dragDone();`);
  await wait(200);
  await shot('t5-17-builder-play', W, H, 300);
  await click('.game-hud .corner-btn');
  await wait(400);

  // a short race to the game-over card (dev-only seconds override)
  await js(`window.__khGameSeconds = 4;`);
  await click('.gt-race');
  await click('.game-card .btn-primary');
  await wait(500);
  await typeDigits((await game()).answer);
  await wait(4200);
  await shot('t5-18-game-over-record', W, H, 600);
  await js(`window.__khGameSeconds = 0;`);
}

try {
  if (ORIENT !== 'port') await run(1280, 800);
  if (ORIENT !== 'land') await run(800, 1280);
} catch (e) {
  console.error('QA script error:', e.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ shots: report, consoleErrors }, null, 1));
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 10));
  ws.close();
  chrome.kill();
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
  } catch {}
}
