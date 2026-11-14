#!/usr/bin/env node
// Offline check: loads the built app (vite preview or the Pages URL) in headless Chrome, waits until the service
// worker controls the page, then cuts the network (CDP Network.emulateNetworkConditions offline) and reloads.
// The app must render, load content and open a practice session with no network at all.
//   node scripts/qa-offline.mjs <url> [screenshotPath]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:4173/kochvei-hamivchan/';
const SHOT = process.argv[3];
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-off-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank']);
const wsUrl = await new Promise((res, rej) => {
  let b = '';
  chrome.stderr.on('data', (d) => { b += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(b); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('chrome did not start')), 15000);
});
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expr, ms = 8000) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }),
    wait(ms).then(() => ({ result: { value: 'TIMEOUT' } })),
  ]);
  return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value;
};

const out = {};
try {
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await wait(2500);
  out.swRegistered = await js(`const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting));`);
  out.ready = await js(`await navigator.serviceWorker.ready; return true;`);
  out.swInfo = await js(`const r = await navigator.serviceWorker.getRegistration(); return r ? r.scope + ' ' + (r.active && r.active.scriptURL) : 'none';`);
  await send('Page.reload');
  await wait(2500);
  out.controlled = await js(`return !!navigator.serviceWorker.controller;`);
  out.cached = await js(`const ks = await caches.keys(); let n = 0; for (const k of ks) n += (await (await caches.open(k)).keys()).length; return n;`);
  // seed a profile so the map renders directly
  await js(`localStorage.setItem('kh:profiles', JSON.stringify([{ id: 'pqa', name: 'QA', companion: 'owl', created: 1 }])); localStorage.setItem('kh:active', '"pqa"'); return true;`);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  out.onlineFetchFails = await js(`try { await fetch('https://example.com/', { mode: 'no-cors', cache: 'no-store' }); return false; } catch { return true; }`);
  await send('Page.reload');
  await wait(3000);
  out.offlineMapRendered = await js(`return document.querySelectorAll('.island').length;`);
  await js(`document.querySelector('.isl-reading').click(); return true;`);
  await wait(1500);
  out.offlinePassageLines = await js(`return document.querySelectorAll('.pline').length;`);
  await js(`document.querySelector('.ptop .corner-btn').click(); return true;`);
  await wait(500);
  await js(`document.querySelector('.isl-wordProblems').click(); return true;`);
  await wait(1200);
  out.offlineWordProblemOptions = await js(`return document.querySelectorAll('.choice').length;`);
  if (SHOT) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(data, 'base64'));
  }
} catch (e) {
  out.error = e.message;
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(out, null, 1));
  ws.close();
  chrome.kill();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
