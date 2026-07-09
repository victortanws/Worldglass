# Worldglass

**A reading glass for the whole web.** Worldglass is a Chrome extension that turns any
foreign-language page into an *explorable* text: select any word to see its reading,
meaning, examples, and the characters it's built from — in ten languages, entirely on
your device.

> Translation gives you the answer. Worldglass shows you how the answer is built.

Created by [Victor Tan](https://www.victor-tan.com) · [YouTube](https://www.youtube.com/@VictorTan)

---

## What it does

- **Select any word** on any page → reading (pinyin / furigana / romanization /
  vowelization), meaning, and real example sentences.
- **Word families** (Chinese, Japanese, Korean): tap a character to explore the common
  words built from it — 学 → 学校 · 大学 · 学习.
- **Nested reference**: click a word *inside* a definition to look it up in turn.
- **Mixed-language selections**: each run is detected and annotated in its own language.
- **OCR**: click the toolbar button, drag a box over text inside an image, and it becomes
  explorable text — recognized on your device, nothing uploaded.
- **Ten languages**: Chinese (+ Cantonese / Hokkien / Teochew readings), Japanese, Korean,
  Arabic, Hebrew, Jawi, Malay, French, German, Spanish. More on request.

Everything runs locally. The dictionaries are bundled with the extension, so lookups never
touch a server — no account, no analytics, no tracking.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the [`extension/`](extension/) folder.
4. Pin Worldglass from the extensions (puzzle-piece) menu, then select text on any page.

## The site

The landing / about page lives in [`docs/`](docs/) and is a single self-contained HTML
file. To publish it with GitHub Pages: **Settings → Pages → Source: `main` / `/docs`**.

## Attribution

Worldglass bundles several open dictionaries and OCR data. See
[`extension/ATTRIBUTION.md`](extension/ATTRIBUTION.md) for per-language sources and licenses.

## License

Code © Victor Tan. Bundled dictionary and OCR data retain their original licenses (see
attribution).
