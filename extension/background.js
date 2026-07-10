// Unified Lens service worker.
// All language handler modules are imported at startup (their code is tiny);
// each module lazy-loads its own dictionary data only when first used, so memory
// stays bounded to the languages actually exercised.
importScripts('lens-core.js', 'lens-langs.js');

let offscreenReady = null;
function ensureOffscreen() {
  offscreenReady ??= (async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: 'ocr/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Runs the Tesseract OCR engine, which needs a document context for web workers',
      });
    }
  })();
  return offscreenReady;
}

// OCR snip is reachable three ways besides the toolbar popup: the page's floating button
// (relaySnip below), a right-click context menu, and a keyboard shortcut (Alt+Shift+O).
function startSnipIn(tabId) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'startSnip' }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus.create({
      id: 'wg-snip',
      title: 'Worldglass: read text in an image (OCR)',
      contexts: ['page', 'image', 'selection'],
    });
  });
});
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wg-snip') startSnipIn(tab?.id);
});
chrome.commands?.onCommand.addListener((cmd) => {
  if (cmd !== 'start-ocr-snip') return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => startSnipIn(tab?.id));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false;

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
  if (msg?.type === 'ocrRecognize') {
    ensureOffscreen()
      .then(() => chrome.runtime.sendMessage({ ...msg, target: 'offscreen' }))
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  // Dictionary operations are routed by detected language.
  const code = msg?.lang ?? 'zh';
  const mod = self.LENS.get(code);
  if (!mod) { sendResponse({ error: `no language module: ${code}` }); return true; }
  mod.handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});
