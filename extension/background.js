// Worldglass service worker — a thin router. Dictionaries and the OCR engine live in the
// offscreen document (see offscreen.js): the worker is killed after ~30s idle, and
// re-parsing 250 MB of dictionaries on every wake made the first lookup after a pause
// crawl. The offscreen document persists, so everything stays warm.

let offscreenReady = null;
function ensureOffscreen() {
  offscreenReady ??= (async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: 'ocr/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Hosts the dictionary engines and the Tesseract OCR engine, which need a persistent document context',
      });
    }
  })();
  return offscreenReady;
}

// OCR snip is reachable four ways: the toolbar popup, the page's floating button
// (relaySnip below), a right-click context menu, and a keyboard shortcut (Alt+Shift+O).
function startSnipIn(tabId) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'startSnip' }).catch(() => {});
}
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus.create({
      id: 'wg-snip',
      title: 'Worldglass: read text in an image (OCR)',
      contexts: ['page', 'image', 'selection'],
    });
  });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => {});
  }
});
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wg-snip') startSnipIn(tab?.id);
});
chrome.commands?.onCommand.addListener((cmd) => {
  if (cmd !== 'start-ocr-snip') return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => startSnipIn(tab?.id));
});

// ---------- Local usage counting ----------
// Worldglass records nothing about you and sends nothing anywhere. This is a private
// tally, on your own machine, that you can read in the toolbar and delete in one click —
// it exists so the question "am I actually still using this?" has an answer that is not a
// guess, and so shipping decisions rest on something real.
//
// It lives in the SERVICE WORKER and nowhere else, deliberately. The content script runs
// in every frame (all_frames: true — embedded tweets, comment widgets, ad iframes), and a
// read-modify-write racing across frames silently loses counts on exactly the busy pages
// where someone reads most. The worker is a single instance; the promise chain below
// serialises writes inside it.
const WG_STAT_DAYS = 120;   // a rolling window, not a permanent history
const WG_SEEN_CAP = 4000;   // prune one-off words before this becomes a browsing record
let wgStatQueue = Promise.resolve();

function wgToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bumpStat(kind, word) {
  wgStatQueue = wgStatQueue.then(async () => {
    const { zhxStats } = await chrome.storage.local.get('zhxStats');
    const st = zhxStats ?? { v: 1, first: wgToday(), days: {}, seen: {} };
    const day = wgToday();
    st.days[day] ??= {};
    st.days[day][kind] = (st.days[day][kind] ?? 0) + 1;
    if (word) st.seen[word] = (st.seen[word] ?? 0) + 1;
    // Keep the window rolling rather than accumulating forever.
    const keep = Object.keys(st.days).sort().slice(-WG_STAT_DAYS);
    if (keep.length < Object.keys(st.days).length) {
      st.days = Object.fromEntries(keep.map((k) => [k, st.days[k]]));
    }
    // A per-word tally of everything ever looked at would amount to a reading history.
    // Words met only once carry no signal worth that, so they go first.
    if (Object.keys(st.seen).length > WG_SEEN_CAP) {
      st.seen = Object.fromEntries(Object.entries(st.seen).filter(([, n]) => n > 1));
    }
    await chrome.storage.local.set({ zhxStats: st });
  }).catch(() => {});
  return wgStatQueue;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false; // offscreen handles it

  if (msg?.type === 'wgStat') {
    bumpStat(msg.kind, msg.word);
    sendResponse({});
    return true;
  }

  if (msg?.type === 'relaySnip') {
    startSnipIn(sender.tab?.id);
    sendResponse({});
    return true;
  }
  if (msg?.type === 'ocrCapture') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  // Everything else — dictionary ops, ocrRecognize, ocrWarm, packStatus — runs in the
  // offscreen document.
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ ...msg, target: 'offscreen' }))
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});
