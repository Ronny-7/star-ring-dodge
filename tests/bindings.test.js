const test = require("node:test");
const assert = require("node:assert/strict");

const inputModule = require("../input.js");
const storageModule = require("../storage.js");

const CUSTOM_BINDINGS = {
  forward: "i",
  backward: "k",
  left: "u",
  right: "o",
  boost: "b",
  fire: "f",
  pause: "q"
};

test("old profiles receive default bindings without losing saved data", () => {
  const profile = storageModule.normalizeProfile({
    version: 1,
    lang: "en",
    skin: "delta",
    color: "red",
    totals: { runs: 4 },
    unlocked: { first: 1 }
  });

  assert.deepEqual(profile.bindings, {
    forward: "w",
    backward: "s",
    left: "a",
    right: "d",
    boost: "Shift",
    fire: "j",
    pause: "p"
  });
  assert.equal(profile.lang, "en");
  assert.equal(profile.totals.runs, 4);
  assert.equal(profile.unlocked.first, 1);
});

test("binding normalization accepts complete unique bindings and rejects unusable or conflicting sets", () => {
  assert.deepEqual(inputModule.normalizeBindings(CUSTOM_BINDINGS), CUSTOM_BINDINGS);
  assert.deepEqual(
    inputModule.normalizeBindings({ ...CUSTOM_BINDINGS, pause: "Escape" }),
    inputModule.DEFAULT_BINDINGS
  );
  assert.deepEqual(
    inputModule.normalizeBindings({ ...CUSTOM_BINDINGS, fire: "i" }),
    inputModule.DEFAULT_BINDINGS
  );
});

test("custom bindings persist under the existing profile key", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const profile = storageModule.createDefaultProfile();
  profile.bindings = { ...CUSTOM_BINDINGS };

  storageModule.saveProfile(storage, "profile", profile);

  assert.deepEqual(storageModule.loadProfile(storage, "profile").bindings, CUSTOM_BINDINGS);
  assert.equal(values.size, 1);
});

test("input controller drives remapped movement, boost, fire, and pause actions", () => {
  let fired = 0;
  let paused = 0;
  const input = inputModule.createInputController({
    getBindings: () => CUSTOM_BINDINGS,
    getState: () => ({ running: true, paused: false, gameOver: false }),
    isGameViewActive: () => true,
    fireLaser: () => { fired += 1; },
    togglePause: () => { paused += 1; }
  });
  const event = (key) => ({ key, code: "", preventDefault() {} });

  input.handleKeyDown(event("i"));
  input.handleKeyDown(event("u"));
  input.handleKeyDown(event("b"));
  assert.deepEqual(input.getKeyboardMovement(), { forward: 1, strafe: -1 });
  assert.equal(input.isBoosting(), true);

  input.handleKeyDown(event("f"));
  input.handleKeyDown(event("q"));
  assert.equal(fired, 1);
  assert.equal(input.isFireHeld(), true);
  assert.equal(paused, 1);
  input.handleKeyUp(event("f"));
  assert.equal(input.isFireHeld(), false);
});

test("arrow movement fallback yields to an explicitly assigned arrow action", () => {
  let fired = 0;
  const bindings = { ...CUSTOM_BINDINGS, fire: "ArrowUp" };
  const input = inputModule.createInputController({
    getBindings: () => bindings,
    getState: () => ({ running: true, paused: false, gameOver: false }),
    isGameViewActive: () => true,
    fireLaser: () => { fired += 1; }
  });
  const event = (key) => ({ key, code: key, preventDefault() {} });

  input.handleKeyDown(event("ArrowUp"));
  assert.equal(fired, 1);
  assert.deepEqual(input.getKeyboardMovement(), { forward: 0, strafe: 0 });

  input.handleKeyDown(event("ArrowLeft"));
  assert.deepEqual(input.getKeyboardMovement(), { forward: 0, strafe: -1 });
});
