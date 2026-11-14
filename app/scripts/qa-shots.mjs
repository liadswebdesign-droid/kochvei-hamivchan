#!/usr/bin/env node
// Dev QA: drives the running dev server in headless Chrome over CDP and saves tablet-size screenshots of every main
// screen in both orientations, plus layout checks (horizontal overflow, RTL option order, LTR math order).
//   node scripts/qa-shots.mjs <outDir> [baseUrl=http://localhost:5173/] [orient=both|land|port]
// Needs Google Chrome and the dev server (`npm run dev`), because it reads the dev-only window.__khItem hook.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'qa-shots');
const BASE = process.argv[3] || 'http://localhost:5173/';
const ORIENT = process.argv[4] || 'both';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-qa-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--hide-scrollbars', 'about:blank']);
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
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
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
const report = [];
async function shot(name, W, H) {
  await wait(900);
  const checks = await js(`
    const vw = innerWidth;
    const over = document.documentElement.scrollWidth > vw + 1;
    const offenders = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.confetti,.waves,.sky-deco'); }).slice(0, 5).map(el => el.className || el.tagName);
    // RTL: option א must be right of ב when they sit on one row; math tokens must run left→right in DOM order
    const ch = [...document.querySelectorAll('.choice')].map(e => e.getBoundingClientRect());
    const rowOrder = ch.length >= 2 && Math.abs(ch[0].top - ch[1].top) < 4 ? (ch[0].left > ch[1].left ? 'א-right OK' : 'WRONG') : (ch.length ? 'list: label side ' + (document.querySelector('.choice-label').getBoundingClientRect().left > document.querySelector('.choice-text').getBoundingClientRect().left ? 'right OK' : 'WRONG') : '-');
    const maths = [...document.querySelectorAll('.math')].map(m => { const xs = [...m.children].map(c => c.getBoundingClientRect().left); return xs.every((x, i) => i === 0 || x > xs[i-1]) ? 'LTR OK' : 'WRONG'; });
    const text = [...document.querySelectorAll('.math')].map(m => m.innerText.replace(/\\s+/g, ' ')).join(' | ');
    return { over, offenders, rowOrder, maths, text, docW: document.documentElement.scrollWidth, vw };
  `);
  const file = path.join(OUT, `${name}-${W}x${H}.png`);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  report.push({ shot: path.basename(file), ...checks });
  console.log(path.basename(file), JSON.stringify(checks));
}
const click = (sel, i = 0) => js(`const el = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click();`);
const clickText = (sel, text) => js(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('no ' + ${JSON.stringify(text)}); el.click();`);
const item = () => js(`const it = window.__khItem; return it && { id: it.id, kind: it.kind, answer: it.answer, example: it.example, bound: it.bound, type: it.type, skill: it.skill, riddle: !!it.riddle, digit: !!it.digit, expr: it.expr && it.expr.map(t => t && t.blank ? '_' : t).join(' '), passage: !!it.passage, lineRef: it.lineRef };`);

async function typeDigits(n) {
  for (const d of String(n)) {
    await js(`[...document.querySelectorAll('.numpad .key')].find(k => k.textContent.trim() === '${d}').click();`);
    await wait(60);
  }
}
async function answer(correct = true) {
  const it = await item();
  if (it.kind === 'mc') await js(`const cs = [...document.querySelectorAll('.choice')]; const i = ${correct ? it.answer : -1}; (i >= 0 ? cs[i] : cs.find((c, k) => k !== ${it.answer} && !c.disabled)).click();`);
  else await typeDigits(correct ? (it.kind === 'inequality' ? it.example : it.answer) : it.kind === 'inequality' ? it.bound : it.answer + 1);
  await wait(80);
  await click('.pfoot .btn');
  await wait(200);
  return it;
}
async function cont() {
  await js(`const b = document.querySelector('.celebrate-card .btn') || document.querySelector('.pfoot .btn'); b && b.click();`);
  await wait(250);
}
async function toMap() {
  await js(`const b = document.querySelector('.ptop .corner-btn') || document.querySelector('.results .btn-ghost'); b && b.click();`);
  await wait(300);
}
const island = (id) => click(`.isl-${id}`).then(() => wait(700));

async function run(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: BASE });
  await wait(1200);
  await js(`localStorage.clear(); location.reload();`).catch(() => {});
  await wait(1500);

  // profile creation
  await js(`const i = document.querySelector('.name-input'); i.value = 'בודקת'; i.dispatchEvent(new Event('input', { bubbles: true }));`);
  await shot('01-create-name', W, H);
  await click('.create-card .btn-primary');
  await click('.comp-card', 5);
  await shot('02-create-companion', W, H);
  await click('.row-btns .btn-primary');
  await shot('03-map', W, H);

  // reading: passage question, then a wrong answer → highlighted lines + hint
  await island('reading');
  await shot('04-passage-question', W, H);
  let it = await item();
  if (!it.lineRef || !it.lineRef.length) {
    await answer(true);
    await cont();
  }
  await answer(false);
  await shot('05-passage-wrong-hint', W, H);
  if (H > W) {
    await click('.passage-toggle');
    await wait(700);
    await shot('05b-passage-portrait-toggle', W, H);
  }
  await toMap();

  // missing number: find a "47 + __ = 62" style item and an inequality
  await island('missing');
  let gotMissing = false, gotIneq = false;
  for (let k = 0; k < 8 && !(gotMissing && gotIneq); k++) {
    it = await item();
    if (it.kind === 'numeric' && !gotMissing) {
      await typeDigits(it.answer);
      await shot('06-numpad-missing', W, H);
      await click('.pfoot .btn');
      await wait(200);
      await cont();
      gotMissing = true;
      continue;
    } else if (it.kind === 'inequality' && !gotIneq) {
      await shot('07-inequality', W, H);
      await typeDigits(it.example);
      await click('.pfoot .btn');
      await shot('07b-inequality-correct', W, H);
      await cont();
      gotIneq = true;
      continue;
    }
    await answer(true);
    await cont();
  }
  await toMap();

  // riddles: a picture riddle and a shape-digit riddle
  await island('riddles');
  let gotPic = false, gotDigit = false;
  for (let k = 0; k < 8 && !(gotPic && gotDigit); k++) {
    it = await item();
    if (it.riddle && !gotPic) {
      await shot('08-picture-riddle', W, H);
      await answer(false);
      await answer(false);
      await shot('08b-picture-riddle-explain', W, H);
      await cont();
      gotPic = true;
      continue;
    }
    if (it.digit && !gotDigit) {
      await shot('09-digit-riddle', W, H);
      gotDigit = true;
    }
    await answer(true);
    await cont();
  }
  await toMap();

  // word problem with a hint after a wrong answer
  await island('wordProblems');
  await answer(false);
  await shot('10-word-problem-hint', W, H);
  await toMap();

  // bonus: one of each type the bank has (series renders RTL chips, analogy a large line, sentence a blank)
  if (await js(`return !document.querySelector('.isl-bonus').disabled`)) {
    await island('bonus');
    const seen = new Set();
    for (let k = 0; k < 8 && seen.size < 4; k++) {
      it = await item();
      if (it.type && !seen.has(it.type)) {
        seen.add(it.type);
        await shot('13-bonus-' + it.type, W, H);
      }
      await answer(true);
      await cont();
    }
    await toMap();
  }

  // a full exercises session, all correct → results with 3 stars
  await island('exercises');
  for (let k = 0; k < 12; k++) {
    if (!(await js(`return !!document.querySelector('.practice')`))) break;
    await answer(true);
    await cont();
  }
  await shot('11-results', W, H);
  await click('.results .btn-ghost');
  await shot('12-map-after', W, H);
}

try {
  if (ORIENT !== 'port') await run(1280, 800);
  if (ORIENT !== 'land') await run(800, 1280);
} catch (e) {
  console.error('QA script error:', e.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  ws.close();
  chrome.kill();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
