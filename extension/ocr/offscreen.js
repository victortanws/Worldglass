// Offscreen document: hosts the Tesseract OCR engine AND every dictionary module.
// The MV3 service worker is killed after ~30s idle, which used to mean re-fetching and
// re-parsing dictionaries (Spanish alone is 74 MB) on every wake. This document persists,
// so parsed dictionaries stay warm for the whole browser session. The background worker is
// now just a router.
'use strict';

const workers = new Map();

function getWorker(lang) {
  if (!workers.has(lang)) {
    workers.set(lang, Tesseract.createWorker(lang, 1, {
      workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
      corePath: chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js'),
      langPath: chrome.runtime.getURL('ocr/'),
      gzip: false,
      workerBlobURL: false, // same-origin worker: a blob-origin worker can't importScripts a chrome-extension:// url
    }));
  }
  return workers.get(lang);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;

  if (msg.type === 'ocrRecognize') {
    (async () => {
      const worker = await getWorker(msg.lang);
      await worker.setParameters({ tessedit_pageseg_mode: msg.psm ?? '6' });
      const { data } = await worker.recognize(msg.image);
      sendResponse({ text: data.text, confidence: data.confidence });
    })().catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg.type === 'ocrWarm') {
    // Fired when a snip starts, so the wasm + model are loading while the user drags.
    getWorker(msg.lang).catch(() => {});
    sendResponse({});
    return true;
  }
  if (msg.type === 'packStatus') {
    sendResponse({ state: self.LENS.packState(msg.lang) });
    return true;
  }

  // Dictionary operations, routed by detected language.
  const mod = self.LENS.get(msg.lang ?? 'zh');
  if (!mod) { sendResponse({ error: `no language module: ${msg.lang ?? 'zh'}` }); return true; }
  mod.handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});
