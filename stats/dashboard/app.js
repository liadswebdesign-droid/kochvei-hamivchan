// Owner dashboard. Reads the key from #k=… once, keeps it in localStorage, strips it from the URL, and fetches
// /api/stats with it. Every value from the server is rendered as text (textContent), never as HTML.
(() => {
  'use strict';
  const KEY_STORE = 'kochvei-stats-key';
  const DAY = 86400000;
  const $ = (id) => document.getElementById(id);

  // ---- key -----------------------------------------------------------------------------------------------------------
  const store = {
    get() {
      try { return localStorage.getItem(KEY_STORE) || ''; } catch { return mem; }
    },
    set(v) {
      mem = v;
      try { localStorage.setItem(KEY_STORE, v); } catch { /* memory only */ }
    },
    clear() {
      mem = '';
      try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
    },
  };
  let mem = '';
  const KEY_RE = /^[\x21-\x7e]{32,256}$/;
  // Accepts a whole dashboard link (…#k=KEY) or the bare key.
  function keyFrom(text) {
    const s = String(text || '').trim();
    const m = /[#&]k=([^&\s]+)/.exec(s);
    let k = m ? m[1] : s;
    try { k = decodeURIComponent(k); } catch { /* keep as is */ }
    return KEY_RE.test(k) ? k : '';
  }
  (function takeKeyFromHash() {
    if (!location.hash) return;
    const k = keyFrom(location.hash);
    if (k) store.set(k);
    // Strip it from the address bar and history either way.
    history.replaceState(null, '', location.pathname + location.search);
  })();

  // ---- formatting ------------------------------------------------------------------------------------------------------
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
  const nf = new Intl.NumberFormat('he');
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(['he'], { type: 'region' }); } catch { /* old browser */ }
  const country = (cc) => {
    if (!cc) return '';
    try { return (regionNames && regionNames.of(cc)) || cc; } catch { return cc; }
  };
  // ICU writes Hebrew dual forms as "לפני שעתיים (2)"; the "(2)" is dropped.
  const rel = (n, unit) => rtf.format(n, unit).replace(/\s*\(\d+\)/, '');
  function ago(ts, now) {
    const s = Math.round((ts - now) / 1000);
    const a = Math.abs(s);
    if (a < 60) return 'ממש עכשיו';
    if (a < 3600) return rel(Math.round(s / 60), 'minute');
    if (a < DAY / 1000) return rel(Math.round(s / 3600), 'hour');
    if (a < 30 * DAY / 1000) return rel(Math.round(s / 86400), 'day');
    if (a < 365 * DAY / 1000) return rel(Math.round(s / (30 * 86400)), 'month');
    return rel(Math.round(s / (365 * 86400)), 'year');
  }
  const minutes = (n) => (n >= 120 ? `${nf.format(Math.round(n / 6) / 10)} שעות` : `${nf.format(n)} דק׳`);
  const dayLabel = (day) => `${Number(day.slice(8))}.${Number(day.slice(5, 7))}`;

  // Tiny DOM builder: h('div', {class: 'x'}, 'text', child). Strings become text nodes.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    if (text != null) el.textContent = String(text);
    return el;
  }

  // ---- views -------------------------------------------------------------------------------------------------------------
  function show(view) {
    $('login').hidden = view !== 'login';
    $('loading').hidden = view !== 'loading';
    $('dash').hidden = view !== 'dash';
    $('refresh').hidden = view !== 'dash';
    if (view === 'login') $('updated').textContent = '';
  }
  function setError(msg) {
    $('error').textContent = msg || '';
    $('error').hidden = !msg;
  }

  function deviceItem(d, now) {
    const unnamed = !d.label;
    const max = Math.max(30, ...d.recent.map((r) => r.minutes));
    const where = [d.city, country(d.country)].filter(Boolean).join(', ') || 'מיקום לא ידוע';
    const names = Array.isArray(d.names) ? d.names : null;
    return h('li', { class: d.bot ? 'card dev bot' : 'card dev' },
      h('div', { class: 'dev-head' },
        h('h3', { class: 'dev-name', dir: 'auto' }, unnamed ? 'מכשיר חדש' : d.label),
        unnamed ? h('span', { class: 'badge new' }, 'בלי שם') : null,
        h('span', { class: d.standalone ? 'badge inst' : 'badge web' }, d.standalone ? 'מותקן' : 'בדפדפן'),
        h('span', { class: 'code', dir: 'ltr', 'aria-label': 'קוד ' + d.code.split('').join(' ') }, d.code.toUpperCase()),
      ),
      names
        ? h('p', { class: 'dev-names' }, names.length
          ? names.map((n) => h('span', { class: 'chip', dir: 'auto' }, n))
          : h('span', { class: 'muted' }, 'אין פרופילים במכשיר'))
        : h('p', { class: 'dev-names' }, h('span', { class: 'muted' }, 'השמות יופיעו אחרי הפתיחה הבאה של האפליקציה')),
      h('p', { class: 'dev-meta' },
        h('span', null, 'אזור משוער: ', where),
        d.net ? h('span', null, 'ספק: ', h('bdi', { dir: 'ltr' }, d.net)) : null,
        h('bdi', { dir: 'ltr' }, d.kind || ''),
      ),
      h('p', { class: 'dev-meta' },
        h('span', null, 'נראה לאחרונה ', ago(d.last_seen, now)),
        h('span', null, 'לראשונה ', ago(d.first_seen, now)),
      ),
      h('p', { class: 'dev-nums' },
        h('span', null, h('b', null, nf.format(d.days_active)), d.days_active === 1 ? ' יום פעיל' : ' ימים פעילים'),
        h('span', null, h('b', null, minutes(d.total_minutes)), ' בסך הכול'),
        !names && d.profiles != null ? h('span', null, h('b', null, nf.format(d.profiles)), d.profiles === 1 ? ' פרופיל' : ' פרופילים') : null,
      ),
      h('div', { class: 'dev-foot' },
        h('div', { class: 'spark', role: 'img', 'aria-label': `פעילות ב־14 הימים האחרונים: ${d.recent.filter((r) => r.opens || r.minutes).length} ימים פעילים` },
          d.recent.map((r) => {
            const bar = h('i');
            const pct = r.minutes ? Math.max(12, Math.round((100 * r.minutes) / max)) : r.opens ? 8 : 0;
            bar.style.height = pct + '%';
            return h('span', { title: `${dayLabel(r.day)}: ${r.minutes} דק׳` }, bar);
          }),
        ),
        h('button', { type: 'button', class: 'btn small', onclick: () => openName(d) }, unnamed ? 'תן שם' : 'שינוי שם'),
      ),
    );
  }

  // Active devices per day, 30 days. RTL like the rest of the page: today on the left.
  function chart(daily) {
    const W = 340, H = 150, top = 14, bottom = 22, side = 6;
    const max = Math.max(4, ...daily.map((d) => d.devices));
    const n = daily.length;
    const slot = (W - 2 * side) / n;
    const y = (v) => top + (H - top - bottom) * (1 - v / max);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `מכשירים פעילים בכל יום, 30 הימים האחרונים. היום: ${daily[n - 1].devices}` });
    const ticks = max <= 4 ? [0, 2, 4] : [0, Math.round(max / 2), max];
    for (const t of ticks) {
      svg.append(s('line', { class: 'grid', x1: side, x2: W - side, y1: y(t), y2: y(t) }));
      svg.append(s('text', { x: W - side, y: y(t) - 3, 'text-anchor': 'end' }, t));
    }
    daily.forEach((d, i) => {
      const x = W - side - (i + 1) * slot; // oldest on the right
      if (d.devices) {
        const r = s('rect', { class: 'bar', x: x + slot * 0.18, width: slot * 0.64, y: y(d.devices), height: y(0) - y(d.devices), rx: 1.5 });
        r.append(s('title', null, `${dayLabel(d.day)}: ${d.devices} מכשירים, ${d.minutes} דק׳`));
        svg.append(r);
      }
      if (i === n - 1 || i % 7 === (n - 1) % 7) {
        svg.append(s('text', { x: x + slot / 2, y: H - 6, 'text-anchor': 'middle' }, i === n - 1 ? 'היום' : dayLabel(d.day)));
      }
    });
    return svg;
  }

  function render(data) {
    const now = data.now;
    const week = now - 7 * DAY;
    // Scanners (a page run from a cloud network, not a person) are listed apart and left out of every number.
    const devs = data.devices.filter((d) => !d.bot);
    const bots = data.devices.filter((d) => d.bot);
    $('bots').hidden = bots.length === 0;
    $('bots-n').textContent = nf.format(bots.length);
    $('bots-list').replaceChildren(...bots.map((d) => deviceItem(d, now)));
    $('s-week').textContent = nf.format(devs.filter((d) => d.last_seen >= week).length);
    $('s-new').textContent = nf.format(devs.filter((d) => d.first_seen >= week).length);
    const today = data.daily.find((d) => d.day === data.today);
    $('s-today').textContent = nf.format(today ? today.minutes : 0);
    $('empty').hidden = devs.length > 0;
    $('devices-h').hidden = devs.length === 0;
    $('devices').replaceChildren(...devs.map((d) => deviceItem(d, now)));
    $('chart').replaceChildren(chart(data.daily));
    $('updated').textContent = 'עודכן ' + new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  // ---- data --------------------------------------------------------------------------------------------------------------
  let loading = false;
  let lastData = null;
  async function api(path, init = {}) {
    const key = store.get();
    const res = await fetch(path, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      headers: { ...(init.headers || {}), Authorization: 'Bearer ' + key },
    });
    if (res.status === 401) {
      store.clear();
      throw Object.assign(new Error('המפתח לא תקין. פתחו שוב את הקישור עם המפתח.'), { auth: true });
    }
    if (res.status === 503) throw new Error('המפתח עוד לא הוגדר בשרת.');
    if (res.status === 429) throw new Error('יותר מדי בקשות. נסו שוב בעוד דקה.');
    if (!res.ok) throw new Error('שגיאה בטעינה (' + res.status + ').');
    return res.json();
  }
  async function load() {
    if (!store.get()) return show('login');
    if (loading) return;
    loading = true;
    $('refresh').classList.add('spin');
    if (!lastData) show('loading');
    try {
      const data = await api('/api/stats');
      lastData = data;
      setError('');
      render(data);
      show('dash');
    } catch (e) {
      if (e.auth) {
        lastData = null;
        show('login');
        $('login-err').textContent = e.message;
      } else {
        setError(e.message && /[֐-׿]/.test(e.message) ? e.message : 'אין חיבור. נסו שוב.');
        if (!lastData) show('dash');
      }
    } finally {
      loading = false;
      $('refresh').classList.remove('spin');
    }
  }

  // ---- naming a device -------------------------------------------------------------------------------------------------
  let naming = null;
  function openName(d) {
    naming = d;
    $('name-sub').replaceChildren(
      'קוד ', h('bdi', { dir: 'ltr' }, d.code.toUpperCase()), ' · ',
      [d.city, country(d.country)].filter(Boolean).join(', ') || 'מיקום לא ידוע', ' · ', h('bdi', { dir: 'ltr' }, d.kind || ''),
      Array.isArray(d.names) && d.names.length ? ' · ' + d.names.join(', ') : '',
    );
    $('name-input').value = d.label || '';
    $('name-err').textContent = '';
    const dlg = $('name-dlg');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    $('name-input').focus();
  }
  function closeName() {
    naming = null;
    const dlg = $('name-dlg');
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }
  $('name-cancel').addEventListener('click', closeName);
  $('name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!naming) return;
    const label = $('name-input').value.trim().replace(/\s+/g, ' ');
    if ([...label].length > 40) return ($('name-err').textContent = 'עד 40 תווים.');
    try {
      await api('/api/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ d: naming.id, label: label || null }),
      });
      closeName();
      load();
    } catch (err) {
      $('name-err').textContent = err.status === 400 ? 'השם לא תקין.' : err.message;
      if (err.auth) closeName();
    }
  });

  // ---- login / refresh -----------------------------------------------------------------------------------------------------
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const k = keyFrom($('key-input').value);
    if (!k) return ($('login-err').textContent = 'זה לא נראה כמו קישור או מפתח.');
    $('login-err').textContent = '';
    $('key-input').value = '';
    store.set(k);
    load();
  });
  $('refresh').addEventListener('click', load);
  $('forget').addEventListener('click', () => {
    store.clear();
    lastData = null;
    show('login');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.get()) load();
  });

  load();
})();
