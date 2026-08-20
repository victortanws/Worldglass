const reading = document.getElementById('reading');
const savedList = document.getElementById('saved-list');
const exportBtn = document.getElementById('export');

const script = document.getElementById('script');
const fabToggle = document.getElementById('fab');
const textSize = document.getElementById('textsize');

chrome.storage.local.get({ zhxReading: 'man', zhxScript: 'auto', zhxFab: true, zhxTextSize: 1 }).then((cfg) => {
  reading.value = cfg.zhxReading;
  script.value = cfg.zhxScript;
  fabToggle.checked = cfg.zhxFab !== false;
  textSize.value = String(cfg.zhxTextSize ?? 1);
});
reading.addEventListener('change', () => chrome.storage.local.set({ zhxReading: reading.value }));
script.addEventListener('change', () => chrome.storage.local.set({ zhxScript: script.value }));
fabToggle.addEventListener('change', () => chrome.storage.local.set({ zhxFab: fabToggle.checked }));
textSize.addEventListener('change', () => chrome.storage.local.set({ zhxTextSize: Number(textSize.value) }));

// Switching language on a popup is remembered for that site; show it here so the choice
// is visible and reversible rather than a mystery that follows you around.
const LANG_NAMES = { zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', jawi: 'Jawi', he: 'Hebrew', fr: 'French', de: 'German', es: 'Spanish', ms: 'Malay' };
const siteRow = document.getElementById('site-row');
const siteLangEl = document.getElementById('site-lang');
let siteHost = null;
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { siteHost = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return; }
  const { zhxSiteLang = {} } = await chrome.storage.local.get('zhxSiteLang');
  const pref = zhxSiteLang[siteHost];
  if (!pref) return;
  siteLangEl.textContent = `${siteHost}: always ${LANG_NAMES[pref] ?? pref}`;
  siteRow.style.display = '';
})();
document.getElementById('site-clear').addEventListener('click', async () => {
  const { zhxSiteLang = {} } = await chrome.storage.local.get('zhxSiteLang');
  delete zhxSiteLang[siteHost];
  await chrome.storage.local.set({ zhxSiteLang });
  siteRow.style.display = 'none';
});

// The tally is the reader's, so they can see all of it and delete it in one click. A count
// kept where its owner cannot read it is not a private record, it is just an unadvertised
// one. Nothing here has ever left the device.
const statsEl = document.getElementById('stats');
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function renderStats() {
  const { zhxStats } = await chrome.storage.local.get('zhxStats');
  statsEl.textContent = '';
  if (!zhxStats?.days) {
    statsEl.innerHTML = '<span class="priv">Nothing recorded yet. Worldglass keeps a private count of your own reading, on this device only — never sent anywhere.</span>';
    return;
  }
  const days = zhxStats.days;
  let sel = 0, look = 0, save = 0, rev = 0, ocr = 0;
  for (const d of Object.values(days)) {
    sel += d.sel ?? 0; look += d.look ?? 0; save += d.save ?? 0; rev += d.rev ?? 0; ocr += d.ocr ?? 0;
  }
  // "Active days in the last 7" is the honest week-4 retention question, asked locally.
  const week = [];
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); week.push(dayKey(d)); }
  const activeWeek = week.filter((k) => days[k]).length;
  const totalDays = Object.keys(days).length;
  const line = document.createElement('div');
  line.innerHTML = `Read on <b>${activeWeek}</b> of the last 7 days · <b>${totalDays}</b> ${totalDays === 1 ? 'day' : 'days'} in total`;
  const line2 = document.createElement('div');
  line2.innerHTML = `<b>${sel}</b> selections · <b>${look}</b> word lookups · <b>${save}</b> saved`
    + (rev ? ` · <b>${rev}</b> reviewed` : '') + (ocr ? ` · <b>${ocr}</b> image reads` : '');
  const priv = document.createElement('span');
  priv.className = 'priv';
  priv.textContent = `Counted on this device since ${zhxStats.first ?? '—'}. Never transmitted. `;
  const del = document.createElement('button');
  del.className = 'link';
  del.textContent = 'Delete this history';
  del.addEventListener('click', async () => {
    await chrome.storage.local.remove('zhxStats');
    renderStats();
  });
  priv.appendChild(del);
  statsEl.append(line, line2, priv);
}

