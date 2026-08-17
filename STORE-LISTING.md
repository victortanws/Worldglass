# Chrome Web Store submission — Worldglass

Everything the Developer Dashboard asks for, in the order it asks. Copy-paste ready.
Canonical copy lives here; a dated copy goes to the inbox.

---

## 0. Before you start

| Thing | Value |
|---|---|
| Developer Dashboard | https://chrome.google.com/webstore/devconsole |
| One-time registration fee | **US$5**, paid once per Google account, at first submission |
| Program policies | https://developer.chrome.com/docs/webstore/program-policies |
| Review time | Usually hours to a few days. Broad host permissions can push it longer. |
| Package | `worldglass-2.0.0.zip` (65 MB) — `manifest.json` is at the ZIP root, which the store requires |

Use a Google account you are happy to have permanently associated with the listing.
The developer name shown publicly is set under **Account → Developer name**; set it to
`Victor Tan` before publishing.

---

## 1. Package upload

Upload `worldglass-2.0.0.zip`. Verified before packaging:

- `manifest.json` at ZIP root (not nested in a folder — the most common upload rejection)
- Manifest V3, version `2.0.0`
- Description 123 chars (store hard-caps this field at 132)
- All manifest-referenced files present
- No `.DS_Store`, no source maps, no `node_modules`

---

## 2. Store listing

### Extension name
```
Worldglass — multilingual reading assistant
```

### Short description (132 char max — this is 123)
```
Highlight text in 10 languages: get the sentence's meaning, then every word explained. On-device, no account, nothing sent.
```

### Category
**Education** (secondary fit: Productivity — Education is the better match; the audience
searching is learners, not power users.)

### Language
English (United States)

### Detailed description

```
Highlight a sentence in a language you're learning. Worldglass tells you what it means — then shows you why.

Most tools give you a translation and stop, which tells you nothing you can reuse tomorrow. Worldglass leads with the meaning of the whole sentence, then puts every word underneath it with its reading and its definition, so you can see which word did what. Understanding first, explanation second.

TEN LANGUAGES, ONE EXTENSION
Chinese · Japanese · Korean · Arabic · Jawi · Hebrew · French · German · Spanish · Malay

There's nothing to configure and no language to pick. Worldglass reads the characters on the page and works out the language itself. If a page mixes languages, it handles each part correctly.

WHAT YOU GET WHEN YOU HIGHLIGHT
• The sentence's meaning, up front
• Every word with its pronunciation and meaning underneath
• Chinese: pinyin, plus Cantonese (Jyutping), Hokkien (Tâi-lô) and Teochew readings — switchable, and Simplified or Traditional as you prefer
• Japanese: furigana over kanji, and conjugated verbs traced back to their dictionary form
• Korean: verb endings named, so you can see the tense, politeness and grammar working
• Malay: prefixes and suffixes taken apart, so menggunakan is visibly built from guna
• Arabic, Hebrew and Jawi: transliteration alongside the original script
• Click any word for its full entry, example sentences, and the characters it's built from

READ TEXT INSIDE IMAGES
Drag a box over any image — a comic panel, a screenshot, a photo of a sign — and Worldglass reads the text in it. It cleans the image up first (straightening slanted lettering, separating text from background art), and when a piece of lettering is genuinely beyond it, it says so plainly instead of inventing something.

BUILT TO BE HONEST
A learning tool has to be trustworthy, so Worldglass would rather show you nothing than something invented. Where a dictionary only describes a word's grammatical form, it stays quiet instead of filling the space with jargon. Where a word is genuinely ambiguous, it shows you both readings and lets the sentence decide.

EVERYTHING RUNS ON YOUR DEVICE
No account. No sign-up. No analytics. No server. The dictionaries live inside the extension, on your computer, and the text you highlight is never sent anywhere. It works on a plane.

REMEMBER WHAT YOU READ
Save any word with a tap. Worldglass will bring it back for review on a spaced schedule, asking you to recall it before it shows you the answer — the way memory research says it actually sticks. No points, no streaks, no guilt. Export to Anki or CSV whenever you want.

ALSO
• Adjustable text size, full keyboard control, and screen-reader support
• Tell it which language a particular site is in, and it remembers
• Free and open source

Other languages on request. Found a wrong entry? There's a report link in every popup.

Dictionary data from Wiktionary, CC-CEDICT, JMdict and Tatoeba, used under their licences. See ATTRIBUTION.md in the repository.
```

### Screenshots (1280×800 PNG, up to 5 — all five included)

