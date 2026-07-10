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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false; // offscreen handles it

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
