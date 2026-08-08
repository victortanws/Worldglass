// OCR preprocessing + variant tournament, shared by the offscreen document and the
// demo lab page (which is why nothing in here touches chrome.* or Tesseract directly —
// the caller supplies a `run(imageDataUrl, psm)` function and this module supplies
// judgement).
//
// Why this exists: the snip pipeline fed raw crops straight into the fast-tier LSTM.
// Plain black-on-white text survives that; a glossy slanted title over busy anime art
// does not — 从零开始无限进化 came back as "ETEN 人TI 二ERNRECwena", and the popup then
// presented that garbage as a sentence. Tesseract's own accuracy on hard input improves
// dramatically when the image is normalised first (upscaled, contrast-stretched,
// binarised at the right polarity), and which normalisation wins depends on the image —
// so several variants compete and the most CONFIDENT reading is kept, where confidence
// is Tesseract's estimate discounted by how much of the result is in the script the
// caller expected. A chi_sim run that answers in Latin letters is not a confident
// reading of Chinese, whatever the engine thinks of it.
'use strict';

self.WG_OCR_PREP = (() => {
  // ---- pixel plumbing -------------------------------------------------------------
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  async function canvasToDataUrl(c) {
    if (c.convertToBlob) {
      const blob = await c.convertToBlob({ type: 'image/png' });
      return await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
    }
    return c.toDataURL('image/png');
  }

  async function decode(src) {
    if (typeof createImageBitmap !== 'undefined' && typeof fetch !== 'undefined') {
      const blob = await (await fetch(src)).blob();
      return await createImageBitmap(blob);
    }
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  // Tesseract's LSTM reads best around 30–60px glyph height. A watermark cropped at
  // 45px total, or dense small print, sits below that; upscale (bicubic via canvas)
  // until the crop is at least ~110px tall, capped so huge crops don't balloon.
  const MIN_H = 110, MAX_SCALE = 4, MAX_W = 2000;

  async function toImageData(src) {
    const img = await decode(src);
    const w0 = img.naturalWidth ?? img.width;
    const h0 = img.naturalHeight ?? img.height;
    let scale = Math.min(Math.max(1, MIN_H / h0), MAX_SCALE, MAX_W / w0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return { ctx, canvas: c, data: ctx.getImageData(0, 0, w, h), w, h };
  }

  // ---- grayscale + statistics -----------------------------------------------------
  function luminance(imageData) {
    const { data } = imageData;
    const g = new Uint8ClampedArray(data.length / 4);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      g[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    }
    return g;
  }

  // Stretch the middle of the histogram to full range; the 2%/98% clip keeps a few
  // outlier pixels (JPEG ringing, antialiased edges) from wasting the dynamic range.
  function stretch(g) {
    const hist = new Uint32Array(256);
    for (const v of g) hist[v]++;
    const total = g.length;
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
    const span = Math.max(1, hi - lo);
    const out = new Uint8ClampedArray(g.length);
    for (let i = 0; i < g.length; i++) out[i] = ((g[i] - lo) * 255) / span;
    return out;
  }

  function otsu(g) {
    const hist = new Uint32Array(256);
    for (const v of g) hist[v]++;
    const total = g.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; threshold = t; }
    }
    return threshold;
  }

  function grayToImage(ctx, g, w, h, map) {
    const out = ctx.createImageData(w, h);
    for (let j = 0, i = 0; j < g.length; j++, i += 4) {
      const v = map(g[j], j);
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    return out;
  }

  // Local-mean (Bradley) threshold via an integral image: handles the case a single
  // global threshold cannot — text over a background whose brightness drifts, like a
  // gradient poster or a photo.
  function adaptiveMask(g, w, h) {
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += g[y * w + x];
        integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
      }
    }
    const win = Math.max(8, Math.round(Math.min(w, h) / 6));
    const mask = new Uint8Array(g.length);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - win), y1 = Math.min(h - 1, y + win);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - win), x1 = Math.min(w - 1, x + win);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const s = integral[(y1 + 1) * (w + 1) + (x1 + 1)] - integral[y0 * (w + 1) + (x1 + 1)]
          - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
        mask[y * w + x] = g[y * w + x] * area <= s * 0.88 ? 1 : 0; // 1 = darker than surroundings
      }
    }
    return mask;
  }

  // Remove foreground blobs that TOUCH THE IMAGE BORDER. In a snip of text over art,
  // the lettering is what the user centred; the background art almost always runs off
  // the edges. Flood-filling those components away turns "glyphs plus art noise" into
  // just glyphs. If clearing would delete nearly everything, the text itself touches
  // the border (tight crop) — keep the original rather than destroy it.
  function clearBorder(mask, w, h) {
    const out = mask.slice();
    const stack = [];
    for (let x = 0; x < w; x++) { if (out[x]) stack.push(x); if (out[(h - 1) * w + x]) stack.push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { if (out[y * w]) stack.push(y * w); if (out[y * w + w - 1]) stack.push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (!out[i]) continue;
      out[i] = 0;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    let before = 0, after = 0;
    for (let i = 0; i < mask.length; i++) { before += mask[i]; after += out[i]; }
    return after >= before * 0.12 ? out : mask;
  }

  // Fill enclosed holes: pixels the border-connected BACKGROUND cannot reach are inside
  // something, and for text that something is a glyph. Outlined display faces binarize
  // to hollow double-strokes that the LSTM reads as noise; hole-filling turns them into
  // the solid strokes it was trained on.
  function fillHoles(mask, w, h) {
    const bg = new Uint8Array(mask.length); // 1 = reachable background
    const stack = [];
    const push = (i) => { if (!mask[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = bg[i] ? 0 : 1;
    return out;
  }

  // Undo italic shear. Display faces lean 10–20°; Tesseract tolerates ~3°. Shearing the
  // binarised image back upright is cheap and reversible, and a wrong guess just loses
  // the tournament to the unsheared variant.
  async function shear(canvas, w, h, shx) {
    const pad = Math.ceil(Math.abs(shx) * h);
    const c2 = makeCanvas(w + pad, h);
    const ctx2 = c2.getContext('2d');
    ctx2.fillStyle = '#fff';
    ctx2.fillRect(0, 0, c2.width, c2.height);
    ctx2.setTransform(1, 0, shx, 1, shx < 0 ? pad : 0, 0);
    ctx2.drawImage(canvas, 0, 0);
    return await canvasToDataUrl(c2);
  }

  // ---- the variants ---------------------------------------------------------------
  // Each is a genuinely different hypothesis about what kind of image this is:
  //   up        "it's already readable, just maybe small/low-contrast"
  //   bin       "dark text on a light background"
  //   bin-inv   "light text on a dark background" (the anime-title case)
  //   adaptive  "text over a drifting background a global threshold can't split"
  async function variants(src) {
    const { ctx, canvas, data, w, h } = await toImageData(src);
    const g = stretch(luminance(data));
    const t = otsu(g);
    const out = [];

    ctx.putImageData(grayToImage(ctx, g, w, h, (v) => v), 0, 0);
    out.push({ label: 'up', dataUrl: await canvasToDataUrl(canvas) });

    // Both polarities: "dark text on light" and "light text on dark" are separate
    // hypotheses, each border-cleared and each offered upright and de-italicised.
    for (const [label, fg] of [['bin', (v) => v <= t], ['bin-inv', (v) => v > t]]) {
      const mask = new Uint8Array(g.length);
      for (let i = 0; i < g.length; i++) mask[i] = fg(g[i]) ? 1 : 0;
      const cleared = clearBorder(mask, w, h);
      ctx.putImageData(grayToImage(ctx, g, w, h, (_, j) => (cleared[j] ? 0 : 255)), 0, 0);
      out.push({ label, dataUrl: await canvasToDataUrl(canvas) });
      out.push({ label: label + '-shear', dataUrl: await shear(canvas, w, h, -0.25) });
      const solid = fillHoles(cleared, w, h);
      ctx.putImageData(grayToImage(ctx, g, w, h, (_, j) => (solid[j] ? 0 : 255)), 0, 0);
      out.push({ label: label + '-solid', dataUrl: await canvasToDataUrl(canvas) });
      out.push({ label: label + '-solid-shear', dataUrl: await shear(canvas, w, h, -0.25) });
    }

    const mask = adaptiveMask(g, w, h);
    const cleared = clearBorder(mask, w, h);
    ctx.putImageData(grayToImage(ctx, g, w, h, (_, j) => (cleared[j] ? 0 : 255)), 0, 0);
    out.push({ label: 'adaptive', dataUrl: await canvasToDataUrl(canvas) });

    return { list: out, h };
  }

  // ---- script sanity --------------------------------------------------------------
  const SCRIPT_RE = {
    han: /[㐀-䶿一-鿿]/, kana: /[぀-ゟ゠-ヿ㐀-䶿一-鿿]/, hangul: /[가-힣]/,
    arabic: /[؀-ۿ]/, hebrew: /[֐-׿]/, latin: /[A-Za-zÀ-ÿ]/,
  };
  const LANG_SCRIPT = {
    chi_sim: 'han', chi_tra: 'han', jpn: 'kana', jpn_vert: 'kana', kor: 'hangul',
    ara: 'arabic', heb: 'hebrew', fra: 'latin', deu: 'latin', spa: 'latin', msa: 'latin',
  };

  // Tesseract will happily "read" Chinese as Latin gibberish and still report decent
  // confidence. Discount its score by the share of letters actually in the expected
  // script, so a wrong-script reading can never beat a right-script one.
  function scriptFactor(text, lang) {
    const script = LANG_SCRIPT[lang];
    if (!script) return 1;
    const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
    if (!letters.length) return 0;
    const match = letters.filter((ch) => SCRIPT_RE[script].test(ch)).length;
    return 0.35 + 0.65 * (match / letters.length);
  }

  // ---- the tournament -------------------------------------------------------------
  // `run(dataUrl, psm)` → { text, confidence } is supplied by the caller.
  // Sequential with early exit: plain text costs one recognition, hard text costs up
  // to eight, and the user is already watching a "Recognizing…" hint.
  async function recognizeBest(src, lang, run) {
    const { list, h } = await variants(src);
    // A short crop is probably a single line; telling Tesseract so (psm 7) stops it
    // from hunting for paragraphs that aren't there.
    const psms = h <= 130 ? ['7', '6'] : ['6', '7'];
    const started = Date.now();
    let best = { text: '', confidence: 0, effective: 0, variant: 'none', psm: '6' };
    for (const psm of psms) {
      for (const v of list) {
        // Time budget: a decent reading in hand ends the hunt sooner; either way the
        // snip never stalls past ~15s on an image that is simply unreadable.
        const elapsed = Date.now() - started;
        if (elapsed > 15000 || (elapsed > 8000 && best.effective >= 55)) return best;
        // Hopeless-case bail: if half the budget is gone and nothing has come close to
        // readable, the remaining variants rarely rescue it — refuse quickly instead of
        // making the user watch a spinner for a failure.
        if (elapsed > 6000 && best.effective < 30) return best;
        let r;
        try { r = await run(v.dataUrl, psm); } catch { continue; }
        const text = (r.text ?? '').trim();
        const effective = text ? (r.confidence ?? 0) * scriptFactor(text, lang) : 0;
        if (effective > best.effective) best = { text, confidence: r.confidence ?? 0, effective, variant: v.label + '/' + psm, psm };
        if (best.effective >= 88) return best;
      }
    }
    return best;
  }

  return { variants, recognizeBest, scriptFactor };
})();
