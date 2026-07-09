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

  function startSnip() {
    if (overlay) return;
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
    hint.textContent = 'Recognizing…';
    try {
      const image = await cropRegion(rect);
      const text = await recognize(image, rect);
      endSnip();
      if (text) {
        window.dispatchEvent(new CustomEvent(OCR.eventName, { detail: { text, rect } }));
      }
    } catch (err) {
      if (hint) {
        hint.textContent = `OCR failed: ${err.message}`;
        setTimeout(endSnip, 1800);
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'startSnip') startSnip();
  });
})();
