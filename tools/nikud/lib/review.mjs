// Stage 6: LiaD's review page — one standalone Hebrew RTL HTML file.
//  - every adjudicated word, in its full sentence, with the three vocalizer versions and the decision + reason
//  - a random (seeded, so stable between runs) 10% sample of passages rendered in full
//  - a checkbox per item (localStorage), a "problem" flag with a note, and a JSON export of the flagged items
import { tokenize } from './hebrew.mjs';
import { sha } from './extract.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function seededRandom(seed) {
  let h = parseInt(sha(seed, 8), 16) >>> 0;
  return () => {
    h |= 0; h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePassages(passageFiles, { pct = 10, seed = 'smart-girls-nikud' } = {}) {
  const sorted = [...passageFiles].sort();
  if (!sorted.length) return [];
  const n = Math.max(1, Math.ceil(sorted.length * pct / 100));
  const rnd = seededRandom(seed + '|' + sorted.join(','));
  const pool = [...sorted];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.sort();
}

function sentenceHtml(text, forms, highlight) {
  let wi = 0;
  return tokenize(text).map((t) => {
    if (t.type !== 'word') return esc(t.text);
    const i = wi++;
    const f = forms?.[i] ?? t.text;
    return i === highlight ? `<mark>${esc(f)}</mark>` : esc(f);
  }).join('');
}

const VOC_LABEL = { dicta: 'Dicta (נקדן)', codex: 'GPT (Codex)', claude: 'Claude' };

export function renderReview({ disagreements, finalsByKey, itemsByKey, vocIds, passages, stats, lintSummary, generatedAt, font }) {
  const fontFamily = font || 'Noto Sans Hebrew';
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, '+')}:wght@400;700&display=swap`;
  const cards = disagreements.map((d, n) => {
    const item = itemsByKey.get(`${d.file}#${d.path}`);
    const fin = finalsByKey.get(`${d.file}#${d.path}`);
    const finalSentence = item ? sentenceHtml(item.text, fin?.forms, d.wordIndex) : esc(d.sentence);
    const rows = vocIds.map((v) => {
      const val = d.versions[v];
      const same = d.decision && val && val.normalize('NFC') === String(d.decision.form).normalize('NFC');
      return `<tr class="${same ? 'match' : ''}"><th>${esc(VOC_LABEL[v] || v)}</th><td class="heb">${val ? esc(val) : '<span class="err">— (שגיאה/חסר)</span>'}</td></tr>`;
    }).join('');
    const hintRow = d.hint ? `<tr><th>רמז מהכותב</th><td class="heb">${esc(d.hint)}</td></tr>` : '';
    const decision = d.decision
      ? `<div class="decision"><div class="label">ההכרעה</div><div class="heb big">${esc(d.decision.form)}</div><div class="reason" dir="auto">${esc(d.decision.reason)}</div></div>`
      : '<div class="decision pending"><div class="label">עדיין לא הוכרע</div></div>';
    const others = vocIds.map((v) => (d.vocalizedSentence?.[v]
      ? `<div><span class="who">${esc(VOC_LABEL[v] || v)}:</span> <span class="heb">${esc(d.vocalizedSentence[v])}</span></div>` : '')).join('');
    const where = d.occurrences.map((o) => `${esc(o.file)} › ${esc(o.path)}`).join('<br>');
    return `<article class="card" data-id="${esc(d.id)}" data-kind="word" data-label="${esc(d.word)}">
  <header><span class="num">${n + 1}</span><span class="word heb">${esc(d.word)}</span><span class="where">${where}</span></header>
  <p class="sentence heb">${finalSentence}</p>
  <div class="grid"><table class="versions">${rows}${hintRow}</table>${decision}</div>
  <details><summary>המשפט המלא אצל כל מנקד</summary><div class="others">${others}</div></details>
  <footer class="controls">
    <label class="check"><input type="checkbox" data-role="checked"> בדקתי</label>
    <label class="flag"><input type="checkbox" data-role="flagged"> יש כאן בעיה</label>
    <textarea dir="auto" data-role="note" placeholder="הערה (לא חובה)" rows="1"></textarea>
  </footer>
</article>`;
  }).join('\n');

  const passageHtml = passages.map((p) => {
    let line = 0;
    const paras = (p.json.paragraphs || []).map((para) => `<div class="para">${para.map((l) => `<div class="line"><span class="ln">${++line}</span><span class="heb">${esc(l)}</span></div>`).join('')}</div>`).join('');
    const qs = (p.json.questions || []).map((q, qi) => `<li><div class="heb stem">${esc(q.stem)}</div><ol class="opts">${(q.options || []).map((o) => `<li class="heb">${esc(o)}</li>`).join('')}</ol>${q.explain ? `<div class="heb explain">${esc(q.explain)}</div>` : ''}</li>`).join('');
    return `<article class="card passage" data-id="passage:${esc(p.file)}:${esc(sha(JSON.stringify(p.json), 8))}" data-kind="passage" data-label="${esc(p.file)}">
  <header><span class="word heb">${esc(p.json.title || p.file)}</span><span class="where">${esc(p.file)}</span></header>
  ${p.json.imageCaption ? `<div class="heb caption">${esc(p.json.imageCaption)}</div>` : ''}
  <div class="passage-text">${paras}</div>
  ${qs ? `<ol class="questions">${qs}</ol>` : ''}
  <footer class="controls">
    <label class="check"><input type="checkbox" data-role="checked"> קראתי</label>
    <label class="flag"><input type="checkbox" data-role="flagged"> יש כאן בעיה</label>
    <textarea dir="auto" data-role="note" placeholder="איזו מילה ומה לא בסדר" rows="1"></textarea>
  </footer>
</article>`;
  }).join('\n');

  const pageKey = 'nikud-review-v1';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בדיקת ניקוד</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(fontUrl)}">
