// Module registry shared by all language handlers (hosted in the offscreen document).
// Each wrapped core calls LENS.register('<code>', { handle }).
//
// Language packs: dictionary files load through LENS.fetchData, which tries three tiers —
// the file bundled in the extension package, the IndexedDB cache, then a one-time network
// download stored into IndexedDB. Slim builds omit the largest dictionaries from the
// package (es/ja/fr/de are 83% of the payload); after the pack lands locally, every lookup
// is as private and offline as a bundled one.
'use strict';

const WG_IDB = {
  open() {
    this._db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('wg-packs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._db;
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async put(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction('files', 'readwrite').objectStore('files').put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

self.LENS = {
  _mods: Object.create(null),
  register(code, mod) { this._mods[code] = mod; },
  get(code) { return this._mods[code]; },
  has(code) { return code in this._mods; },
  codes() { return Object.keys(this._mods); },

  PACK_BASE: 'https://raw.githubusercontent.com/victortanws/Worldglass/main/extension/dict/',
  _packState: Object.create(null), // code -> bundled | cached | downloading | absent

  packState(code) { return this._packState[code] ?? null; },

  // Returns a Response-shaped object ({ ok, json }) so wrapped cores keep their existing
  // `(await fetch(...)).json()` call sites untouched.
  async fetchData(code, file) {
    const key = `${code}/${file}`;
    try {
      const res = await fetch(chrome.runtime.getURL(`dict/${key}`));
      if (res.ok) {
        this._packState[code] = 'bundled';
        const data = await res.json();
        return { ok: true, json: async () => data };
      }
    } catch { /* not bundled — slim build */ }
    if (typeof indexedDB !== 'undefined') {
      const cached = await WG_IDB.get(key).catch(() => undefined);
      if (cached !== undefined) {
        this._packState[code] = 'cached';
        return { ok: true, json: async () => cached };
      }
    }
    this._packState[code] = 'downloading';
    const res = await fetch(this.PACK_BASE + key);
    if (!res.ok) {
      this._packState[code] = 'absent';
      throw new Error(`language pack download failed: ${key} (${res.status})`);
    }
    const data = await res.json();
    if (typeof indexedDB !== 'undefined') WG_IDB.put(key, data).catch(() => {});
    this._packState[code] = 'cached';
    return { ok: true, json: async () => data };
  },
};
