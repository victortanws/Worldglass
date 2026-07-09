const reading = document.getElementById('reading');
const savedList = document.getElementById('saved-list');
const exportBtn = document.getElementById('export');

const script = document.getElementById('script');

chrome.storage.local.get({ zhxReading: 'man', zhxScript: 'auto' }).then((cfg) => {
  reading.value = cfg.zhxReading;
  script.value = cfg.zhxScript;
});
reading.addEventListener('change', () => chrome.storage.local.set({ zhxReading: reading.value }));
script.addEventListener('change', () => chrome.storage.local.set({ zhxScript: script.value }));

async function renderSaved() {
  const { zhxSaved = {} } = await chrome.storage.local.get('zhxSaved');
  const words = Object.entries(zhxSaved).sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0));
  savedList.textContent = '';
  exportBtn.style.display = words.length ? '' : 'none';
  if (!words.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No saved words yet';
    savedList.appendChild(li);
    return;
  }
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
    li.append(w, p, d, del);
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
