const reading = document.getElementById('reading');
const savedList = document.getElementById('saved-list');
const exportBtn = document.getElementById('export');

const script = document.getElementById('script');
const fabToggle = document.getElementById('fab');

chrome.storage.local.get({ zhxReading: 'man', zhxScript: 'auto', zhxFab: true }).then((cfg) => {
  reading.value = cfg.zhxReading;
  script.value = cfg.zhxScript;
  fabToggle.checked = cfg.zhxFab !== false;
});
reading.addEventListener('change', () => chrome.storage.local.set({ zhxReading: reading.value }));
script.addEventListener('change', () => chrome.storage.local.set({ zhxScript: script.value }));
fabToggle.addEventListener('change', () => chrome.storage.local.set({ zhxFab: fabToggle.checked }));

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
  for (const [, e] of words) { counts[wgState(e)]++; if ((e.due ?? 0) <= now) counts.due++; }
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
  const csv = Object.entries(zhxSaved).map(([w, i]) => [esc(w), esc(i.p), esc(i.d)].join(',')).join('\n');
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
