(() => {
  'use strict';
  if (window.__zhxLoaded) return;
  window.__zhxLoaded = true;
  window.__zhxVersion = 4;

  const HAN_RE = /[㐀-䶿一-鿿豈-﫿]/;
  const MAX_SELECTION = 300;

  // Per-language display/behaviour metadata. The dictionary logic lives in the
  // worker; this only drives TTS voice, translation source, OCR model, text
  // direction, and the human-readable name shown in the popup header.
  const LANG_META = {
    zh:   { name: 'Chinese',  tts: 'zh-CN', tr: 'zh', ocr: 'chi_sim', dir: 'ltr', readings: true },
    ja:   { name: 'Japanese', tts: 'ja-JP', tr: 'ja', ocr: 'jpn',     dir: 'ltr' },
    ko:   { name: 'Korean',   tts: 'ko-KR', tr: 'ko', ocr: 'kor',     dir: 'ltr' },
    ar:   { name: 'Arabic',   tts: 'ar-SA', tr: 'ar', ocr: 'ara',     dir: 'rtl' },
    jawi: { name: 'Jawi',     tts: 'ms-MY', tr: 'ms', ocr: 'ara',     dir: 'rtl' },
    he:   { name: 'Hebrew',   tts: 'he-IL', tr: 'he', ocr: 'heb',     dir: 'rtl' },
    fr:   { name: 'French',   tts: 'fr-FR', tr: 'fr', ocr: 'fra',     dir: 'ltr' },
    de:   { name: 'German',   tts: 'de-DE', tr: 'de', ocr: 'deu',     dir: 'ltr' },
    es:   { name: 'Spanish',  tts: 'es-ES', tr: 'es', ocr: 'spa',     dir: 'ltr' },
    ms:   { name: 'Malay',    tts: 'ms-MY', tr: 'ms', ocr: 'msa',     dir: 'ltr' },
  };
  const TTS_YUE = { man: 'zh-CN', yue: 'zh-HK', nan: 'zh-TW', teo: 'zh-HK' };

  // Attribution + support links for the unintrusive popup footer.
  const CREDIT = {
    name: 'Victor Tan',
    year: 2026,
    site: 'https://www.victor-tan.com',
    youtube: 'https://www.youtube.com/@VictorTan',
    coffee: 'https://buymeacoffee.com/victortanws',
  };

  // The language of the currently open popup, chosen by the detector per selection.
  let currentLang = 'zh';
  function meta() { return LANG_META[currentLang] ?? LANG_META.zh; }

  const POPUP_CSS = `
    :host { all: initial; }
    .zhx-pop {
      position: absolute; width: 340px; max-width: 92vw; box-sizing: border-box;
      background: #fffdf9; color: #1f1e1c; border: 1px solid #d5d2ca; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,.16);
      font: 14px/1.5 -apple-system, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
      z-index: 2;
    }
    .zhx-pop[data-level="2"] { z-index: 3; width: 320px; background: #ffffff; }
    .hdr { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 6px; border-bottom: 1px solid #ece9e2; }
    .hdr .w { font-size: 22px; font-weight: 600; }
    .hdr .py { color: #3a6ea5; }
    .hdr .var { color: #8a8781; font-size: 13px; }
    .spacer { flex: 1; }
    button.nav { all: unset; cursor: pointer; color: #6b6960; font-size: 14px; padding: 2px 7px; border-radius: 6px; align-self: center; }
    button.nav:hover { background: #f0efe9; }
    .body { padding: 8px 12px 10px; max-height: 320px; overflow: auto; overscroll-behavior: contain; }
    .pyline { color: #3a6ea5; font-size: 13px; margin: 6px 0 2px; }
    ol.defs { margin: 4px 0 8px 18px; padding: 0; }
    ol.defs li { margin: 2px 0; }
    .cl { font-size: 12px; color: #6b6960; margin: 2px 0 6px; }
    .lnk { cursor: pointer; border-radius: 4px; }
    .lnk:hover { background: #e3edfb; }
    ruby { ruby-position: over; }
    ruby rt { font-size: 10px; color: #8a8781; user-select: none; }
    /* CJK wraps naturally between characters; overflow-wrap only kicks in for a run that
       can't fit a line at all. (word-break: break-all butchered alphabetic words mid-word.) */
    .selline { font-size: 21px; line-height: 2.2; overflow-wrap: anywhere; }
    .selline.alpha { font-size: 17px; line-height: 1.85; }
    .selline.alpha[dir="rtl"] { font-size: 20px; line-height: 2; }
    .selline .lnk { padding: 0 1px; }
    .litline { margin: 2px 0 6px; font-size: 12.5px; color: #6b6960; }
    .litline .lab { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #8a8781; margin-right: 6px; }
    .litline .note { display: block; font-style: italic; color: #b07a3a; margin-top: 1px; }
    .rd-row { display: flex; gap: 5px; margin: 0 0 8px; }
    button.rd-chip { all: unset; cursor: pointer; font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid #dcd8cc; color: #6b6960; }
    button.rd-chip:hover { border-color: #3a6ea5; color: #3a6ea5; }
    button.rd-chip.on { background: #e3edfb; border-color: #3a6ea5; color: #3a6ea5; font-weight: 600; }
    .rd-sep { width: 1px; align-self: stretch; margin: 1px 3px; background: #e3dfd2; }
    .hint { font-size: 12px; color: #8a8781; margin-top: 8px; }
    .nf { color: #8a8781; font-style: italic; margin: 6px 0; }
    .chars { display: flex; flex-wrap: wrap; gap: 8px 16px; border-top: 1px solid #ece9e2; padding-top: 8px; margin-top: 6px; }
    .char { max-width: 140px; }
    .char .hz { font-size: 18px; }
    .char .g { font-size: 12px; color: #6b6960; }
    button.fam-toggle { all: unset; cursor: pointer; font-size: 11px; color: #3a6ea5; margin-top: 2px; display: inline-block; }
    button.fam-toggle:hover { text-decoration: underline; }
    .fambox { margin: 6px 0 2px; }
    .fam-h { font-size: 11px; color: #8a8781; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .fam-words { display: flex; flex-direction: column; gap: 3px; }
    .fam-w { cursor: pointer; border-radius: 4px; padding: 1px 3px; font-size: 13px; }
    .fam-w .fw { font-size: 15px; }
    .fam-w .fp { color: #3a6ea5; font-size: 12px; }
    .fam-w .fg { color: #6b6960; font-size: 12px; }
    .badge { font-size: 11px; color: #6b6960; background: #f0efe9; border-radius: 6px; padding: 1px 6px; align-self: center; white-space: nowrap; }
    .exs { border-top: 1px solid #ece9e2; padding-top: 8px; margin-top: 8px; }
    .exs .label { font-size: 11px; color: #8a8781; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
    .ex { margin: 6px 0; }
    .ex .zh { font-size: 17px; line-height: 1.9; }
    .ex .en { font-size: 12px; color: #6b6960; }
    .tr-row { border-top: 1px solid #ece9e2; margin-top: 8px; padding-top: 8px; }
    .tr-out { font-size: 13px; color: #1f1e1c; margin-top: 6px; }
    button.act { all: unset; cursor: pointer; font-size: 12px; color: #3a6ea5; border: 1px solid #c9d8ea; border-radius: 6px; padding: 2px 9px; }
    button.act:hover { background: #e3edfb; }
    button.icon { all: unset; cursor: pointer; font-size: 14px; color: #6b6960; padding: 2px 4px; border-radius: 5px; align-self: center; }
    button.icon:hover { background: #f0efe9; }
    button.icon.on { color: #ba7517; }
    .lang-chip { font-size: 11px; color: #6b6960; background: #f0efe9; border-radius: 6px; padding: 1px 7px; align-self: center; white-space: nowrap; }
    .lang-chip.switchable { cursor: pointer; color: #3a6ea5; }
    .lang-chip.switchable:hover { background: #e3edfb; }
    .zhx-fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 36px; height: 36px; border-radius: 50%; border: 1px solid #c9d8ea; background: #f7f6f1; color: #3a6ea5; font: 16px/1 sans-serif; cursor: pointer; opacity: .5; box-shadow: 0 2px 10px rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center; transition: opacity .15s ease; touch-action: none; }
    .zhx-fab:hover { opacity: 1; }
    .zhx-footer { border-top: 1px solid #ece9e2; padding: 7px 12px 9px; font-size: 11px; line-height: 1.5; color: #a19d94; }
    .zhx-footer a { color: #8a867d; text-decoration: none; }
    .zhx-footer a:hover { color: #3a6ea5; text-decoration: underline; }
    .zhx-footer .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 2px; }
    .zhx-footer .sup { color: #b07a3a; }
    .zhx-footer .sup:hover { color: #c8862f; }
    @media (prefers-color-scheme: dark) {
      .zhx-pop { background: #26251f; color: #ece9e2; border-color: #45443c; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
      .zhx-pop[data-level="2"] { background: #2d2c25; }
      .hdr, .chars, .exs, .tr-row { border-color: #45443c; }
      .hdr .py { color: #8ab4e8; }
      .hdr .var, .hint, .nf, ruby rt, .exs .label { color: #a8a496; }
      .char .g, .ex .en, .fam-w .fg { color: #b5b2a6; }
      .fam-h { color: #a8a496; }
      button.fam-toggle, .fam-w .fp { color: #8ab4e8; }
      .tr-out { color: #ece9e2; }
      button.nav, button.icon { color: #b5b2a6; }
      button.nav:hover, button.icon:hover { background: #3a3931; }
      button.icon.on { color: #efb75a; }
      button.act { color: #8ab4e8; border-color: #3f5876; }
      button.act:hover { background: #2f3d50; }
      .lnk:hover { background: #2f3d50; }
      .badge { background: #3a3931; color: #b5b2a6; }
      .lang-chip { background: #3a3931; color: #b5b2a6; }
      .lang-chip.switchable { color: #8ab4e8; }
      .litline { color: #b5b2a6; }
      .litline .lab { color: #a8a496; }
      .litline .note { color: #d69a52; }
      button.rd-chip { border-color: #45443c; color: #a8a496; }
      button.rd-chip:hover { border-color: #8ab4e8; color: #8ab4e8; }
      button.rd-chip.on { background: #2f3d50; border-color: #8ab4e8; color: #8ab4e8; }
      .rd-sep { background: #45443c; }
      .zhx-fab { background: #26251f; border-color: #3f5876; color: #8ab4e8; }
      .zhx-footer { border-color: #45443c; color: #8f8b81; }
      .zhx-footer a { color: #a8a496; }
      .zhx-footer a:hover { color: #8ab4e8; }
      .zhx-footer .sup { color: #d69a52; }
      .zhx-footer .sup:hover { color: #e6ad63; }
    }
  `;

  const PAGE_CSS = `
    ruby.zhx-w { cursor: pointer; }
    ruby.zhx-w > rt { display: none; }
    html.zhx-py ruby.zhx-w > rt {
      display: revert; font-size: 0.5em; opacity: 0.72;
      user-select: none; letter-spacing: 0;
    }
    html.zhx-py ruby.zhx-w.zhx-known > rt { display: none; }
    html.zhx-bd ruby.zhx-w {
      border-bottom: 1px dotted color-mix(in srgb, currentColor 50%, transparent);
    }
    ruby.zhx-w:hover { background: rgba(90, 140, 220, 0.16); }
  `;

  let host = null;
  let shadow = null;
  let pop1 = null;
  let pop2 = null;
  let navStack = [];
  let renderSeq = 0;

  function ensureUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'zhx-host';
    host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = POPUP_CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);

    shadow.addEventListener('click', (ev) => {
      const lnk = ev.target.closest('.lnk');
      if (lnk) {
        const word = lnk.dataset.w;
        // A token from a mixed-language selection carries its own language; adopt it so the
        // lookup, romanization, and word-family all resolve in the right dictionary.
        if (lnk.dataset.lang && LANG_META[lnk.dataset.lang]) currentLang = lnk.dataset.lang;
        const level = Number(lnk.closest('.zhx-pop').dataset.level);
        if (level === 1) {
          navStack = [];
          openEntry(2, word, () => lnk.getBoundingClientRect());
        } else {
          navStack.push(pop2.dataset.word);
          renderEntry(pop2, word);
        }
        return;
      }
      const nav = ev.target.closest('button.nav');
      if (!nav) return;
      if (nav.dataset.act === 'close') closePopup(Number(nav.closest('.zhx-pop').dataset.level));
      if (nav.dataset.act === 'back' && navStack.length) renderEntry(pop2, navStack.pop());
    });
  }

  function makePopup(level) {
    const el = document.createElement('div');
    el.className = 'zhx-pop';
    el.dataset.level = String(level);
    shadow.appendChild(el);
    return el;
  }

  function closePopup(level) {
    if (level <= 2 && pop2) { pop2.remove(); pop2 = null; navStack = []; }
    if (level <= 1 && pop1) { pop1.remove(); pop1 = null; }
  }

  function place(el, getRect) {
    el.__zhxGetRect = getRect;
    const anchorRect = getRect();
    if (!anchorRect || (anchorRect.width === 0 && anchorRect.height === 0 && anchorRect.top === 0 && anchorRect.left === 0)) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = anchorRect.left + window.scrollX + (el.dataset.level === '2' ? 20 : 0);
    let y = anchorRect.bottom + window.scrollY + 8;
    x = Math.min(x, window.scrollX + document.documentElement.clientWidth - w - 12);
    x = Math.max(x, window.scrollX + 4);
    if (anchorRect.bottom + h + 16 > window.innerHeight) {
      const above = anchorRect.top + window.scrollY - h - 8;
      if (above > window.scrollY + 4) y = above;
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  function cleanDef(def) {
    return def
      .replace(/([㐀-䶿一-鿿豈-﫿]+)\|([㐀-䶿一-鿿豈-﫿]+)/g, '$2')
      .replace(/\[[a-zA-ZüU: 1-5,·-]+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // pieces: for Japanese, an array of [text, reading|null] so furigana sits only
  // over the kanji clusters. For other languages we pass a single [word, reading] pair.
  function appendRuby(container, pieces) {
    for (const [text, rt] of pieces) {
      if (rt) {
        const ruby = document.createElement('ruby');
        ruby.append(text);
        const rtEl = document.createElement('rt');
        rtEl.textContent = rt;
        ruby.appendChild(rtEl);
        container.appendChild(ruby);
      } else {
        container.append(text);
      }
    }
  }

  function rubyNode(word, reading, clickable, pieces, lang) {
    const holder = document.createElement('span');
    appendRuby(holder, pieces ?? [[word, reading ?? null]]);
    if (!clickable) return holder;
    holder.className = 'lnk';
    holder.dataset.w = word;
    if (lang) holder.dataset.lang = lang; // set on mixed-selection tokens so clicks use the right dict
    return holder;
  }

  function renderTokens(tokens, container) {
    for (const tok of tokens) {
      if (tok.han) container.appendChild(rubyNode(tok.w, tok.p, true, tok.f, tok.lang));
      else container.append(tok.w);
    }
  }

  function creditLink(href, text, cls) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    if (cls) a.className = cls;
    return a;
  }
  // Small muted footer shown once per top-level popup (never on nested lookups).
  function footerNode() {
    const f = document.createElement('div');
    f.className = 'zhx-footer';
    const cr = document.createElement('div');
    cr.append('Created by ', creditLink(CREDIT.site, CREDIT.name), ` · ${CREDIT.year}`);
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      creditLink(CREDIT.site, 'My Website'),
      creditLink(CREDIT.youtube, 'YouTube'),
      creditLink(CREDIT.coffee, 'Enjoying Worldglass? Buy me a coffee ☕', 'sup'),
    );
    f.append(cr, row);
    return f;
  }

  function header(pop, titleHTMLBuilder, withBack) {
    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    if (withBack) {
      const back = document.createElement('button');
      back.className = 'nav';
      back.dataset.act = 'back';
      back.textContent = '←';
      back.title = 'Back';
      hdr.appendChild(back);
    }
    titleHTMLBuilder(hdr);
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    hdr.appendChild(spacer);
    const close = document.createElement('button');
    close.className = 'nav';
    close.dataset.act = 'close';
    close.textContent = '✕';
    close.title = 'Close';
    hdr.appendChild(close);
    pop.appendChild(hdr);
    return hdr;
  }

  let readingMode = 'man';
  // Chinese script preference for rendered entries: 'auto' keeps the form as written
  // (and matches nested lookups to their parent's script), 'simp'/'trad' always convert.
  let scriptPref = 'auto';

  const ZH_READINGS = [
    ['man', '普', 'Mandarin — pinyin'],
    ['yue', '粤', 'Cantonese — Jyutping'],
    ['nan', '闽', 'Hokkien — Pe̍h-ōe-jī'],
    ['teo', '潮', 'Teochew — Peng\'im'],
  ];
  // Inline reading + script switchers for Chinese popups. Persist the choice; applyModes
  // re-renders any open popup in place, so switching feels instant instead of closing it.
  // Script chips toggle: click 简 or 繁 to force that script, click again for as-written.
  function readingChips() {
    const row = document.createElement('div');
    row.className = 'rd-row';
    for (const [id, label, title] of ZH_READINGS) {
      const chip = document.createElement('button');
      chip.className = 'rd-chip' + (id === readingMode ? ' on' : '');
      chip.textContent = label;
      chip.title = title;
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (id !== readingMode) chrome.storage.local.set({ zhxReading: id });
      });
      row.appendChild(chip);
    }
    const sep = document.createElement('span');
    sep.className = 'rd-sep';
    row.appendChild(sep);
    for (const [id, label, title] of [
      ['simp', '简', 'Show entries in Simplified (click again for as-written)'],
      ['trad', '繁', 'Show entries in Traditional (click again for as-written)'],
    ]) {
      const chip = document.createElement('button');
      chip.className = 'rd-chip' + (id === scriptPref ? ' on' : '');
      chip.textContent = label;
      chip.title = title;
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        chrome.storage.local.set({ zhxScript: scriptPref === id ? 'auto' : id });
      });
      row.appendChild(chip);
    }
    return row;
  }

  // Word families exist for the character/syllable-based scripts, where a shared glyph is
  // a shared morpheme (zh 词 / ja 語 / ko 단어).
  const FAM_LABEL = { zh: '词 ▾', ja: '語 ▾', ko: '단어 ▾' };
  function famWordsEl(words, emptyMsg) {
    const wrap = document.createElement('div');
    wrap.className = 'fam-words';
    for (const fw of (words ?? [])) {
      const chip = document.createElement('span');
      chip.className = 'lnk fam-w';
      chip.dataset.w = fw.w;
      const w = document.createElement('span'); w.className = 'fw'; w.textContent = fw.w;
      const p = document.createElement('span'); p.className = 'fp'; p.textContent = fw.p;
      const g = document.createElement('span'); g.className = 'fg'; g.textContent = cleanDef(fw.g).slice(0, 22);
      chip.append(w, ' ', p, ' ', g);
      wrap.appendChild(chip);
    }
    if (!(words ?? []).length) wrap.textContent = emptyMsg;
    return wrap;
  }
  async function loadFamilyInto(box, ch, excludeWord) {
    const seq = renderSeq;
    const r = await chrome.runtime.sendMessage({ type: 'family', char: ch, word: excludeWord, lang: currentLang, reading: readingMode, limit: 12 }).catch(() => null);
    if (seq !== renderSeq || !box.isConnected) return;
    box.textContent = '';
    const hdr = document.createElement('div');
    hdr.className = 'fam-h';
    hdr.textContent = `Words with ${ch}`;
    box.appendChild(hdr);
    box.appendChild(famWordsEl(r?.words, '(no other words with this character)'));
  }

  function speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const want = currentLang === 'zh' ? (TTS_YUE[readingMode] ?? 'zh-CN') : meta().tts;
      u.lang = want;
      const base = want.split('-')[0];
      const voices = speechSynthesis.getVoices();
      const voice = voices.find((v) => v.lang.replace('_', '-') === want)
        ?? voices.find((v) => v.lang.replace('_', '-').startsWith(base));
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch { /* no TTS available */ }
  }

  function speakButton(text, title) {
    const btn = document.createElement('button');
    btn.className = 'icon';
    btn.title = title ?? 'Pronounce';
    btn.textContent = '🔊';
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); speak(text); });
    return btn;
  }

  async function getSaved() {
    const { zhxSaved = {} } = await chrome.storage.local.get('zhxSaved');
    return zhxSaved ?? {};
  }

  async function toggleSaved(word, info) {
    const saved = await getSaved();
    if (saved[word]) delete saved[word];
    else saved[word] = info;
    await chrome.storage.local.set({ zhxSaved: saved });
    return !!saved[word];
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  async function translateInto(text, out) {
    out.textContent = 'Translating…';
    const pair = { sourceLanguage: meta().tr, targetLanguage: 'en' };
    try {
      if (!('Translator' in self)) throw new Error('no-api');
      const availability = await withTimeout(Translator.availability(pair), 4000);
      if (availability === 'unavailable') throw new Error('no-model');
      const ready = availability === 'available';
      if (!ready) out.textContent = 'Downloading translation model (first use only)…';
      const translator = await withTimeout(Translator.create(pair), ready ? 15000 : 120000);
      out.textContent = await withTimeout(translator.translate(text), 30000);
    } catch (err) {
      console.debug('[zhx] translate failed:', err?.message);
      out.textContent = 'On-device translation is unavailable in this browser. It needs Chrome 138+ with the built-in translator model.';
    }
  }

  async function renderEntry(pop, word, redirected) {
    const seq = ++renderSeq;
    pop.dataset.word = word;
    const [res, examples] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'lookup', word, lang: currentLang, reading: readingMode }),
      chrome.runtime.sendMessage({ type: 'examples', word, limit: 2, lang: currentLang, reading: readingMode }).catch(() => []),
    ]);
    if (seq !== renderSeq || !pop.isConnected) return;

    // Chinese script preference. CEDICT glosses quote traditional forms, so nested lookups
    // from definitions used to open in traditional even for simplified readers. 'simp'/'trad'
    // always convert via the entry's own s/t forms; 'auto' keeps the clicked form but makes a
    // nested lookup follow its parent popup's script.
    if (currentLang === 'zh' && res.found && res.entries[0] && !redirected) {
      const e0 = res.entries[0];
      let want = scriptPref;
      if (want === 'auto' && pop.dataset.level === '2' && pop1?.dataset.zhScript) want = pop1.dataset.zhScript;
      const target = want === 'simp' ? e0.s : want === 'trad' ? e0.t : null;
      if (target && target !== word) return renderEntry(pop, target, true);
    }
    if (currentLang === 'zh' && res.found && res.entries[0]) {
      const e0 = res.entries[0];
      pop.dataset.zhScript = word === e0.s && word !== e0.t ? 'simp' : word === e0.t && word !== e0.s ? 'trad' : '';
    }

    const defTexts = res.entries.flatMap((e) => e.defs.map(cleanDef));
    // Only re-segment definitions for CJK, whose glosses embed Han/kana worth linking.
    // For other languages the gloss is English, and HAN_RE (= the Latin word class)
    // would wrongly make English words clickable and look them up in the wrong dict.
    const CJK_DEF_LANGS = new Set(['zh', 'ja']);
    const hanDefs = CJK_DEF_LANGS.has(currentLang) ? defTexts.filter((d) => HAN_RE.test(d)) : [];
    let defTokens = new Map();
    if (hanDefs.length) {
      const segs = await chrome.runtime.sendMessage({ type: 'segmentBatch', texts: hanDefs, lang: currentLang, reading: readingMode });
      if (seq !== renderSeq || !pop.isConnected) return;
      hanDefs.forEach((d, i) => defTokens.set(d, segs[i]));
    }

    pop.textContent = '';
    header(pop, (hdr) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('dir', meta().dir === 'rtl' ? 'rtl' : 'auto');
      w.textContent = word;
      hdr.appendChild(w);
      const addVar = (txt) => {
        const v = document.createElement('span');
        v.className = 'var';
        v.textContent = txt;
        hdr.appendChild(v);
      };
      if (res.found) {
        const e0 = res.entries[0];
        if (e0.p) {
          const py = document.createElement('span');
          py.className = 'py';
          py.setAttribute('dir', meta().dir === 'rtl' ? 'rtl' : 'auto');
          py.textContent = e0.p;
          hdr.appendChild(py);
        }
        if (e0.p2 && e0.p2 !== e0.p) addVar(`pinyin ${e0.p2}`);
        if (res.base) addVar(res.tentative ? `≈ ${res.base}?` : `« ${res.base}`);
        if (e0.t && e0.t !== e0.s) {
          if (currentLang === 'zh') addVar(word === e0.s ? `繁 ${e0.t}` : `简 ${e0.s}`);
          else addVar(e0.t);
        }
        if (res.hsk || res.common) {
          const b = document.createElement('span');
          b.className = 'badge';
          b.textContent = res.hsk ? (res.hsk === 7 ? 'HSK 7–9' : `HSK ${res.hsk}`) : 'common';
          hdr.appendChild(b);
        }
      }
      hdr.appendChild(langChip(null));
      hdr.appendChild(speakButton(word));
      if (res.found) {
        const star = document.createElement('button');
        star.className = 'icon';
        star.title = 'Save word';
        star.textContent = '☆';
        getSaved().then((s) => {
          if (s[word]) { star.textContent = '★'; star.classList.add('on'); }
        });
        star.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const on = await toggleSaved(word, {
            p: res.entries[0].p,
            d: res.entries[0].defs.map(cleanDef).filter(Boolean).slice(0, 2).join('; '),
            t: Date.now(),
          });
          star.textContent = on ? '★' : '☆';
          star.classList.toggle('on', on);
        });
        hdr.appendChild(star);
      }
    }, pop.dataset.level === '2' && navStack.length > 0);

    const body = document.createElement('div');
    body.className = 'body';

    if (currentLang === 'zh' && res.found) body.appendChild(readingChips());

    if (res.redup) {
      const rd = document.createElement('div');
      rd.className = 'cl';
      rd.textContent = res.redup;
      body.appendChild(rd);
    }

    if (!res.found) {
      const nf = document.createElement('div');
      nf.className = 'nf';
      nf.textContent = 'No dictionary entry for this exact string.';
      body.appendChild(nf);
    }

    res.entries.forEach((entry, i) => {
      if (i > 0 || entry.p !== res.entries[0].p) {
        const pyline = document.createElement('div');
        pyline.className = 'pyline';
        pyline.textContent = entry.p;
        body.appendChild(pyline);
      }
      const ol = document.createElement('ol');
      ol.className = 'defs';
      for (const def of entry.defs.map(cleanDef)) {
        if (!def) continue;
        const li = document.createElement('li');
        if (defTokens.has(def)) renderTokens(defTokens.get(def), li);
        else li.textContent = def;
        ol.appendChild(li);
      }
      body.appendChild(ol);
    });

    // Curated "literally A + B" line — worker sends `lit` only for hand-checked compounds,
    // with a note whenever the parts don't honestly sum to the meaning.
    if (res.lit) {
      const litRow = document.createElement('div');
      litRow.className = 'litline';
      const lab = document.createElement('span');
      lab.className = 'lab';
      lab.textContent = 'literally';
      litRow.append(lab, res.lit[0]);
      if (res.lit[1]) {
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = res.lit[1];
        litRow.appendChild(note);
      }
      body.appendChild(litRow);
    }

    if (res.cl && res.cl.length) {
      const clRow = document.createElement('div');
      clRow.className = 'cl';
      clRow.textContent = `measure word: ${res.cl.join('、')}`;
      body.appendChild(clRow);
    }

    if (res.chars.length > 1) {
      const chars = document.createElement('div');
      chars.className = 'chars';
      const famBox = document.createElement('div');
      famBox.className = 'fambox';
      const famable = FAM_LABEL[currentLang] !== undefined;
      let famCh = null;
      async function showFamily(ch) {
        if (famCh === ch) { famBox.textContent = ''; famCh = null; return; }
        famCh = ch;
        famBox.textContent = 'Loading…';
        await loadFamilyInto(famBox, ch, pop.dataset.word);
      }
      for (const c of res.chars) {
        const card = document.createElement('div');
        card.className = 'char';
        const hz = document.createElement('div');
        hz.className = 'hz';
        hz.appendChild(rubyNode(c.ch, c.p, true));
        card.appendChild(hz);
        if (c.gloss) {
          const g = document.createElement('div');
          g.className = 'g';
          g.textContent = cleanDef(c.gloss);
          card.appendChild(g);
        }
        if (famable) {
          const tog = document.createElement('button');
          tog.className = 'fam-toggle';
          tog.textContent = FAM_LABEL[currentLang];
          tog.title = `Words with ${c.ch}`;
          tog.addEventListener('click', (ev) => { ev.stopPropagation(); showFamily(c.ch); });
          card.appendChild(tog);
        }
        chars.appendChild(card);
      }
      body.appendChild(chars);
      body.appendChild(famBox);
    } else if (res.found && FAM_LABEL[currentLang] && [...word].length === 1
        && (currentLang === 'ko' ? /[가-힣]/ : HAN_RE).test(word)) {
      // A single-character lookup IS the character: surface its word family directly
      // (suggested 词/語/단어) — there is no breakdown row to hang the toggle on, and the
      // family is the main thing worth exploring from a lone glyph.
      const famBox = document.createElement('div');
      famBox.className = 'fambox';
      famBox.textContent = 'Loading…';
      body.appendChild(famBox);
      loadFamilyInto(famBox, word, word);
    }

    if (Array.isArray(examples) && examples.length) {
      const exs = document.createElement('div');
      exs.className = 'exs';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = 'Examples';
      exs.appendChild(label);
      for (const ex of examples) {
        const div = document.createElement('div');
        div.className = 'ex';
        const zh = document.createElement('div');
        zh.className = 'zh';
        renderTokens(ex.tokens, zh);
        zh.appendChild(speakButton(ex.tokens.map((t) => t.w).join(''), 'Pronounce sentence'));
        const en = document.createElement('div');
        en.className = 'en';
        en.textContent = ex.eng;
        div.append(zh, en);
        exs.appendChild(div);
      }
      body.appendChild(exs);
    }

    pop.appendChild(body);
    if (pop.dataset.level === '1') pop.appendChild(footerNode()); // pinned below the scroll area
  }

  async function openEntry(level, word, getRect) {
    ensureUI();
    let pop;
    if (level === 1) {
      closePopup(1);
      pop = pop1 = makePopup(1);
    } else {
      if (pop2) pop2.remove();
      pop = pop2 = makePopup(2);
    }
    await renderEntry(pop, word);
    if (pop.isConnected) place(pop, getRect);
  }

  // Remembers the current selection so a language-override chip can re-run it.
  let selState = null;

  function langChip(det) {
    const chip = document.createElement('span');
    chip.className = 'lang-chip';
    chip.textContent = meta().name;
    const others = (det?.candidates ?? [])
      .map((c) => c.lang)
      .filter((l) => l !== currentLang && LANG_META[l]);
    if (others.length) {
      chip.title = 'Detected — click to switch language';
      chip.classList.add('switchable');
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const next = others.shift();
        others.push(currentLang);
        currentLang = next;
        if (selState) openSelection(selState.text, selState.getRect, selState.truncated, { lang: next, candidates: det.candidates });
      });
    }
    return chip;
  }

  // A selection can span several languages (e.g. a parallel-translation paragraph). Split
  // it into single-script runs (via the shared detector) so each is tokenized by its own
  // language rather than forced through the one language picked for the whole selection.
  async function segmentSelection(text) {
    const runs = LensDetect.splitRuns(text).filter((r) => !r.lang || LANG_META[r.lang]);
    const distinct = [...new Set(runs.map((r) => r.lang).filter(Boolean))];
    if (distinct.length <= 1) {
      const [tokens] = await chrome.runtime.sendMessage({ type: 'segmentBatch', texts: [text], lang: currentLang, reading: readingMode });
      return { tokens, mixed: false, langs: distinct };
    }
    const tokens = [];
    for (const run of runs) {
      if (!run.lang) { if (run.text) tokens.push({ w: run.text, han: false }); continue; }
      const [toks] = await chrome.runtime.sendMessage({ type: 'segmentBatch', texts: [run.text], lang: run.lang, reading: readingMode });
      for (const t of toks) { if (t.han) t.lang = run.lang; tokens.push(t); }
    }
    return { tokens, mixed: true, langs: distinct };
  }

  function mixedChip(langs) {
    const chip = document.createElement('span');
    chip.className = 'lang-chip';
    chip.textContent = langs.map((l) => LANG_META[l]?.name ?? l).join(' · ');
    chip.title = 'Multiple languages detected — each annotated in its own language';
    return chip;
  }

  async function openSelection(text, getRect, truncated, det) {
    ensureUI();
    selState = { text, getRect, truncated };
    const seq = ++renderSeq;
    // Whole-selection lookup catches multi-word entries (idioms, proverbs, place
    // names). Try the space-normalized phrase first \u2014 space-delimited languages index
    // multi-word headwords WITH spaces \u2014 then the space-stripped form for CJK. Skip
    // when the selection spans a clause boundary (punctuation) or is sentence-length.
    const { tokens, mixed, langs } = await segmentSelection(text);
    if (seq !== renderSeq) return;
    const normalized = text.trim().replace(/\s+/g, ' ');
    const wholeForms = [...new Set([normalized, normalized.replace(/\s+/g, '')])];
    const clausey = /[\u3002\uFF0C\uFF01\uFF1F\u3001,.!?;:\uFF1B\n]/.test(text);
    // A whole-selection lookup only makes sense for a single-language phrase (idiom,
    // proverb, place name); a mixed selection is never one dictionary headword.
    if (!mixed && !clausey && normalized.length >= 2 && normalized.length <= 40 && normalized.split(' ').length <= 6) {
      for (const cand of wholeForms) {
        const whole = await chrome.runtime.sendMessage({ type: 'lookup', word: cand, lang: currentLang, reading: readingMode });
        if (seq !== renderSeq) return;
        if (whole.found) {
          closePopup(1);
          await openEntry(1, cand, getRect);
          return;
        }
      }
    }
    const hanWords = tokens.filter((t) => t.han);
    if (hanWords.length === 0) return;
    if (hanWords.length === 1) {
      // If our detected language's dictionary doesn't know the word but another detector
      // candidate's does (経済 is Japanese-only shinjitai; Jawi and Arabic share a script),
      // switch language instead of rendering "No dictionary entry".
      const first = await chrome.runtime.sendMessage({ type: 'lookup', word: hanWords[0].w, lang: currentLang, reading: readingMode }).catch(() => null);
      if (!first?.found) {
        for (const c of det?.candidates ?? []) {
          if (c.lang === currentLang || !LANG_META[c.lang]) continue;
          const alt = await chrome.runtime.sendMessage({ type: 'lookup', word: hanWords[0].w, lang: c.lang, reading: readingMode }).catch(() => null);
          if (alt?.found) { currentLang = c.lang; break; }
        }
      }
      if (seq !== renderSeq) return;
      closePopup(1);
      await openEntry(1, hanWords[0].w, getRect);
      return;
    }
    closePopup(1);
    const pop = pop1 = makePopup(1);
    pop.dataset.kind = 'sel'; // lets applyModes re-run the selection instead of a word lookup
    header(pop, (hdr) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = 'Selection';
      w.style.fontSize = '14px';
      hdr.appendChild(w);
      hdr.appendChild(mixed ? mixedChip(langs) : langChip(det));
    }, false);
    const body = document.createElement('div');
    body.className = 'body';
    if (currentLang === 'zh' && !mixed) body.appendChild(readingChips());
    const line = document.createElement('div');
    line.className = 'selline';
    // Alphabetic scripts read at body size with normal word wrapping; the large 21px line
    // is for CJK, where per-character ruby needs the room.
    const cjkLine = mixed ? langs.some((l) => ['zh', 'ja', 'ko'].includes(l)) : ['zh', 'ja', 'ko'].includes(currentLang);
    if (!cjkLine) line.classList.add('alpha');
    // 'auto' lets the browser bidi-order each run, so an RTL run (Hebrew/Arabic) inside a
    // mixed selection reads correctly alongside LTR runs.
    line.setAttribute('dir', !mixed && meta().dir === 'rtl' ? 'rtl' : 'auto');
    renderTokens(tokens, line);
    body.appendChild(line);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = `${hanWords.length} words — click any word for its definition`
      + (truncated ? ` (long selection: showing the first ${MAX_SELECTION} characters)` : '');
    body.appendChild(hint);

    const trRow = document.createElement('div');
    trRow.className = 'tr-row';
    const trBtn = document.createElement('button');
    trBtn.className = 'act';
    trBtn.textContent = 'Translate';
    const out = document.createElement('div');
    out.className = 'tr-out';
    trBtn.addEventListener('click', () => translateInto(text, out));
    trRow.appendChild(trBtn);
    trRow.appendChild(speakButton(text, 'Pronounce selection'));
    trRow.appendChild(out);
    body.appendChild(trRow);

    pop.appendChild(body);
    pop.appendChild(footerNode()); // pinned below the scroll area
    place(pop, getRect);
  }


  // Floating OCR button: snip mode used to live only behind the toolbar popup, a long
  // reach for something used mid-page. A small draggable button (toggleable in settings)
  // starts a snip in place. Click = snip; drag = reposition.
  let fab = null;
  let fabOn = true;
  function ensureFab() {
    if (!fabOn) { if (fab) fab.style.display = 'none'; return; }
    ensureUI();
    if (fab) { fab.style.display = ''; return; }
    fab = document.createElement('button');
    fab.className = 'zhx-fab';
    fab.title = 'Worldglass OCR — click, then drag a box over text in an image (drag me to move)';
    fab.textContent = '文';
    fab.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const rect = fab.getBoundingClientRect();
      const offX = ev.clientX - rect.left;
      const offY = ev.clientY - rect.top;
      const sx = ev.clientX, sy = ev.clientY;
      let moved = false;
      const onMove = (e) => {
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 4) moved = true;
        if (!moved) return;
        fab.style.right = `${Math.max(4, window.innerWidth - (e.clientX - offX) - fab.offsetWidth)}px`;
        fab.style.bottom = `${Math.max(4, window.innerHeight - (e.clientY - offY) - fab.offsetHeight)}px`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) chrome.runtime.sendMessage({ type: 'relaySnip' }).catch(() => {});
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    shadow.appendChild(fab);
  }

  // Serialize a selection the way it READS, not the way the DOM stores it. textContent
  // concatenates text nodes with no separators, so an inline label glued to a word
  // ("<span class=tag>ms</span>Pelajar" → "msPelajar") produced junk tokens. Walk the live
  // range instead: skip ruby annotations and hidden text, and insert a separator whenever
  // the boundary between two text nodes crosses an element that is visually separated —
  // non-inline display, or an inline element carrying horizontal margin/padding. Plain
  // inline wrappers (<b>经</b>济) still join seamlessly.
  function selectionText(sel) {
    try {
      const range = sel.getRangeAt(0);
      const rootNode = range.commonAncestorContainer;
      const root = rootNode.nodeType === Node.ELEMENT_NODE ? rootNode : rootNode.parentElement;
      const skip = (node) => {
        for (let el = node.parentElement; el; el = el.parentElement) {
          const tag = el.tagName;
          if (tag === 'RT' || tag === 'RP' || tag === 'SCRIPT' || tag === 'STYLE') return true;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return true;
          if (el === root) break;
        }
        return false;
      };
      const separated = (el) => {
        const cs = getComputedStyle(el);
        const d = cs.display;
        if (d !== 'inline' && d !== 'contents' && !d.startsWith('ruby')) return d === 'block' || d === 'list-item' || d.startsWith('table') ? '\n' : ' ';
        const gap = parseFloat(cs.marginLeft) + parseFloat(cs.marginRight) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        return gap > 1 ? ' ' : '';
      };
      const chain = (node) => {
        const els = [];
        for (let el = node.parentElement; el && el !== root; el = el.parentElement) els.push(el);
        return els;
      };
      const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
      let out = '';
      let prev = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!range.intersectsNode(node)) { if (out) break; continue; }
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        const text = node.nodeValue.slice(start, end);
        if (!text || skip(node)) continue;
        if (prev) {
          const prevChain = chain(prev);
          const nextChain = chain(node);
          const nextSet = new Set(nextChain);
          const shared = prevChain.find((el) => nextSet.has(el));
          const crossed = [
            ...prevChain.slice(0, shared ? prevChain.indexOf(shared) : prevChain.length),
            ...nextChain.slice(0, shared ? nextChain.indexOf(shared) : nextChain.length),
          ];
          let sep = '';
          for (const el of crossed) {
            const s = separated(el);
            if (s === '\n') { sep = '\n'; break; }
            if (s === ' ') sep = ' ';
          }
          out += sep;
        }
        out += text;
        prev = node;
        if (out.length > MAX_SELECTION * 3) break;
      }
      if (out.trim()) return out.trim();
    } catch { /* fall through */ }
    return sel.toString().trim();
  }

  function contextSample(node) {
    let el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      const t = el.textContent ?? '';
      if (t.length >= 60 || /^(P|ARTICLE|SECTION|MAIN|BODY|LI|TD|DIV)$/.test(el.tagName)) {
        return t.slice(0, 800);
      }
    }
    return '';
  }

  // Script detection can't attribute a bare Latin word without diacritics or stopwords —
  // "membaca" selected on an English page scores nothing and nothing happened at all. For
  // short alphabetic selections the detector gives up on, ask the dictionaries directly
  // and open in whichever language actually knows the word (page language first).
  // Ordered smallest-dictionary-first so the common case stays fast; the first hit wins,
  // and a slow dictionary load (Spanish is 74 MB) can't stall the popup past its timeout.
  const LATIN_PROBE = ['ms', 'fr', 'de', 'es'];
  async function probeLatinWord(text) {
    const t = text.trim();
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ''. -]+$/.test(t) || t.length > 40 || t.split(/\s+/).length > 3) return null;
    // Judge the selection alone: detect() mixes in page context, so a foreign word inside
    // an English sentence reads as "en" — exactly the case the probe exists for.
    const own = LensDetect.detect(t, '', null);
    if (own.lang === 'en') return null; // the selected words themselves are English
    const hint = LensDetect.pageHint ? LensDetect.pageHint(document.documentElement.lang) : null;
    const order = LATIN_PROBE.includes(hint) ? [hint, ...LATIN_PROBE.filter((l) => l !== hint)] : LATIN_PROBE;
    for (const lang of order) {
      const r = await withTimeout(
        chrome.runtime.sendMessage({ type: 'lookup', word: t, lang, reading: readingMode }), 6000,
      ).catch(() => null);
      if (r?.found && !r.tentative) {
        return { lang, supported: true, confidence: 0.5, reason: 'dict-probe', candidates: order.map((l) => ({ lang: l })) };
      }
    }
    return null;
  }

  document.addEventListener('mouseup', (ev) => {
    if (ev.composedPath().includes(host)) return;
    setTimeout(async () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      let text = selectionText(sel);
      if (!text) return;
      const ctx = contextSample(sel.anchorNode);
      let det = LensDetect.detect(text, ctx, document.documentElement.lang);
      if (!det.supported || !LANG_META[det.lang]) {
        det = await probeLatinWord(text);
        if (!det) return;
      }
      currentLang = det.lang;
      const truncated = text.length > MAX_SELECTION;
      if (truncated) text = text.slice(0, MAX_SELECTION);
      const range = sel.getRangeAt(0);
      openSelection(text, () => range.getBoundingClientRect(), truncated, det);
    }, 0);
  });

  document.addEventListener('mousedown', (ev) => {
    if (host && ev.composedPath().includes(host)) return;
    closePopup(1);
  });

  document.addEventListener('click', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const w = ev.target.closest?.('ruby.zhx-w');
    if (!w) return;
    ev.preventDefault();
    ev.stopPropagation();
    navStack = [];
    openEntry(1, w.firstChild.textContent, () => w.getBoundingClientRect());
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (pop2) closePopup(2);
    else if (pop1) closePopup(1);
  });

  window.addEventListener('zhx-ocr-open', (ev) => {
    ensureUI();
    const { text, rect } = ev.detail;
    const det = LensDetect.detect(text, text, document.documentElement.lang);
    if (det.supported && LANG_META[det.lang]) currentLang = det.lang;
    openSelection(text, () => rect, false, det);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      for (const pop of [pop1, pop2]) {
        if (pop && pop.__zhxGetRect) place(pop, pop.__zhxGetRect);
      }
    }, 150);
  });

  let pageStyle = null;
  let annotated = false;
  let annotating = null;

  function ensurePageStyle() {
    if (pageStyle) return;
    pageStyle = document.createElement('style');
    pageStyle.id = 'zhx-page-style';
    pageStyle.textContent = PAGE_CSS;
    document.head.appendChild(pageStyle);
  }

  let knownMax = 0;

  function collectTextNodes(root) {
    const base = root ?? document.body;
    const nodes = [];
    if (base.nodeType === Node.TEXT_NODE) {
      if (acceptText(base)) nodes.push(base);
      return nodes;
    }
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (acceptText(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function acceptText(node) {
    if (!HAN_RE.test(node.nodeValue)) return false;
    const p = node.parentElement;
    if (!p) return false;
    if (p.closest('script,style,noscript,textarea,select,ruby,[contenteditable],.zhx-annot')) return false;
    return true;
  }

  function isKnown(level) {
    return level > 0 && level <= knownMax;
  }

  async function annotateNodes(nodes) {
    ensurePageStyle();
    const CHUNK = 400;
    for (let start = 0; start < nodes.length; start += CHUNK) {
      const batch = nodes.slice(start, start + CHUNK).filter((n) => n.isConnected);
      if (!batch.length) continue;
      const texts = batch.map((n) => n.nodeValue);
      const results = await chrome.runtime.sendMessage({ type: 'segmentBatch', texts, reading: readingMode });
      batch.forEach((node, i) => {
        if (!node.isConnected) return;
        const span = document.createElement('span');
        span.className = 'zhx-annot';
        span.__zhxOrig = node.nodeValue;
        for (const tok of results[i]) {
          if (tok.han) {
            const ruby = document.createElement('ruby');
            ruby.className = 'zhx-w';
            if (tok.h) ruby.dataset.h = tok.h;
            if (isKnown(tok.h)) ruby.classList.add('zhx-known');
            ruby.append(tok.w);
            const rt = document.createElement('rt');
            rt.textContent = tok.p ?? '';
            ruby.appendChild(rt);
            span.appendChild(ruby);
          } else {
            span.append(tok.w);
          }
        }
        node.replaceWith(span);
      });
    }
  }

  async function annotatePage() {
    if (annotated) { startObserver(); return; }
    if (annotating) return annotating;
    annotating = (async () => {
      await annotateNodes(collectTextNodes());
      annotated = true;
      annotating = null;
      startObserver();
    })();
    return annotating;
  }

  function revertAnnotation() {
    stopObserver();
    if (!annotated) return;
    for (const span of document.querySelectorAll('span.zhx-annot')) {
      span.replaceWith(document.createTextNode(span.__zhxOrig ?? span.textContent));
    }
    annotated = false;
  }

  function reapplyKnown() {
    for (const ruby of document.querySelectorAll('ruby.zhx-w')) {
      ruby.classList.toggle('zhx-known', isKnown(Number(ruby.dataset.h ?? 0)));
    }
  }

  let observer = null;
  let pendingRoots = new Set();
  let flushTimer = null;

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.TEXT_NODE) {
            pendingRoots.add(n);
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            if (n.id === 'zhx-host' || n.classList?.contains('zhx-annot') || n.closest?.('.zhx-annot')) continue;
            pendingRoots.add(n);
          }
        }
      }
      if (pendingRoots.size && !flushTimer) flushTimer = setTimeout(flushPending, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    pendingRoots.clear();
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  }

  async function flushPending() {
    flushTimer = null;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    const nodes = [];
    for (const root of roots) {
      if (!root.isConnected) continue;
      nodes.push(...collectTextNodes(root));
    }
    if (nodes.length) await annotateNodes(nodes);
  }

  const SETTINGS = { zhxPinyin: false, zhxBounds: false, zhxHskMax: 0, zhxReading: 'man', zhxScript: 'auto', zhxFab: true };

  // Re-render whatever popups are open (nested first) so a reading/script change updates
  // them live — closing the popup the user is looking at made switching feel broken.
  function rerenderPopups() {
    if (pop1?.isConnected) {
      if (pop1.dataset.kind === 'sel' && selState) {
        openSelection(selState.text, selState.getRect, selState.truncated);
      } else if (pop1.dataset.word) {
        const nested = pop2?.isConnected ? pop2.dataset.word : null;
        renderEntry(pop1, pop1.dataset.word).then(() => {
          if (nested && pop2?.isConnected) renderEntry(pop2, nested);
        });
      }
    } else if (pop2?.isConnected && pop2.dataset.word) {
      renderEntry(pop2, pop2.dataset.word);
    }
  }

  function applyModes(cfg) {
    ensurePageStyle();
    knownMax = Number(cfg.zhxHskMax) || 0;
    const newReading = cfg.zhxReading ?? 'man';
    const newScript = cfg.zhxScript ?? 'auto';
    const readingChanged = newReading !== readingMode;
    const scriptChanged = newScript !== scriptPref;
    readingMode = newReading;
    scriptPref = newScript;
    fabOn = cfg.zhxFab !== false;
    ensureFab();
    if (readingChanged || scriptChanged) rerenderPopups();
    if (readingChanged && annotated) {
      revertAnnotation();
      if (cfg.zhxPinyin || cfg.zhxBounds) annotatePage().then(reapplyKnown);
    }
    document.documentElement.classList.toggle('zhx-py', !!cfg.zhxPinyin);
    document.documentElement.classList.toggle('zhx-bd', !!cfg.zhxBounds);
    if (cfg.zhxPinyin || cfg.zhxBounds) annotatePage().then(reapplyKnown);
    else revertAnnotation();
  }

  chrome.storage.local.get(SETTINGS).then((cfg) => {
    readingMode = cfg.zhxReading ?? 'man';
    scriptPref = cfg.zhxScript ?? 'auto';
    fabOn = cfg.zhxFab !== false;
    ensureFab();
    if (cfg.zhxPinyin || cfg.zhxBounds) applyModes(cfg);
    else knownMax = Number(cfg.zhxHskMax) || 0;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('zhxPinyin' in changes) && !('zhxBounds' in changes) && !('zhxHskMax' in changes) && !('zhxReading' in changes) && !('zhxScript' in changes) && !('zhxFab' in changes)) return;
    chrome.storage.local.get(SETTINGS).then(applyModes);
  });
})();