<style>
:root { --bg:#fbfaf7; --card:#ffffff; --ink:#1d1b18; --muted:#6b665e; --line:#e6e1d8; --accent:#2f5d8a; --ok:#e8f3ea; --okInk:#24653a; --warn:#fff4e0; --bad:#fdeaea; --badInk:#a12b2b; --mark:#ffe58a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#16181b; --card:#1f2226; --ink:#f1efe9; --muted:#a9a49b; --line:#33373d; --accent:#8fb8e3; --ok:#1f3326; --okInk:#9fd7ae; --warn:#3a2f1c; --bad:#3b2222; --badInk:#f0a3a3; --mark:#6b5a12; } }
:root[data-theme="dark"] { --bg:#16181b; --card:#1f2226; --ink:#f1efe9; --muted:#a9a49b; --line:#33373d; --accent:#8fb8e3; --ok:#1f3326; --okInk:#9fd7ae; --warn:#3a2f1c; --bad:#3b2222; --badInk:#f0a3a3; --mark:#6b5a12; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:'${fontFamily}', 'Noto Sans Hebrew', system-ui, sans-serif; font-size:20px; line-height:1.6; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 120px; }
h1 { font-size: 34px; margin: 8px 0; } h2 { font-size: 28px; margin: 40px 0 12px; }
.intro { color: var(--muted); }
.stats { display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:8px 14px; }
.stat b { font-size: 24px; display:block; }
.heb { font-size: 30px; line-height: 2.1; }
.card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 20px; margin:16px 0; }
.card.is-checked { border-color: var(--okInk); background: var(--ok); }
.card.is-flagged { border-color: var(--badInk); background: var(--bad); }
.card header { display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; }
.num { color:var(--muted); font-size:16px; }
.word { font-weight:700; }
.where { color:var(--muted); font-size:14px; direction:ltr; margin-inline-start:auto; }
.sentence { margin: 8px 0; }
mark { background: var(--mark); color: inherit; border-radius: 6px; padding: 0 4px; }
.grid { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items:start; }
@media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
table.versions { border-collapse: collapse; width:100%; }
table.versions th { text-align:start; font-weight:400; color:var(--muted); font-size:16px; padding: 2px 8px; white-space:nowrap; }
table.versions td { padding: 2px 8px; }
table.versions tr.match td { font-weight:700; }
.err { color: var(--badInk); font-size: 18px; }
.decision { border:2px solid var(--accent); border-radius:12px; padding:8px 14px; }
.decision.pending { border-color: var(--badInk); }
.decision .label { color:var(--muted); font-size:16px; }
.decision .big { font-size: 38px; font-weight:700; }
.decision .reason { font-size: 17px; unicode-bidi: plaintext; }
details { margin-top: 6px; } summary { cursor:pointer; color:var(--accent); font-size:16px; }
.others .who { color:var(--muted); font-size:15px; }
.others .heb { font-size: 24px; }
.controls { display:flex; flex-wrap:wrap; gap: 16px; align-items:center; margin-top: 10px; border-top:1px solid var(--line); padding-top:10px; }
.controls label { display:flex; gap:8px; align-items:center; cursor:pointer; font-size:18px; min-height:44px; }
.controls input[type=checkbox] { width:26px; height:26px; }
.controls textarea { flex:1; min-width: 200px; font: inherit; font-size:18px; border:1px solid var(--line); border-radius:10px; padding:6px 10px; background:var(--bg); color:var(--ink); }
.passage-text .para { margin-bottom: 14px; }
.line { display:flex; gap: 14px; }
.ln { color:var(--muted); font-size:16px; min-width: 24px; padding-top: 14px; text-align:center; }
.caption { color: var(--muted); }
.questions .stem { font-weight:700; }
.questions .opts { list-style: hebrew; }
.explain { color: var(--muted); font-size: 24px; }
.export { position: fixed; inset-inline: 0; bottom: 0; background: var(--card); border-top:1px solid var(--line); padding: 10px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; justify-content:center; }
.export button { font: inherit; font-size:18px; padding: 8px 18px; border-radius: 10px; border:1px solid var(--accent); background: var(--accent); color: var(--card); cursor:pointer; min-height:44px; }
.export button.secondary { background: transparent; color: var(--accent); }
#exportBox { display:none; width:100%; max-width: 980px; height: 160px; direction:ltr; font-family: ui-monospace, monospace; font-size: 14px; }
.empty { color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>בדיקת ניקוד</h1>
<p class="intro">כל מילה שהמנקדים לא הסכימו עליה מופיעה כאן בתוך המשפט שלה, עם שלוש הגרסאות וההכרעה והנימוק. אחרי הקריאה מסמנים "בדקתי". אם משהו נראה לא נכון מסמנים "יש כאן בעיה" וכותבים הערה. בסוף לוחצים "ייצוא" ומעתיקים את מה שמופיע. הסימונים נשמרים בדפדפן הזה בלבד.</p>
<div class="stats">
  <div class="stat"><b>${stats.strings}</b>מחרוזות</div>
  <div class="stat"><b>${stats.words}</b>מילים</div>
  <div class="stat"><b>${stats.agreementPct ?? '—'}%</b>הסכמה מלאה</div>
  <div class="stat"><b>${disagreements.length}</b>מילים שהוכרעו</div>
  <div class="stat"><b>${lintSummary.errors}</b>שגיאות בדיקה</div>
  <div class="stat"><b>${lintSummary.warnings}</b>אזהרות</div>
  <div class="stat"><b id="progress">0</b>סומנו כבדוקים</div>
</div>
<p class="intro" style="font-size:15px">נוצר ב־${esc(generatedAt)} · מנקדים: ${vocIds.map((v) => esc(VOC_LABEL[v] || v)).join(', ')}</p>
<h2>מילים שהוכרעו (${disagreements.length})</h2>
${cards || '<p class="empty">אין מחלוקות.</p>'}
<h2>קטעים לקריאה מלאה (מדגם אקראי של 10%)</h2>
${passageHtml || '<p class="empty">אין קטעי קריאה בתוכן הזה.</p>'}
</main>
<div class="export">
  <button id="exportBtn">ייצוא הסימונים (JSON)</button>
  <button id="copyBtn" class="secondary">העתקה</button>
  <span id="flagCount"></span>
  <textarea id="exportBox" readonly></textarea>
</div>
<script>
(function () {
  var KEY = ${JSON.stringify(pageKey)};
  var state = { checked: {}, flagged: {}, notes: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) state = Object.assign(state, JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  function paint() {
    var done = 0, flagged = 0;
    cards.forEach(function (c) {
      var id = c.getAttribute('data-id');
      c.classList.toggle('is-checked', !!state.checked[id] && !state.flagged[id]);
      c.classList.toggle('is-flagged', !!state.flagged[id]);
      if (state.checked[id]) done++;
      if (state.flagged[id]) flagged++;
    });
    document.getElementById('progress').textContent = done + '/' + cards.length;
    document.getElementById('flagCount').textContent = flagged ? ('מסומנים כבעיה: ' + flagged) : '';
  }
  cards.forEach(function (c) {
    var id = c.getAttribute('data-id');
    var chk = c.querySelector('[data-role=checked]'), flg = c.querySelector('[data-role=flagged]'), note = c.querySelector('[data-role=note]');
    chk.checked = !!state.checked[id]; flg.checked = !!state.flagged[id]; note.value = state.notes[id] || '';
    chk.addEventListener('change', function () { state.checked[id] = chk.checked; save(); paint(); });
    flg.addEventListener('change', function () { state.flagged[id] = flg.checked; if (flg.checked) { state.checked[id] = true; chk.checked = true; } save(); paint(); });
    note.addEventListener('input', function () { state.notes[id] = note.value; save(); });
  });
  function exportJson() {
    var out = cards.filter(function (c) { var id = c.getAttribute('data-id'); return state.flagged[id] || (state.notes[id] || '').trim(); })
      .map(function (c) { var id = c.getAttribute('data-id'); return { id: id, kind: c.getAttribute('data-kind'), label: c.getAttribute('data-label'), flagged: !!state.flagged[id], note: state.notes[id] || '' }; });
    var box = document.getElementById('exportBox');
    box.style.display = 'block';
    box.value = JSON.stringify({ reviewed: Object.keys(state.checked).filter(function (k) { return state.checked[k]; }).length, total: cards.length, items: out }, null, 2);
    return box;
  }
  document.getElementById('exportBtn').addEventListener('click', exportJson);
  document.getElementById('copyBtn').addEventListener('click', function () {
    var box = exportJson(); box.select();
    try { navigator.clipboard.writeText(box.value); } catch (e) { try { document.execCommand('copy'); } catch (e2) {} }
  });
  paint();
})();
</script>
</body>
</html>
`;
}
