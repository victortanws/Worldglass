// Lens language detector.
// Pure, data-free, synchronous. Works in both the content script and the worker.
// detect(text, context, pageLang) -> { lang, supported, confidence, reason, candidates }
(function (root) {
  'use strict';

  // --- Script ranges ---------------------------------------------------------
  const RE = {
    hangul: /[가-힣ᄀ-ᇿ㄰-㆏]/,
    hiragana: /[぀-ゟ]/,
    katakana: /[゠-ヿㇰ-ㇿｦ-ﾝ]/,
    kana: /[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾝ]/,
    han: /[㐀-䶿一-鿿豈-﫿々]/,
    arabic: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
    hebrew: /[֐-׿יִ-ﭏ]/,
    latin: /[A-Za-zÀ-ɏḀ-ỿ]/,
    cyrillic: /[Ѐ-ӿ]/,
  };

  // Letters used in Jawi (Malay) but not in standard Arabic — a strong, cheap signal.
  const JAWI_LETTERS = /[چڠڤݢڽۏڬگݣ]/;

  // A handful of characters that are Simplified-Chinese-exclusive (absent from
  // Japanese shinjitai and Traditional Chinese) — presence strongly implies Chinese.
  const SIMPLIFIED_ONLY = /[么习买吗吧呢儿学这那们说语门东书区台条个发头国黄红经济专长间问进广业争]/;
  // A few Japanese-made kanji (kokuji) / JP-exclusive shinjitai — presence implies Japanese.
  const JAPANESE_ONLY = /[峠込畑辻働代気円当体双実対図状億壱高]/;

  // --- Latin language evidence ----------------------------------------------
  const LATIN_EV = {
    fr: { ch: /[éèêëàâîïôûùçœæ]/gi, sw: new Set(['le', 'la', 'les', 'des', 'est', 'et', 'une', 'un', 'dans', 'que', 'qui', 'pour', 'avec', 'sur', 'pas', 'vous', 'nous', 'je', 'il', 'elle', 'du', 'au', 'aux', 'ce', 'cette', 'ne', 'plus', 'ou', 'mais', 'comme', 'son', 'ses', 'leur', 'aussi', 'être', 'sont']) },
    de: { ch: /[äöüßÄÖÜ]/g, sw: new Set(['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'einen', 'mit', 'für', 'auf', 'sich', 'werden', 'wird', 'auch', 'ich', 'sie', 'wir', 'den', 'dem', 'des', 'von', 'zu', 'im', 'aber', 'oder', 'wenn', 'nur', 'noch', 'schon', 'sind', 'haben', 'wie']) },
    es: { ch: /[ñÑ¿¡áéíóúü]/gi, sw: new Set(['el', 'la', 'los', 'las', 'es', 'y', 'en', 'por', 'para', 'con', 'una', 'un', 'se', 'del', 'como', 'está', 'pero', 'yo', 'que', 'de', 'su', 'sus', 'lo', 'le', 'les', 'más', 'muy', 'ya', 'este', 'esta', 'son', 'fue', 'hay', 'porque', 'cuando']) },
    ms: { ch: /(?!)/, sw: new Set(['yang', 'dan', 'untuk', 'dengan', 'tidak', 'tak', 'adalah', 'ialah', 'ini', 'itu', 'saya', 'awak', 'kami', 'kita', 'mereka', 'dia', 'akan', 'telah', 'sudah', 'dalam', 'pada', 'oleh', 'atau', 'kerana', 'boleh', 'orang', 'negara', 'dari', 'ada', 'juga', 'sebagai', 'hendak', 'kepada', 'ke', 'di']) },
    en: { ch: /(?!)/, sw: new Set(['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on', 'are', 'be', 'this', 'have', 'from', 'or', 'by', 'not', 'but', 'what', 'all', 'were', 'we', 'when', 'there', 'can', 'an', 'which', 'their', 'if', 'will', 'about', 'them', 'these', 'she', 'he', 'they', 'you', 'has', 'his', 'her']) },
  };
  const LATIN_SUPPORTED = ['fr', 'de', 'es', 'ms'];

  function words(sample) {
    return (sample.toLowerCase().match(/[a-zà-öø-ÿœæ]+/g) ?? []);
  }

  function latinScore(code, sample, wordList) {
    const ev = LATIN_EV[code];
    let score = (sample.match(ev.ch) ?? []).length * 1.5;
    for (const w of wordList) if (ev.sw.has(w)) score += 3;
    return score;
  }

  function pageHint(pageLang) {
    const l = (pageLang || '').toLowerCase().split(/[-_]/)[0];
    if (!l) return null;
    if (['zh', 'yue', 'nan', 'hak', 'cmn', 'wuu'].includes(l)) return 'zh';
    if (['ja', 'jpn'].includes(l)) return 'ja';
    if (['ko', 'kor'].includes(l)) return 'ko';
    if (['ar', 'ara'].includes(l)) return 'ar';
    if (['ms', 'zsm', 'msa'].includes(l)) return 'ms';
    if (l === 'he' || l === 'heb' || l === 'iw') return 'he';
    if (['fr', 'de', 'es'].includes(l)) return l;
    return null;
  }

  function result(lang, confidence, reason, extra) {
    const supported = lang !== null && lang !== 'en' && lang !== 'und';
    return Object.assign({ lang, supported, confidence, reason, candidates: [] }, extra || {});
  }

  function detect(text, context, pageLang) {
    text = (text || '').trim();
    context = context || '';
    const hint = pageHint(pageLang);
    if (!text) return result(null, 0, 'empty');

    // 1. Deterministic unique-script rules
    if (RE.hangul.test(text)) return result('ko', 1, 'hangul');
    if (RE.kana.test(text)) return result('ja', 1, 'kana');
    if (RE.hebrew.test(text)) return result('he', 1, 'hebrew');
    if (RE.cyrillic.test(text)) return result('und', 0.4, 'cyrillic-unsupported');

    // 2. Arabic script: Jawi (Malay) vs Arabic
    if (RE.arabic.test(text)) {
      if (JAWI_LETTERS.test(text)) return result('jawi', 0.97, 'jawi-letters', { candidates: [{ lang: 'jawi' }, { lang: 'ar' }] });
      if (hint === 'ms') return result('jawi', 0.9, 'page-lang-ms');
      if (hint === 'ar') return result('ar', 0.95, 'page-lang-ar');
      if (JAWI_LETTERS.test(context)) return result('jawi', 0.85, 'jawi-context', { candidates: [{ lang: 'jawi' }, { lang: 'ar' }] });
      return result('ar', 0.75, 'arabic-default', { candidates: [{ lang: 'ar' }, { lang: 'jawi' }] });
    }

    // 3. Han ideographs (no kana, no hangul): Chinese vs Japanese vs Korean-hanja
    if (RE.han.test(text)) {
      if (hint === 'ja') return result('ja', 0.95, 'page-lang-ja');
      if (hint === 'ko') return result('ko', 0.9, 'page-lang-ko');
      if (hint === 'zh') return result('zh', 0.97, 'page-lang-zh');
      if (RE.kana.test(context)) return result('ja', 0.85, 'kana-in-context', { candidates: [{ lang: 'ja' }, { lang: 'zh' }] });
      if (RE.hangul.test(context)) return result('ko', 0.8, 'hangul-in-context', { candidates: [{ lang: 'ko' }, { lang: 'zh' }] });
      if (SIMPLIFIED_ONLY.test(text)) return result('zh', 0.9, 'simplified-chars');
      if (JAPANESE_ONLY.test(text)) return result('ja', 0.8, 'japanese-chars', { candidates: [{ lang: 'ja' }, { lang: 'zh' }] });
      return result('zh', 0.7, 'han-default', { candidates: [{ lang: 'zh' }, { lang: 'ja' }, { lang: 'ko' }] });
    }

    // 4. Latin script: fr / de / es / ms, or English/unknown
    if (RE.latin.test(text)) {
      if (['fr', 'de', 'es'].includes(hint)) return result(hint, 0.9, 'page-lang-' + hint);
      if (hint === 'ms') return result('ms', 0.9, 'page-lang-ms');
      const sample = text + ' ' + context.slice(0, 400);
      const wl = words(sample);
      const scores = {};
      for (const code of [...LATIN_SUPPORTED, 'en']) scores[code] = latinScore(code, sample, wl);
      const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const [topCode, topScore] = ranked[0];
      const secondScore = ranked[1][1];
      const candidates = ranked.filter(([, s]) => s > 0).map(([lang, score]) => ({ lang, score }));
      if (topScore === 0) {
        // No evidence: fall back to page hint if it is a latin language, else undetermined.
        if (['fr', 'de', 'es', 'ms'].includes(hint)) return result(hint, 0.5, 'latin-fallback-pagelang');
        return result('und', 0.2, 'latin-no-evidence', { candidates });
      }
      if (topCode === 'en') return result('en', 0.6, 'english', { candidates });
      const margin = (topScore - secondScore) / topScore;
      const confidence = Math.min(0.95, 0.55 + margin * 0.4);
      return result(topCode, confidence, 'latin-evidence', { candidates });
    }

    return result(null, 0, 'no-script');
  }

  // --- Mixed-language selection splitting ------------------------------------
  // A selection can span several scripts (e.g. a parallel-translation paragraph). Break
  // it into maximal single-script runs so each is tokenized in its own language instead
  // of forcing the whole selection through the one language the detector picked overall.
  function scriptBucket(ch) {
    const c = ch.codePointAt(0);
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f)) return 'ko';
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) return 'ja'; // kana
    if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || c === 0x3005) return 'han';
    if (c >= 0x0590 && c <= 0x05ff) return 'he';
    if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return 'ar';
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) return 'latin';
    return 'x'; // spaces, digits, punctuation — neutral, stays with the current run
  }
  function splitByScript(text) {
    const runs = [];
    let cur = null, buf = '';
    const flush = () => { if (buf) runs.push({ bucket: cur, text: buf }); buf = ''; };
    for (const ch of text) {
      const b = scriptBucket(ch);
      if (b === 'x' || cur === null || b === cur) { if (b !== 'x' && cur === null) cur = b; buf += ch; continue; }
      // Han is script-ambiguous: an adjacent kana proves Japanese, hangul proves Korean,
      // so let them absorb neighbouring Han rather than splitting a word across runs.
      if (cur === 'han' && (b === 'ja' || b === 'ko')) { cur = b; buf += ch; continue; }
      if ((cur === 'ja' || cur === 'ko') && b === 'han') { buf += ch; continue; }
      flush(); cur = b; buf = ch;
    }
    flush();
    return runs;
  }
  // Split into runs each tagged with a supported language (null for neutral/English text).
  // Detection is per run with no page/context bias, so a Chinese run isn't dragged toward
  // Japanese just because kana appears elsewhere in the same paragraph.
  function splitRuns(text) {
    return splitByScript(text).map((run) => {
      if (!run.bucket || run.bucket === 'x') return { text: run.text, lang: null };
      const d = detect(run.text, run.text, null);
      return { text: run.text, lang: d.supported ? d.lang : null };
    });
  }

  const api = { detect, pageHint, RE, LATIN_SUPPORTED, splitByScript, splitRuns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LensDetect = api;
})(typeof self !== 'undefined' ? self : this);
