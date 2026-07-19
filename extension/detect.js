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

  // --- Common-English lexicon -------------------------------------------------
  // English shares thousands of spellings with French/Spanish/German ("languages" is an
  // archaic French plural; chat, pain, main, content…). The dictionary probe must not
  // pop a foreign entry for a word any English reader just reads as English. ~1,100
  // lemmas: function words, everyday vocabulary, and the Latinate collision zone.
  const ENGLISH_COMMON = new Set(('a able about above accept accident account across act action activity actual add address administration admit adult advance advantage adventure advice affect afford afraid after afternoon again against age agency agent ago agree ahead aid aim air all allow almost alone along already also although always amount an analysis ancient and anger angle angry animal announce annual another answer any anyone anything appear apple apply approach area argue arm army around arrange arrive art article artist as ask assume at attack attempt attend attention attitude attract audience author authority available average avoid awake award aware away baby back bad bag balance ball band bank bar base basic basis battle be bear beat beautiful because become bed before begin behavior behind believe bell belong below benefit best better between beyond big bill billion bird birth bit black block blood blow blue board boat body book border born borrow boss both bottle bottom box boy brain branch brave bread break breakfast breath bridge brief bright bring broad brother brown budget build burn bus business busy but buy by call calm camera camp campaign can cancer candidate capital captain car card care career careful carry case cat catch cause cell center central century certain chain chair challenge chance change channel chapter character charge chart chat cheap check chest chicken chief child choice choose church circle citizen city civil claim class clean clear climb clock close cloth cloud club coach coast coat code coffee cold collect college color come comfort command comment commercial committee common community company compare complete computer concern condition conference confidence confirm conflict congress connect consider constant contain content contest context continue contract control conversation cook cool copy corner correct cost could council count country couple courage course court cover create credit crime crisis cross crowd cultural culture cup current customer cut cycle daily damage dance danger dark data date daughter day dead deal death debate decade decide decision declare deep defense define degree deliver demand democracy department depend describe design desk despite detail determine develop device dictionary die difference different difficult dinner direct direction director discover discuss disease distance divide division do doctor document dog door double doubt down draw dream dress drink drive drop drug dry during duty each early earn earth east easy eat economy edge education effect effort egg eight either election electric element eleven else emergency emotion employee empty end enemy energy engine enjoy enough enter entire environment equal error escape especially establish estimate even evening event ever every evidence exact examine example except exchange excite exercise exist expect experience expert explain express extend eye face fact factor factory fail fair faith fall familiar family famous far farm fast fat father fault fear feature feed feel fellow female fence festival few field fifteen fifty fight figure file fill film final finance find fine finger finish fire firm first fish fit five fix flat floor flow flower fly focus follow food foot for force foreign forest forget form formal former forward found four frame free frequent fresh friend from front fruit fuel full fun function fund further future gain game garden gas gather general generation gift girl give glass global go goal gold good government grab grade grand grant grass great green ground group grow growth guard guess guest guide gun guy habit hair half hall hand handle hang happen happy hard hat hate have he head health hear heart heat heavy height hello help her here herself high hill him himself his history hit hold hole holiday home honest hope horse hospital hot hotel hour house how however huge human hundred hurt husband i ice idea identify if image imagine impact important improve in include income increase indeed independent indicate individual industry influence information inside instead institution insurance intelligence interest international internet interview into introduce invest investigate invite involve iron island issue it item its itself job join joke journey joy judge jump just justice keep key kick kid kill kind king kitchen know knowledge lack lady lake land language large last late laugh law lawyer lay lead leader learn least leave left leg legal less lesson let letter level library lie life light like likely limit line link lip list listen little live local location lock long look lose loss lot loud love low luck lunch machine magazine main maintain major make male man manage manager manner many map mark market marriage master match material matter may maybe me meal mean measure meat media medical meet member memory mention message metal method middle might mile military milk million mind mine minister minor minute mirror miss mission mistake mix model modern moment money monitor month mood moon moral more morning most mother mountain mouse mouth move movie much murder muscle music must my myself name nation national natural nature near nearly necessary neck need neighbor network never new news newspaper next nice night nine no nobody nod noise none nor normal north nose not note nothing notice novel now nuclear number nurse object observe obtain obvious occasion occur ocean odd of off offer office officer official often oil okay old on once one online only onto open operation opinion opportunity option or orange order ordinary organization original other our out outside over own owner pace pack page pain paint pair pale panel paper parent park part particular partner party pass passage past path patient pattern pause pay peace pen people pepper per percent perfect perform perhaps period permit person personal phone photo phrase physical piano pick picture piece pilot pink pipe place plan plane planet plant plastic plate play player please pleasure plenty pocket poem point police policy political politics pool poor popular population position positive possible post pot potential pound pour power practice pray prefer prepare presence present president press pressure pretty prevent previous price pride primary prince principle print prior prison private prize probably problem process produce product profession professor profit program project promise promote proof proper property propose protect proud prove provide public pull purchase pure purpose push put quality quarter queen question quick quiet quite race radio rain raise range rank rapid rare rate rather reach react read ready real reality realize really reason recall receive recent recognize record recover red reduce refer reflect reform refuse regard region regular reject relate relationship release relevant relief religion rely remain remember remove rent repeat replace reply report represent request require research resource respect respond response rest result return reveal review rich ride right ring rise risk river road rock role roll roof room root rope rough round route row rule run rural rush sad safe sail salt same sample sand save say scale scene schedule scheme school science score screen sea search season seat second secret section security see seek seem select sell send senior sense sentence separate series serious serve service session set settle seven several shadow shake shape share sharp she sheet shift shine ship shirt shock shoe shoot shop short shot should shoulder shout show side sign signal silence silver similar simple since sing single sister sit site situation six size skill skin sky sleep slide slip slow small smart smell smile smoke smooth snow so social society soft soil soldier solid solution solve some someone something sometimes son song soon sort soul sound source south space speak special specific speech speed spend spirit split sport spot spread spring square staff stage stand standard star start state statement station stay steal step stick still stock stomach stone stop store storm story straight strange street strength stress stretch strike strong structure struggle student study stuff style subject succeed success such sudden suffer sugar suggest suit summer sun supply support sure surface surprise survey survive sweet swim system table take tale talk tall tank target task taste tax tea teach team tear technology telephone television tell ten tend term test text than thank that the theater their them theme themselves then theory there these they thick thin thing think third thirty this those though thought thousand threat three through throw thus ticket tie time tiny tip tire title to today together tomorrow tone tonight too tool tooth top topic total touch tough tour toward tower town toy track trade tradition traffic train transfer travel treat treatment tree trial trip trouble truck true trust truth try turn twelve twenty twice two type under understand union unit university unless until up upon urban urge us use useful usual valley value variety various vast very victim video view village violence visit voice vote wage wait wake walk wall want war warm warn wash watch water wave way we weak wealth weapon wear weather week weight welcome well west wet what wheel when where whether which while white who whole whose why wide wife wild will win wind window wine wing winner winter wire wise wish with within without woman wonder wood word work worker world worry worth would wound write wrong yard year yellow yes yet you young your yourself youth zone').split(' '));

  function isEnglishCommon(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return false;
    if (ENGLISH_COMMON.has(w)) return true;
    for (const suf of ['s', 'es', 'ed', 'ing', 'ly', 'er', 'est']) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) {
        const base = w.slice(0, -suf.length);
        if (ENGLISH_COMMON.has(base) || ENGLISH_COMMON.has(base + 'e')) return true;
        if (base.length > 2 && base[base.length - 1] === base[base.length - 2] && ENGLISH_COMMON.has(base.slice(0, -1))) return true;
      }
    }
    return false;
  }

  const api = { detect, pageHint, RE, LATIN_SUPPORTED, splitByScript, splitRuns, isEnglishCommon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LensDetect = api;
})(typeof self !== 'undefined' ? self : this);
