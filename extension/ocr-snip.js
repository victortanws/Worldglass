(() => {
  'use strict';
  if (window.__zhxSnipLoaded) return;
  window.__zhxSnipLoaded = true;

  const OCR_MODELS = {
    zh: ['chi_sim', 'chi_tra'], ja: ['jpn', 'jpn_vert'], ko: ['kor'],
    ar: ['ara'], jawi: ['ara'], he: ['heb'],
    fr: ['fra'], de: ['deu'], es: ['spa'], ms: ['msa'],
  };
  const SPACED = new Set(['fr', 'de', 'es', 'ms']); // Latin scripts keep spaces between words

  function pageLangGuess() {
    const D = self.LensDetect;
    const hint = D && D.pageHint ? D.pageHint(document.documentElement.lang) : null;
    if (hint && OCR_MODELS[hint]) return hint;
    const sample = (document.body && document.body.innerText || '').slice(0, 600);
    const d = D && D.detect ? D.detect(sample.slice(0, 120), sample, document.documentElement.lang) : null;
    return (d && d.supported && OCR_MODELS[d.lang]) ? d.lang : 'zh';
  }

  const OCR = {
    eventName: 'zhx-ocr-open',
    hint: 'Drag a box over text in an image — Esc cancels',
    _lang: 'zh',
    pickLang(rect) {
      this._lang = pageLangGuess();
      const models = OCR_MODELS[this._lang] || ['chi_sim'];
      if (this._lang === 'ja' && rect.height > rect.width * 1.3) return { lang: 'jpn_vert', psm: '5' };
      return { lang: models[0], psm: '6' };
    },
    retryLang(rect, tried) {
      const models = OCR_MODELS[this._lang] || ['chi_sim', 'chi_tra'];
      const next = models.find((m) => m !== tried);
      return next ? { lang: next, psm: this._lang === 'ja' && next === 'jpn_vert' ? '5' : '6' } : null;
    },
    clean(text) {
      return SPACED.has(this._lang) ? text.replace(/\s+/g, ' ').trim() : text.replace(/\s+/g, '');
    },
  };

  let overlay = null;
  let box = null;
  let hint = null;
  let dragging = false;
  let busy = false;
  let sx = 0;
  let sy = 0;

  // Real, selectable text under the snip box. The snip isn't only for images: dragging a
  // box over ordinary page text reads it directly — instant, exact, and immune to OCR
  // failures. Characters are included when their box centre falls inside the selection.
  function domTextIn(rect) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el) continue;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'RT' || tag === 'RP') continue;
      range.selectNodeContents(n);
      const nb = range.getBoundingClientRect();
      if (!nb.width || nb.right < rect.left || nb.left > rect.right || nb.bottom < rect.top || nb.top > rect.bottom) continue;
      let piece = '';
      for (let i = 0; i < n.nodeValue.length; i++) {
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const cb = range.getBoundingClientRect();
        const cx = cb.left + cb.width / 2;
        const cy = cb.top + cb.height / 2;
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) piece += n.nodeValue[i];
        else if (piece && !piece.endsWith(' ')) piece += ' ';
      }
      if (piece.trim()) parts.push(piece.trim());
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function startSnip() {
    if (overlay) return;
    // Warm the OCR engine while the user drags — the wasm + model load takes seconds cold,
    // so recognition should be ready the moment the box is released.
    const guess = OCR.pickLang({ width: 2, height: 1 });
    chrome.runtime.sendMessage({ type: 'ocrWarm', lang: guess.lang }).catch(() => {});
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.08);';
    hint = document.createElement('div');
    hint.textContent = OCR.hint;
    hint.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1f1e1c;color:#fff;font:13px/1.4 -apple-system,sans-serif;padding:6px 14px;border-radius:8px;pointer-events:none;';
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px solid #4a86c9;background:rgba(90,140,220,0.15);display:none;pointer-events:none;';
    overlay.append(hint, box);
    overlay.addEventListener('mousedown', onDown);
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseup', onUp);
    document.documentElement.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
  }

  function endSnip() {
    overlay?.remove();
    overlay = null;
    box = null;
    hint = null;
    dragging = false;
    busy = false;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); endSnip(); }
  }

  function onDown(ev) {
    if (busy) return;
    dragging = true;
    sx = ev.clientX;
    sy = ev.clientY;
    box.style.display = 'block';
    setBox(ev);
    ev.preventDefault();
  }

  function setBox(ev) {
    const left = Math.min(sx, ev.clientX);
    const top = Math.min(sy, ev.clientY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${Math.abs(ev.clientX - sx)}px`;
    box.style.height = `${Math.abs(ev.clientY - sy)}px`;
  }

  function onMove(ev) {
    if (dragging) setBox(ev);
  }

  function cropFromImg(img, rect) {
    try {
      const r = img.getBoundingClientRect();
      const scaleX = img.naturalWidth / r.width;
      const scaleY = img.naturalHeight / r.height;
      const up = rect.width * scaleX < 320 ? 2 : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * scaleX * up));
      canvas.height = Math.max(1, Math.round(rect.height * scaleY * up));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        (rect.left - r.left) * scaleX, (rect.top - r.top) * scaleY,
        rect.width * scaleX, rect.height * scaleY,
        0, 0, canvas.width, canvas.height,
      );
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function cropFromDataUrl(dataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('capture decode failed'));
      img.src = dataUrl;
    });
  }

  async function cropRegion(rect) {
    overlay.style.display = 'none';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const img = el?.closest?.('img');
      if (img && img.complete) {
        const url = cropFromImg(img, rect);
        if (url) return url;
      }
      const shot = await chrome.runtime.sendMessage({ type: 'ocrCapture' });
      if (!shot || shot.error || !shot.dataUrl) throw new Error(shot?.error ?? 'screen capture unavailable');
      return await cropFromDataUrl(shot.dataUrl, rect, window.devicePixelRatio || 1);
    } finally {
      if (overlay) {
        overlay.style.display = '';
        box.style.display = 'none';
      }
    }
  }

  async function recognize(image, rect) {
    const first = OCR.pickLang(rect);
    let res = await chrome.runtime.sendMessage({ type: 'ocrRecognize', image, lang: first.lang, psm: first.psm });
    if (res?.error) throw new Error(res.error);
    if ((res.confidence ?? 100) < 50) {
      const retry = OCR.retryLang(rect, first.lang);
      if (retry) {
        const res2 = await chrome.runtime.sendMessage({ type: 'ocrRecognize', image, lang: retry.lang, psm: retry.psm });
        if (!res2?.error && (res2.confidence ?? 0) > (res.confidence ?? 0)) res = res2;
      }
    }
    return OCR.clean(res.text ?? '');
  }

  async function onUp(ev) {
    if (!dragging || busy) return;
    dragging = false;
    const rect = {
      left: Math.min(sx, ev.clientX),
      top: Math.min(sy, ev.clientY),
      width: Math.abs(ev.clientX - sx),
      height: Math.abs(ev.clientY - sy),
    };
    rect.right = rect.left + rect.width;
    rect.bottom = rect.top + rect.height;
    if (rect.width < 12 || rect.height < 12) { endSnip(); return; }
    busy = true;
    hint.textContent = 'Reading…';
    try {
      // Real DOM text under the box wins: instant and exact. OCR only runs when the
      // region holds no selectable text (an image, canvas, or video frame).
      const domText = domTextIn(rect);
      if (domText.length >= 2) {
        endSnip();
        window.dispatchEvent(new CustomEvent(OCR.eventName, { detail: { text: domText, rect } }));
        return;
      }
      hint.textContent = 'Recognizing…';
      const image = await cropRegion(rect);
      const text = await recognize(image, rect);
      endSnip();
      if (text) {
        window.dispatchEvent(new CustomEvent(OCR.eventName, { detail: { text, rect } }));
      }
    } catch (err) {
      if (hint) {
        hint.textContent = `Couldn't read that area (${err.message}). Real page text still works — try dragging over the text itself.`;
        setTimeout(endSnip, 3000);
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'startSnip') startSnip();
  });
})();