const shelvesEl = document.getElementById('shelves');
const reviewBtn = document.getElementById('review');
const WG_KNOWN = 4;
const wgState = (e) => ((e.box ?? 1) >= WG_KNOWN ? 'known' : (e.correct ?? 0) >= 1 ? 'learning' : 'new');

reviewBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: 'startReview' }).catch(() => {});
  window.close();
});

async function renderSaved() {
  const { zhxSaved = {} } = await chrome.storage.local.get('zhxSaved');
  const words = Object.entries(zhxSaved).sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0));
  savedList.textContent = '';
  shelvesEl.textContent = '';
  exportBtn.style.display = words.length ? '' : 'none';
  if (!words.length) {
    reviewBtn.style.display = 'none';
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No saved words yet — select a word on any page and tap ☆ to start your collection.';
    savedList.appendChild(li);
    return;
  }
  // Shelves mirror competence (no points): learning / known-by-heart, plus how many are due.
  const now = Date.now();
  const counts = { new: 0, learning: 0, known: 0, due: 0 };
  // Must agree with wgDue in content.js: a word with no definition is collectable but can
  // never be a review card, because the forced-choice question would have no right answer.
  // Counting it here would promise a review the engine then refuses to serve.
  for (const [, e] of words) { counts[wgState(e)]++; if (e.d && (e.due ?? 0) <= now) counts.due++; }
  const shelves = [
    ['learning', 'learning', counts.new + counts.learning],
    ['known', 'known by heart', counts.known],
    ['due', 'ready to review', counts.due],
  ];
  for (const [key, label, value] of shelves) {
    const d = document.createElement('div');
    d.className = 'shelf ' + key;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = value;
    const l = document.createElement('span'); l.className = 'l'; l.textContent = label;
    d.append(n, l);
    shelvesEl.appendChild(d);
  }
  reviewBtn.style.display = counts.due >= 1 ? '' : 'none';
  reviewBtn.textContent = counts.due >= 1 ? `Review now (${counts.due})` : 'Review now';
  for (const [word, info] of words) {
    const li = document.createElement('li');
    const w = document.createElement('span'); w.className = 'w'; w.textContent = word;
    const p = document.createElement('span'); p.className = 'p'; p.textContent = info.p ?? '';
    const d = document.createElement('span'); d.className = 'd'; d.textContent = info.d ?? ''; d.title = info.d ?? '';
    const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Remove';
    del.addEventListener('click', async () => {
      const { zhxSaved = {} } = await chrome.storage.local.get('zhxSaved');
      delete zhxSaved[word];
      await chrome.storage.local.set({ zhxSaved });
      renderSaved();
    });
    const st = document.createElement('span');
    st.className = 'st ' + wgState(info);
    st.textContent = wgState(info) === 'known' ? '🌱' : '';
    st.title = wgState(info) === 'known' ? 'Known by heart' : '';
    li.append(w, p, d, st, del);
    savedList.appendChild(li);
  }
}

exportBtn.addEventListener('click', async () => {
  const { zhxSaved = {} } = await chrome.storage.local.get('zhxSaved');
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  // Carry the sentence and the language, not just three bare columns. A card that shows
  // the word in the sentence you actually met it in is the whole point of sentence mining,
  // and the language column is what lets a multi-language deck be split after import.
  const header = ['word', 'reading', 'meaning', 'sentence', 'language'].join(',');
  const rows = Object.entries(zhxSaved)
    .sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0))
    .map(([w, i]) => [esc(w), esc(i.p), esc(i.d), esc(i.ctx), esc(i.lang)].join(','));
  const csv = [header, ...rows].join('\n');
  await navigator.clipboard.writeText(csv);
  exportBtn.textContent = 'Copied';
  setTimeout(() => { exportBtn.textContent = 'Copy as CSV (Anki)'; }, 1500);
});

document.getElementById('ocr').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: 'startSnip' }).catch(() => {});
  window.close();
});

renderSaved();
renderStats();
