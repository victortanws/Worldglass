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
      // Preprocessing tournament (see ocr-prep.js): several normalisations of the crop
      // compete and the most confident reading wins, where confidence is discounted for
      // answers outside the expected script. Raw crops of stylized or low-contrast text
      // used to go straight to the engine and come back as high-confidence garbage.
      const best = await self.WG_OCR_PREP.recognizeBest(msg.image, msg.lang, async (img, psm) => {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await worker.recognize(img);
        return { text: data.text, confidence: data.confidence };
      });
      sendResponse({ text: best.text, confidence: best.confidence, effective: best.effective, variant: best.variant });
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
