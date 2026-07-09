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
  if (msg?.target !== 'offscreen' || msg.type !== 'ocrRecognize') return false;
  (async () => {
    const worker = await getWorker(msg.lang);
    await worker.setParameters({ tessedit_pageseg_mode: msg.psm ?? '6' });
    const { data } = await worker.recognize(msg.image);
    sendResponse({ text: data.text, confidence: data.confidence });
  })().catch((err) => sendResponse({ error: String(err) }));
  return true;
});