| File | Shows |
|---|---|
| `01-malay.png` | Malay sentence, affixes traced to roots |
| `02-chinese.png` | Chinese with pinyin, reading-mode chips |
| `03-japanese.png` | Japanese with furigana and grammar labels |
| `04-korean.png` | Korean with endings named |
| `05-french.png` | French — the "ten languages, one extension" shot |

Upload in that order; the first is the one most people see.

### Small promo tile (440×280) — optional but recommended
Not generated. If you want one, the fastest honest version is the Worldglass wordmark on
the `#26251f` ink background with the caption "Ten languages. One extension."

### Store icon
128×128 — already in the package at `icons/icon128.png`. The store pulls it automatically.

---

## 3. Privacy tab — the part reviewers actually read

### Single purpose description
```
Worldglass helps a reader understand foreign-language text on a web page. When the user highlights text, it shows the meaning of that text and a word-by-word breakdown, using dictionaries bundled inside the extension. That is its only purpose.
```

### Permission justifications

**`activeTab`**
```
Used to read the text the user has highlighted on the page they are currently viewing, so it can be looked up and explained. Only invoked in response to a user selection or click.
```

**`storage`**
```
Stores the user's own settings (reading style, script preference, text size) and the words they explicitly choose to save for review. All of it stays on the user's device.
```

**`unlimitedStorage`**
```
The bundled dictionaries for ten languages exceed the default storage quota. This permission allows the dictionary data to be held locally so lookups work offline.
```

**`offscreen`**
```
Hosts the dictionary engine and the OCR engine in a persistent offscreen document. Without it, the MV3 service worker is terminated when idle and every lookup would have to re-parse tens of megabytes of dictionary data, making the extension unusably slow.
```

**`contextMenus`**
```
Adds a right-click item so the user can look up selected text or start reading text in an image.
```

**Host permission `<all_urls>`** — *the one that gets scrutinised. Answer it plainly:*
```
Worldglass is a reading assistant for the whole web: a learner may highlight text on any site — a news article, a forum, a comic reader. The extension cannot know in advance which sites the user will read in a foreign language, so it cannot enumerate a narrower list of hosts.

Access is used only to read text the user has actively highlighted, and to draw the explanation popup on that page. It does not read pages in the background, does not build a browsing history, and does not transmit page content anywhere. All lookup happens locally against dictionaries bundled in the extension.
```

**Remote code**: answer **"No, I am not using remote code."**
All JavaScript and WebAssembly ships inside the package. (Some builds fetch dictionary
*data* files — plain JSON, never executed — but the build you are uploading bundles all
ten languages, so nothing at all is fetched.)

### Data usage — tick these
- [ ] Personally identifiable information — **no**
- [ ] Health information — **no**
- [ ] Financial and payment information — **no**
- [ ] Authentication information — **no**
- [ ] Personal communications — **no**
- [ ] Location — **no**
- [ ] Web history — **no**
- [ ] User activity — **no**
- [ ] Website content — **no**

> On "Website content": Worldglass reads highlighted text only to look it up locally, and
> neither stores nor transmits it. The disclosure is about *collection*, and nothing is
> collected. If a reviewer queries it, the single-purpose text above is the answer.

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL
```
https://victortanws.github.io/Worldglass/privacy.html
```

---

## 4. Distribution

- **Visibility**: Public
- **Distribution**: All regions
- **Pricing**: Free
- **Mature content**: No

---

## 5. Support / homepage fields

| Field | Value |
|---|---|
| Homepage URL | `https://victortanws.github.io/Worldglass/` |
| Support URL | `https://github.com/victortanws/Worldglass/issues` |

---

## 6. Before you hit Publish — final checks

1. Load the unpacked extension from `~/Worldglass/extension` at `chrome://extensions`
   (Developer mode → Load unpacked) and confirm: highlight text on a real page, the popup
   opens, the breakdown is right, and the toolbar popup works.
2. Confirm `https://victortanws.github.io/Worldglass/privacy.html` returns 200 in a browser.
3. Screenshot the working extension on a real site if you want shots taken in your own
   Chrome rather than the harness — either is fine, but they must show the real product.
4. Publish. Expect "Pending review" for a few hours to a few days.

## Likely review friction, and the answer to each

| If they ask | Say |
|---|---|
| Why `<all_urls>`? | The host-permission text in §3 — the point is that a reading assistant cannot enumerate which sites a learner will read. |
| Why is the package 65 MB? | Ten bundled dictionaries, so lookups work offline with nothing transmitted. Size is the direct cost of the privacy guarantee. |
| Is any code remote? | No. All JS and WASM is in the package. |
| Does it collect website content? | No. Highlighted text is looked up locally and immediately discarded. |
