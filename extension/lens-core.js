// Module registry shared by all language handlers in the service worker.
// Each langs/<code>.js calls LENS.register('<code>', { handle }).
self.LENS = {
  _mods: Object.create(null),
  register(code, mod) { this._mods[code] = mod; },
  get(code) { return this._mods[code]; },
  has(code) { return code in this._mods; },
  codes() { return Object.keys(this._mods); },
};
