#!/usr/bin/env node
// Dev QA for the test simulation + parent screen (T6). Same approach as qa-shots.mjs: headless Chrome over CDP against
// the running dev server (it reads the dev-only window.__khExam hook), screenshots at tablet size in both
// orientations, plus layout checks (no horizontal overflow, RTL order).
//   node scripts/qa-sim.mjs <outDir> [baseUrl=http://localhost:5173/] [orient=both|land|port]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'qa-sim');
const BASE = process.argv[3] || 'http://localhost:5173/';
const ORIENT = process.argv[4] || 'both';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-qa-sim-'));
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
const problems = [];
async function shot(name, W, H, { full = false } = {}) {
  await wait(full ? 900 : 1000);
  const checks = await js(`
    const vw = innerWidth;
    const docW = document.documentElement.scrollWidth;
    const offenders = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.confetti,.waves,.sky-deco,.ptable-wrap'); }).slice(0, 5).map(el => el.className && el.className.baseVal === undefined ? el.className : el.tagName);
    const prev = document.querySelector('.enav-prev .btn'), next = document.querySelector('.enav-next .btn');
    const navOrder = prev && next ? (next.getBoundingClientRect().left < prev.getBoundingClientRect().left ? 'next-left prev-right OK' : 'WRONG') : '-';
    const opts = [...document.querySelectorAll('.bk-item:first-child .bk-opt')].map(e => e.getBoundingClientRect());
    const optOrder = opts.length >= 2 && Math.abs(opts[0].top - opts[1].top) < 4 ? (opts[0].left > opts[1].left ? 'א-right OK' : 'WRONG') : (opts.length ? 'list' : '-');
    const maths = [...document.querySelectorAll('.math')].map(m => { const xs = [...m.children].map(c => c.getBoundingClientRect().left); return xs.every((x, i) => i === 0 || x > xs[i-1]) ? 'LTR OK' : 'WRONG'; });
    const sheet = document.querySelector('.sheet');
    const sheetFit = sheet ? { sheetBottom: Math.round(sheet.getBoundingClientRect().bottom), vh: innerHeight } : null;
    const circles = document.querySelectorAll('.pencil-circle').length;
    // the yellow preview banner must not cover anything a child can tap
    const bannerCovers = (() => {
      const bn = document.querySelector('.preview-banner');
      if (!bn) return [];
      const b = bn.getBoundingClientRect();
      return [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=radio], [role=tab], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; })
        .slice(0, 5).map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    })();
    return { overflowX: docW > vw + 1, docW, vw, offenders, navOrder, optOrder, maths, circles, sheetFit, bannerCovers };
  `);
  const file = path.join(OUT, `${name}-${W}x${H}.png`);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  const row = { shot: path.basename(file), ...checks };
  report.push(row);
  if (checks.bannerCovers.length || checks.overflowX || checks.navOrder === 'WRONG' || checks.optOrder === 'WRONG' || checks.maths.includes('WRONG') || checks.offenders.length) problems.push(row);
  console.log(path.basename(file), JSON.stringify(checks));
}
const click = (sel, i = 0) => js(`const el = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click();`);
const clickText = (sel, text) => js(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('no ' + ${JSON.stringify(text)}); el.click();`);
const exam = () => js(`const e = window.__khExam; return e && { page: e.page, type: e.sim.pages[e.page].type, task: e.sim.pages[e.page].task || null, items: (e.sim.pages[e.page].items || []).map(i => ({ id: i.id, kind: i.kind, answer: i.answer, example: i.example, bound: i.bound })), pages: e.sim.pages.length };`);
async function typeDigits(n) {
  for (const d of String(n)) {
    await js(`[...document.querySelectorAll('.numpad .key')].find(k => k.textContent.trim() === '${d}').click();`);
    await wait(50);
  }
}
// Answer every item on the current page by clicking in the UI. `right(item, i)` decides correct or wrong.
async function answerPage(right) {
  const ex = await exam();
  for (let i = 0; i < ex.items.length; i++) {
    const it = ex.items[i];
    const ok = right(it, i);
    if (it.kind === 'mc') {
      const idx = ok ? it.answer : (it.answer + 1) % 4;
      await js(`document.querySelectorAll('.bk-item')[${i}].querySelectorAll('.bk-opt')[${idx}].click();`);
    } else {
      await js(`document.querySelectorAll('.bk-item')[${i}].click();`);
      await wait(60);
      await typeDigits(ok ? (it.kind === 'inequality' ? it.example : it.answer) : it.kind === 'inequality' ? it.bound : it.answer + 1);
    }
    await wait(80);
  }
}
const next = () => js(`document.querySelector('.enav-next .btn').click();`).then(() => wait(450));
const prev = () => js(`document.querySelector('.enav-prev .btn').click();`).then(() => wait(450));

async function run(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: BASE });
  await wait(1200);
  await js(`localStorage.clear(); location.reload();`).catch(() => {});
  await wait(1500);

  // profile
  await js(`const i = document.querySelector('.name-input'); i.value = 'בודקת'; i.dispatchEvent(new Event('input', { bubbles: true }));`);
  await click('.create-card .btn-primary');
  await click('.comp-card', 5);
  await click('.row-btns .btn-primary');
  await wait(600);

  // seed a second profile and 14 days of log + two earlier simulations for the parent dashboard
  await js(`
    const ps = JSON.parse(localStorage.getItem('kh:profiles'));
    const pid = ps[0].id;
    const day = 86400000, now = Date.now();
    const skills = [['exercises','g:ex:2:'],['missing','g:mn:2:'],['missing','g:iq:2:'],['wordProblems','wp-0'],['riddles','pr-'],['reading','inf-05-q'],['reading','story-05-q']];
    const log = [];
    for (let d = 13; d >= 0; d--) {
      const n = d % 4 === 3 ? 0 : 6 + (d * 5) % 22;
      for (let k = 0; k < n; k++) {
        const [skill, pre] = skills[(k + d) % skills.length];
        const id = skill === 'reading' ? pre + (1 + (k % 5)) : skill === 'wordProblems' ? pre + String(10 + (k % 40)) : skill === 'riddles' ? pre + String(10 + (k % 30)) : pre + (1000 + k * 17 + d);
        log.push({ t: now - d * day - k * 90000, skill, id, correct: (k * 7 + d * 3) % 10 < (skill === 'reading' ? 6 : 8), tries: 1, ms: 20000 + (k % 5) * 9000 });
      }
    }
    localStorage.setItem('kh:p:' + pid + ':log', JSON.stringify(log));
    const mk = (sim, daysAgo, score, tasks, minutes, mode) => ({ sim, t: now - daysAgo * day, mode, score, max: 24, tasks, ms: minutes * 60000, minutes, over: false });
    localStorage.setItem('kh:p:' + pid + ':sims', JSON.stringify([
      mk('sim-1', 9, 14, { reading: [5,10], A: [2,3], B: [3,5], C: [2,3], D: [2,3] }, 52.4, 'timed'),
      mk('sim-2', 5, 17, { reading: [7,10], A: [3,3], B: [3,5], C: [2,3], D: [2,3] }, 41.1, 'timed'),
      mk('sim-3', 2, 16, { reading: [8,10], A: [3,3], B: [2,5], C: [1,3], D: [2,3] }, 38.7, 'free'),
    ]));
    const ps2 = ps.concat([{ id: 'pOther', name: 'אחותי', companion: 'fox', created: now }]);
    localStorage.setItem('kh:profiles', JSON.stringify(ps2));
    window.__pid = pid;
  `);
  await js(`location.reload();`).catch(() => {});
  await wait(1500);
  await shot('01-map', W, H);

  // ---- island → start screen
  await click('.isl-mock');
  await wait(500);
  await shot('02-sim-start', W, H);
  const land = W > H;
  const hintOn = () => js(`return !!document.querySelector('.rot-hint');`);
  if ((await hintOn()) !== land) problems.push({ shot: '02-sim-start', msg: 'rotate note should show exactly in landscape' });
  // resume: start #2 with no clock, answer one question, quit, come back and continue where she stopped
  await js(`window.__khStopMs = 120000;`);
  await click('.ms-mode', 1);
  await click('.ms-card', 1);
  await wait(600);
  await click('.bk-cover .btn');
  await wait(400);
  await next(); await next();
  await js(`document.querySelectorAll('.bk-item')[0].querySelectorAll('.bk-opt')[3].click();`);
  await wait(300);
  const before = await js(`return { page: window.__khExam.page, answers: Object.keys(window.__khExam.answers).length };`);
  await click('.etop .corner-btn');
  await wait(400);
  await shot('02b-quit-confirm', W, H);
  await clickText('.confirm-card .btn', 'כן');
  await wait(600);
  await shot('02c-sim-resume-banner', W, H);
  await click('.ms-resume .btn-primary');
  await wait(900);
  const after = await js(`return { page: window.__khExam.page, answers: Object.keys(window.__khExam.answers).length, circled: document.querySelectorAll('.pencil-circle').length };`);
  console.log('resume before/after', JSON.stringify(before), JSON.stringify(after));
  if (before.page !== after.page || before.answers !== after.answers || !after.circled) problems.push({ shot: 'resume', msg: 'resume did not restore page/answers' });
  await click('.etop .corner-btn');
  await clickText('.confirm-card .btn', 'כן');
  await wait(500);
  await click('.ms-resume .btn-ghost'); // give it up
  await wait(300);
  await click('.ms-mode', 0);
  // the rotate note: dismissed on the start screen, it stays away inside that mock
  if (land) {
    await click('.rot-close');
    await wait(200);
    if (await hintOn()) problems.push({ shot: 'rotate-note', msg: 'note still shown after dismissing it' });
  }
  await click('.ms-card', 0);
  await wait(900);
  if (await hintOn()) problems.push({ shot: '03-cover', msg: 'rotate note came back in the mock after it was dismissed' });
  await shot('03-cover', W, H);
  await click('.bk-cover .btn');
  await wait(900);
  await shot('04-example-reading', W, H);
  await next();
  await shot('05-passage', W, H);
  await next();
  let ex = await exam();
  // first questions page: circle an answer (wrong on purpose for the first one so the review has something)
  await js(`document.querySelectorAll('.bk-item')[0].querySelectorAll('.bk-opt')[2].click();`);
  await wait(150);
  await js(`document.querySelectorAll('.bk-item')[0].querySelectorAll('.bk-opt')[1].click();`); // the circle moves
  await wait(900);
  await shot('06-reading-circled', W, H);
  // answer the rest of Part 1 (some wrong), clicking through
  let guard = 0;
  while ((await exam()).type !== 'stop' && guard++ < 20) {
    ex = await exam();
    if (ex.type === 'items') await answerPage((it, i) => (it.id.endsWith('q2') || it.id.endsWith('q4') ? false : true));
    await next();
  }
  await shot('07-stop-page', W, H);
  await js(`window.__khExam.setStopOk(true);`);
  await wait(500);
  await shot('08-stop-ready', W, H);
  await click('.bk-stop .btn');
  await wait(500);
  // cannot page back into part 1 now
  const noBack = await js(`return !document.querySelector('.enav-prev .btn');`);
  console.log('no back button after stop page:', noBack);
  if (!noBack) problems.push({ shot: 'no-back-after-stop', msg: 'back button present on first page of part 2' });
  await shot('09-example-A', W, H);
  await next();
  await answerPage(() => true);
  await shot('10-taskA', W, H);
  await next();
  await next(); // example B → B items
  ex = await exam();
  await answerPage((it, i) => i !== 2);
  // leave the third row active and empty, with a partial number typed
  await js(`document.querySelectorAll('.bk-item')[2].click();`);
  await typeDigits(7);
  await shot('11-taskB-written', W, H);
  await next();
  await shot('12-taskB-inequalities', W, H);
  await answerPage((it, i) => i === 0);
  await next();
  await next(); // example C → C
  await answerPage((it, i) => i !== 1);
  await shot('13-taskC', W, H);
  await next();
  // task C has as many pages as the measured paging gives it (landscape: often one word problem per page)
  for (let k = 0; k < 6 && (await exam()).task === 'C' && (await exam()).type === 'items'; k++) {
    await answerPage(() => true);
    await next();
  }
  await next(); // example D → D
  await answerPage(() => true);
  await shot('14-taskD-circled', W, H);
  await next();
  await answerPage((it) => false);
  await next();
  // timer: pretend 46 minutes passed (shows the gentle "time is up, you may finish" note)
  await js(`window.__khExam.setT0(Date.now() - 46 * 60000);`);
  await wait(1300);
  await shot('15-taskD-time-over', W, H);
  await next();
  await shot('16-end', W, H);
  await click('.bk-end .btn');
  await wait(500);
  // a hole: the last item is unanswered → gentle question
  await shot('17-finish-confirm', W, H);
  await js(`const bs = [...document.querySelectorAll('.confirm-card .btn')]; (bs.find(b => b.classList.contains('btn-ghost')) || bs[0]).click();`);
  await wait(900);
  await shot('18-results', W, H);
  // finishing the test earns a sticker (rewards.onMockComplete): the card peels in over the results
  await wait(1200);
  const sticker = await js(`const c = document.querySelector('.sticker-card'); const r = JSON.parse(localStorage.getItem('kh:p:' + JSON.parse(localStorage.getItem('kh:active')) + ':rewards') || 'null'); return { card: !!c, reason: c && c.querySelector('.sticker-reason')?.textContent, stickers: r && Object.values(r.stickers).map((s) => s.reason) };`);
  console.log('mock sticker:', JSON.stringify(sticker));
  if (!sticker.card || !sticker.stickers || !sticker.stickers.includes('mock')) problems.push({ shot: '18b-results-sticker', sticker });
  await shot('18b-results-sticker', W, H);
  await click('.sticker-card .btn-primary');
  await wait(500);
  await clickText('.results .btn', 'טעויות');
  await wait(900);
  await shot('19-review-mc', W, H);
  // walk to a written-answer mistake if there is one
  for (let k = 0; k < 40; k++) {
    const written = await js(`return !!document.querySelector('.rev-card .bk-written');`);
    if (written) break;
    const more = await js(`const b = document.querySelector('.rev-nav .enav-next .btn'); if (!b || b.classList.contains('btn-primary') && !b.querySelector('.flip')) return false; b.click(); return true;`);
    if (!more) break;
    await wait(300);
  }
  await shot('20-review-written', W, H);
  // finish review → start list shows best-score badge
  for (let k = 0; k < 40; k++) {
    const done = await js(`const b = document.querySelector('.rev-nav .enav-next .btn'); if (!b) return true; if (!b.querySelector('.flip')) { b.click(); return true; } b.click(); return false;`);
    await wait(250);
    if (done) break;
  }
  await wait(500);
  await shot('21-sim-start-after', W, H);
  // a finished mock: the next one may suggest turning the tablet again
  if ((await hintOn()) !== land) problems.push({ shot: '21-sim-start-after', msg: 'rotate note should be back (landscape only) after finishing a mock' });
  await click('.ms-resume .btn-ghost').catch(() => {});

  // ---- parent screen
  await js(`document.querySelector('.ptop .corner-btn').click();`);
  await wait(500);
  await click('.parent-btn');
  await wait(600);
  await shot('22-parent-pin-set', W, H);
  const pinKey = (d) => js(`[...document.querySelectorAll('.numpad .key')].find(k => k.textContent.trim() === '${d}').click();`);
  for (const d of '1234') await pinKey(d);
  await wait(500);
  await shot('23-parent-pin-confirm', W, H);
  for (const d of '1234') await pinKey(d);
  await wait(1500);
  await shot('24-parent-dashboard', W, H);
  // sound toggle → the ONE per-profile settings store that lib/sound.js reads (isSoundOn)
  await js(`const row = [...document.querySelectorAll('.sett .prow')][1]; [...row.querySelectorAll('.seg-btn')][1].click();`);
  await wait(300);
  const snd = await js(`const pid = document.querySelector('.ptab.on') && JSON.parse(localStorage.getItem('kh:active')); const s = JSON.parse(localStorage.getItem('kh:p:' + pid + ':settings') || 'null'); return { settings: s, legacy: localStorage.getItem('kh:settings') };`);
  console.log('sound off ->', JSON.stringify(snd));
  if (!snd.settings || snd.settings.sound !== false || snd.legacy != null) problems.push({ shot: '24b-parent-sound-off', snd });
  await js(`document.querySelector('.sett').scrollIntoView({ block: 'center' });`);
  await shot('24b-parent-sound-off', W, H);
  await js(`const row = [...document.querySelectorAll('.sett .prow')][1]; [...row.querySelectorAll('.seg-btn')][0].click(); window.scrollTo(0, 0);`);
  await wait(300);
  // scroll down to see the rest of the dashboard
  await js(`window.scrollTo(0, document.documentElement.scrollHeight);`);
  await shot('25-parent-dashboard-bottom', W, H);
  const pgW = await js(`return { sw: document.documentElement.scrollWidth, iw: innerWidth };`);
  console.log('dashboard widths', JSON.stringify(pgW));
  await js(`window.scrollTo(0, 0);`);
  // reset confirm
  await clickText('.dangerbtn', 'איפוס');
  await wait(400);
  await shot('26-parent-reset-confirm', W, H);
  await clickText('.confirm-card .btn', 'ביטול');
  await click('.ptop .corner-btn');
  await wait(500);
  // enter with wrong PIN, then "forgot"
  await click('.parent-btn');
  await wait(500);
  for (const d of '9999') await pinKey(d);
  await wait(600);
  await shot('27-parent-pin-wrong', W, H);
  await click('.linkbtn');
  await wait(500);
  await shot('28-parent-forgot-gate', W, H);
  // solve the gate → set a new PIN screen
  const gate = await js(`const m = document.querySelector('.pin-title').textContent.match(/(\\d+)\\s*×\\s*(\\d+)/) || document.querySelector('.pin-title').textContent.match(/(\\d+)/g); return document.querySelector('.pin-title').textContent;`);
  const nums = gate.match(/\d+/g).map(Number);
  await typeDigits(nums[0] * nums[1]);
  await click('.pin-actions .btn');
  await wait(500);
  const title = await js(`return document.querySelector('.pin-title').textContent;`);
  console.log('after gate:', title);
  // set a new PIN (5555 twice) → dashboard → reset one profile, then delete the other
  const pk = (d) => js(`[...document.querySelectorAll('.numpad .key')].find(k => k.textContent.trim() === '${d}').click();`);
  for (const d of '5555') await pk(d);
  await wait(500);
  for (const d of '5555') await pk(d);
  await wait(1500);
  const logBefore = await js(`return JSON.parse(localStorage.getItem('kh:p:' + JSON.parse(localStorage.getItem('kh:profiles'))[0].id + ':log') || '[]').length;`);
  await clickText('.dangerbtn', 'איפוס');
  await wait(300);
  await clickText('.confirm-card .btn', 'כן');
  await wait(900);
  const logAfter = await js(`return localStorage.getItem('kh:p:' + JSON.parse(localStorage.getItem('kh:profiles'))[0].id + ':log');`);
  const stillThere = await js(`return JSON.parse(localStorage.getItem('kh:profiles')).length;`);
  console.log('reset: log entries', logBefore, '->', logAfter, '; profiles', stillThere);
  if (logAfter !== null || stillThere !== 2) problems.push({ shot: 'reset', msg: 'reset did not clear the profile data or removed the profile' });
  await shot('29-parent-after-reset', W, H);
  await clickText('.ptab', 'אחותי');
  await wait(600);
  await clickText('.dangerbtn.hard', 'מחיקת');
  await wait(300);
  await clickText('.confirm-card .btn', 'כן');
  await wait(900);
  const left = await js(`return JSON.parse(localStorage.getItem('kh:profiles')).map(p => p.name);`);
  console.log('after delete, profiles:', JSON.stringify(left));
  if (left.length !== 1 || left[0] !== 'בודקת') problems.push({ shot: 'delete', msg: 'delete profile failed' });
  await shot('30-parent-after-delete', W, H);
}

// ---- booklet fit audit ------------------------------------------------------------------------------------------------
// For EVERY page of EVERY mock (#1–#6 + one endless), in this orientation: every question and every option must be fully
// inside the page's content box, inside the viewport, not cut by any overflow-clipping ancestor, and clear of the
// page footer, the nav buttons, the number pad and the preview banner. A page that the app marked `is-scroll` (one
// question alone taller than a page) is allowed to scroll: then its last option must be reachable by scrolling.
// Any other page whose content is taller than its box fails (the overflow:auto sheet hides it without a scrollbar,
// which is exactly how option ד disappeared under "עמוד 3"). Passage pages are measured and reported (lines, font,
// spacing, content height vs box); in portrait a passage must fit its page (PassageView's height fit) and in both
// orientations every line number must sit on its line. In landscape the "turn the tablet" note (RotateHint) must be in
// the top bar, clear of the page, the nav buttons, the number pad and the close button; in portrait it must be absent.
const PAGE_CHECK = `
  const r = (el) => el.getBoundingClientRect();
  const sheet = document.querySelector('.exam-stage .sheet');
  if (!sheet) return { error: 'no sheet' };
  const body = sheet.querySelector('.sheet-body');
  const bs = getComputedStyle(body);
  const br = r(body);
  const clip = { left: br.left + body.clientLeft, top: br.top + body.clientTop, right: br.left + body.clientLeft + body.clientWidth, bottom: br.top + body.clientTop + body.clientHeight };
  const content = { left: clip.left + parseFloat(bs.paddingLeft), right: clip.right - parseFloat(bs.paddingRight), top: clip.top + parseFloat(bs.paddingTop) - body.scrollTop, bottom: clip.bottom - parseFloat(bs.paddingBottom) };
  const T = 0.5;
  const inside = (a, b) => a.left >= b.left - T && a.right <= b.right + T && a.top >= b.top - T && a.bottom <= b.bottom + T;
  const hit = (a, b) => a.left < b.right - T && a.right > b.left + T && a.top < b.bottom - T && a.bottom > b.top + T;
  const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const foot = sheet.querySelector('.sheet-foot');
  const blockers = [
    ...(foot ? [['footer', foot]] : []),
    ...[...document.querySelectorAll('.enav .btn')].map((b) => ['nav button', b]),
    ...[...document.querySelectorAll('.enav .numpad .key')].map((b) => ['number pad', b]),
    ...[...document.querySelectorAll('.etop .corner-btn')].map((b) => ['close button', b]),
    ...[...document.querySelectorAll('.preview-banner')].map((b) => ['preview banner', b]),
  ].map(([n, el]) => [n, r(el)]);
  const clippers = (el) => { const out = []; for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') out.push(a); } return out; };
  const clipBox = (a) => { const b = r(a); return { left: b.left + a.clientLeft, top: b.top + a.clientTop, right: b.left + a.clientLeft + a.clientWidth, bottom: b.top + a.clientTop + a.clientHeight }; };
  const scroll = sheet.classList.contains('is-scroll');
  const fails = [];
  const checkEl = (el, what, id) => {
    const b = r(el);
    if (!b.width || !b.height) return fails.push({ id, what, why: 'zero size' });
    if (!inside(b, content)) fails.push({ id, what, why: 'outside the page content box', box: [b.top, b.bottom].map(Math.round), page: [content.top, content.bottom].map(Math.round) });
    if (!inside(b, vp)) fails.push({ id, what, why: 'outside the viewport' });
    for (const a of clippers(el)) if (!inside(b, clipBox(a))) { fails.push({ id, what, why: 'clipped by overflow ancestor .' + String(a.className).trim().split(/\\s+/)[0] }); break; }
    for (const [n, bb] of blockers) if (hit(b, bb)) fails.push({ id, what, why: 'overlaps the ' + n });
  };
  const items = [...body.querySelectorAll('.bk-item')];
  let scrolled = null;
  if (scroll) {
    // allowed to scroll: bring the bottom into view, then the last item must be fully reachable
    body.scrollTop = body.scrollHeight;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    scrolled = { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, items: items.length, overflowY: bs.overflowY };
    const last = items[items.length - 1];
    const opts = last ? [...last.querySelectorAll('.bk-opt')] : [];
    const lastOpt = opts[opts.length - 1] || last;
    if (lastOpt) { const b = r(lastOpt); if (!inside(b, clip)) fails.push({ id: last.dataset.item, what: 'last option after scrolling', why: 'not reachable by scrolling' }); }
    if (items.length !== 1) fails.push({ why: 'scroll fallback on a page with ' + items.length + ' questions' });
    if (bs.overflowY !== 'auto' && bs.overflowY !== 'scroll') fails.push({ why: 'scroll page does not scroll' });
    body.scrollTop = 0;
  } else {
    for (const it of items) {
      const id = it.dataset.item || 'example';
      checkEl(it, 'question', id);
      [...it.querySelectorAll('.bk-opt')].forEach((o, k) => checkEl(o, 'option ' + (k + 1), id));
    }
  }
  const isPassage = !!body.querySelector('.passage:not(.bk-mini)');
  const over = body.scrollHeight - body.clientHeight;
  if (!scroll && !isPassage && over > 0) fails.push({ why: 'page content is ' + over + 'px taller than the page box (hidden below the footer)' });
  if (foot) { const f = r(foot); if (!inside(f, vp)) fails.push({ why: 'footer outside the viewport' }); const nav = document.querySelector('.enav'); if (nav && f.bottom > r(nav).top + T) fails.push({ why: 'page overlaps the nav bar' }); }
  let passage = null;
  if (isPassage) {
    const a = body.querySelector('.passage');
    const t0 = a.querySelector('.pline-text');
    passage = { lines: a.querySelectorAll('.pline').length, fontPx: parseFloat(getComputedStyle(a).fontSize), lineHeight: +(parseFloat(getComputedStyle(t0).lineHeight) / parseFloat(getComputedStyle(t0).fontSize)).toFixed(2), paraGap: getComputedStyle(a).getPropertyValue('--pp-gap').trim() || '0.7em', passageH: Math.round(r(a).height), boxH: body.clientHeight, contentH: body.scrollHeight, fits: over <= 0, hscroll: a.classList.contains('pfit-scroll') };
    // every line number still sits on its own line (inside that line's text box), at whatever size/spacing the fit chose
    const off = [...a.querySelectorAll('.pline')].filter((l) => { const nb = r(l.querySelector('.pline-n')), tb = r(l.querySelector('.pline-text')); return nb.top < tb.top - 1 || nb.bottom > tb.bottom + 1; }).map((l) => l.dataset.line);
    if (off.length) fails.push({ why: 'line numbers not aligned with their lines: ' + off.join(',') });
    // portrait: the whole passage is on its page (PassageView's height fit), as in the real booklet
    if (innerHeight > innerWidth && over > 0) fails.push({ why: 'passage is ' + over + 'px taller than its portrait page (should fit, floor 19px)' });
    // the same page at the auto-fit floor (19px, PassageView MIN_PX): would shrinking the font make it fit?
    const keep = a.style.fontSize;
    a.style.fontSize = '19px';
    passage.floorContentH = body.scrollHeight;
    passage.floorFits = body.scrollHeight <= body.clientHeight;
    a.style.fontSize = keep;
  }
  const hint = document.querySelector('.rot-hint');
  if (hint && innerHeight > innerWidth) fails.push({ why: 'rotate note shown in portrait' });
  if (hint) {
    const hb = r(hint);
    for (const [n, bb] of [['page', r(sheet)], ...blockers.filter(([n]) => n !== 'preview banner' && n !== 'footer')]) if (hit(hb, bb)) fails.push({ why: 'rotate note overlaps the ' + n });
    if (!inside(hb, r(document.querySelector('.etop')))) fails.push({ why: 'rotate note is not inside the top bar' });
  }
  return { fails, scroll, scrolled, passage, hint: !!hint, items: items.map((i) => i.dataset.item).filter(Boolean) };
`;

async function freshProfile() {
  await send('Page.navigate', { url: BASE });
  await wait(1200);
  await js(`localStorage.clear(); location.reload();`).catch(() => {});
  await wait(1500);
  await js(`const i = document.querySelector('.name-input'); i.value = 'בודקת'; i.dispatchEvent(new Event('input', { bubbles: true }));`);
  await click('.create-card .btn-primary');
  await click('.comp-card', 5);
  await click('.row-btns .btn-primary');
  await wait(600);
}
const audit = { mocks: {}, fails: [], scrollPages: [], passages: [], checked: {} };
async function auditBooklets(W, H) {
  const orient = W > H ? 'landscape' : 'portrait';
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await freshProfile();
  await js(`window.__khStopMs = 600000;`);
  await click('.isl-mock');
  await wait(500);
  const cards = await js(`return document.querySelectorAll('.ms-card').length;`);
  // the six mocks + one endless, then a "sweep" booklet (the endless card, dev hook) holding ALL passages and ALL word
  // problems, so every question of the real content is paged and checked, not just the ones the mocks happen to pick
  for (let c = 0; c <= cards; c++) {
    const sweep = c === cards;
    await js(sweep ? `window.__khSimOverride = (ct) => ({ passageIds: ct.passages.map((p) => p.id), C: ct.wordProblems.map((w) => w.id) });` : `window.__khSimOverride = null;`);
    await click('.ms-mode', 1);
    await click('.ms-card', sweep ? cards - 1 : c);
    for (let k = 0; k < 40 && !(await js(`return !!(window.__khExam && document.querySelector('.exam-stage .sheet'));`)); k++) await wait(100);
    const info = await js(`const e = window.__khExam; return { n: e.sim.n, pages: e.pages.map((p) => ({ type: p.type, task: p.task || null, pageNo: p.pageNo, items: (p.items || []).map((i) => i.id), scroll: !!p.scroll, passage: p.passage && p.passage.id })) };`);
    const label = sweep ? 'sweep (all passages + word problems)' : 'mock ' + info.n;
    const rec = (audit.mocks[label] = audit.mocks[label] || {});
    rec[orient] = { pages: info.pages.length, numbered: info.pages.filter((p) => p.pageNo).length, readingPages: info.pages.filter((p) => p.type === 'items' && p.task === 'reading').map((p) => p.items.length).join('+'), cPages: info.pages.filter((p) => p.type === 'items' && p.task === 'C').map((p) => p.items.length).join('+'), scroll: [] };
    for (let i = 0; i < info.pages.length; i++) {
      const p = info.pages[i];
      if (sweep && p.type !== 'items' && p.type !== 'passage') continue;
      if (p.type === 'stop') await js(`window.__khExam.setStopOk(true);`);
      await js(`window.__khExam.setPage(${i});`);
      await wait(420); // the page-turn animation is 340 ms
      const res = await js(PAGE_CHECK);
      const where = `${label} ${orient} page ${p.pageNo ?? 'cover'} (${p.type}${p.task ? ':' + p.task : ''}${p.passage ? ' ' + p.passage : ''})`;
      if (res.error) { audit.fails.push({ where, why: res.error }); continue; }
      if (c === 0 && i === 0 && orient === 'landscape' && !res.hint) audit.fails.push({ where, why: 'no "turn the tablet" note in landscape' });
      for (const f of res.fails) audit.fails.push({ where, ...f });
      if (sweep) audit.checked[orient] = (audit.checked[orient] || 0) + res.items.length;
      if (res.scroll) { audit.scrollPages.push({ where, items: res.items, ...res.scrolled }); rec[orient].scroll.push(res.items.join()); }
      if (res.passage && sweep) audit.passages.push({ where, mock: info.n, orient, id: p.passage, ...res.passage });
      const safe = (s) => s.replace(/[^a-z0-9-]+/gi, '_');
      if (res.fails.length || res.scroll || (res.passage && !sweep && process.env.KH_QA_SHOTS !== '0') || (!sweep && info.n === 1 && p.type === 'items' && p.task === 'reading')) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, safe(`audit-m${info.n}-p${p.pageNo}-${p.type}${p.passage ? '-' + p.passage : ''}${res.fails.length ? '-FAIL' : ''}`) + `-${W}x${H}.png`), Buffer.from(data, 'base64'));
      }
      if (res.fails.length) console.log('✖', where, JSON.stringify(res.fails.slice(0, 4)));
    }
    console.log(`audited ${label} ${orient}: ${info.pages.length} pages, reading ${rec[orient].readingPages}, C ${rec[orient].cPages}, scroll ${rec[orient].scroll.length}`);
    // rotation keeps her place: on the page holding the 2nd question of the first passage, circle it, rotate, rotate back
    if (c === 0 && !sweep) {
      const target = info.pages.find((p) => p.type === 'items' && p.task === 'reading' && p.items.length > 1) || info.pages.find((p) => p.type === 'items' && p.task === 'reading');
      const q = target.items[target.items.length - 1];
      await js(`window.__khExam.setPage(${info.pages.indexOf(target)});`);
      await wait(450);
      await js(`document.querySelector('[data-item="${q}"] .bk-opt:nth-child(3)').click();`);
      await wait(200);
      const at = async () => js(`const e = window.__khExam; return { onPage: e.pages[e.page].items ? e.pages[e.page].items.map((i) => i.id) : [], answers: Object.keys(e.answers).length, circled: !!document.querySelector('[data-item="${q}"] .pencil-circle'), visible: (() => { const el = document.querySelector('[data-item="${q}"]'); if (!el) return false; const b = el.getBoundingClientRect(); const s = document.querySelector('.sheet-body').getBoundingClientRect(); return b.top >= s.top - 1 && b.bottom <= s.bottom + 1; })() };`);
      for (const [w2, h2] of [[H, W], [W, H]]) {
        await send('Emulation.setDeviceMetricsOverride', { width: w2, height: h2, deviceScaleFactor: 1, mobile: true, screenOrientation: w2 > h2 ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
        await wait(900);
        const s = await at();
        console.log(`rotate to ${w2}x${h2}:`, JSON.stringify(s));
        if (!s.onPage.includes(q) || s.answers !== 1 || !s.circled || !s.visible) audit.fails.push({ where: `${label} rotate ${orient} → ${w2}x${h2}`, why: 'lost her place or answer after rotating', id: q, state: s });
      }
    }
    // leave the mock (and give the run up so the next card starts clean)
    await click('.etop .corner-btn');
    await clickText('.confirm-card .btn', 'כן');
    await wait(500);
    await click('.ms-resume .btn-ghost').catch(() => {});
    await wait(300);
  }
}

const AUDIT_ONLY = process.env.KH_QA_AUDIT_ONLY === '1';
try {
  if (ORIENT !== 'port') await auditBooklets(1280, 800);
  if (ORIENT !== 'land') await auditBooklets(800, 1280);
  if (!AUDIT_ONLY && ORIENT !== 'port') await run(1280, 800);
  if (!AUDIT_ONLY && ORIENT !== 'land') await run(800, 1280);
} catch (e) {
  console.error('QA script error:', e.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ problems, report, audit }, null, 1));
  console.log('\nbooklet audit (pages per mock; reading / task C questions per page; scroll-fallback pages):');
  for (const [m, o] of Object.entries(audit.mocks)) for (const [k, v] of Object.entries(o)) console.log(`  ${m} ${k}: ${v.pages} pages, reading ${v.readingPages}, C ${v.cPages}, scroll fallback: ${v.scroll.length ? v.scroll.join(' | ') : 'none'}`);
  console.log('  questions checked per orientation: ' + JSON.stringify(audit.checked));
  const longest = audit.passages.slice().sort((a, b) => b.lines - a.lines)[0];
  for (const o of ['landscape', 'portrait']) {
    const ps = audit.passages.filter((p) => p.orient === o);
    if (!ps.length) continue;
    const bad = ps.filter((p) => !p.fits);
    console.log(`  passages ${o}: ${ps.length - bad.length}/${ps.length} fit their page` + (bad.length ? `; overflowing: ${bad.map((p) => `${p.id} (${p.lines} lines @${p.fontPx}px: content ${p.contentH}px in a ${p.boxH}px box; @19px floor ${p.floorContentH}px)`).join(', ')}` : ''));
    if (o === 'portrait') for (const p of ps) console.log(`    ${p.id}: ${p.lines} lines, ${p.fontPx}px, line-height ${p.lineHeight}, paragraph gap ${p.paraGap}, passage ${p.passageH}px, page ${p.contentH}/${p.boxH}px ${p.fits ? 'fits' : 'SCROLLS'}`);
  }
  if (longest) console.log('  longest passage:', longest.id, longest.lines, 'lines');
  if (audit.fails.length) {
    console.log('\n✖ BOOKLET FIT FAILURES (' + audit.fails.length + '):');
    for (const f of audit.fails) console.log('  ' + f.where + (f.id ? ' — question ' + f.id : '') + (f.what ? ' — ' + f.what : '') + ': ' + f.why);
    process.exitCode = 1;
  } else console.log('✓ booklet fit: every question and option of every page of every mock is fully on its page, in both orientations');
  console.log(problems.length ? 'PROBLEMS: ' + JSON.stringify(problems.map((p) => p.shot)) : 'no layout problems flagged');
  console.log(consoleErrors.length ? 'console errors: ' + JSON.stringify(consoleErrors.slice(0, 10)) : 'no console errors');
  if (consoleErrors.length || problems.length) process.exitCode = 1;
  ws.close();
  chrome.kill();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
