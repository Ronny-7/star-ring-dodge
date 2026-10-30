(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingBindings = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BINDING_ACTIONS = Object.freeze(["forward", "backward", "left", "right", "boost", "fire", "pause"]);
  const DEFAULT_BINDINGS = Object.freeze({
    forward: "w",
    backward: "s",
    left: "a",
    right: "d",
    boost: "Shift",
    fire: "j",
    pause: "p"
  });
  const NAMED_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"]);

  function normalizeBindingKey(key) {
    if (typeof key !== "string") return null;
    if (/^[a-z0-9]$/i.test(key)) return key.toLowerCase();
    return NAMED_KEYS.has(key) ? key : null;
  }

  function normalizeBindings(raw) {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_BINDINGS };
    const bindings = {};
    for (const action of BINDING_ACTIONS) {
      const key = normalizeBindingKey(raw[action]);
      if (!key) return { ...DEFAULT_BINDINGS };
      bindings[action] = key;
    }
    if (new Set(Object.values(bindings)).size !== BINDING_ACTIONS.length) return { ...DEFAULT_BINDINGS };
    return bindings;
  }

  return { BINDING_ACTIONS, DEFAULT_BINDINGS, normalizeBindingKey, normalizeBindings };
});
