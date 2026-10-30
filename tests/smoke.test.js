const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const audioModule = require("../audio.js");
const rendererModule = require("../renderer.js");
const storageModule = require("../storage.js");

const execFileAsync = promisify(execFile);

test("changed 3D child modules carry the current cache key", async () => {
  const [showcase, world] = await Promise.all([
    readFile(path.resolve(__dirname, "..", "showcase.js"), "utf8"),
    readFile(path.resolve(__dirname, "..", "world3d.js"), "utf8")
  ]);
  for (const source of [showcase, world]) {
    assert.match(source, /\.\/delta-model\.js\?v=4\.6\.4/);
    assert.match(source, /\.\/pickup-models\.js\?v=4\.6\.4/);
  }
});

test("browser loads index.html and exercises the real app integration", async (t) => {
  const edgePath = process.env.STAR_RING_EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edgePath)) {
    t.skip(`Edge was not found at ${edgePath}`);
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const resultDir = await mkdtemp(path.join(tmpdir(), "star-ring-smoke-"));
  const screenshotPath = path.join(resultDir, "smoke.png");
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const relativePath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
      const filePath = path.resolve(projectRoot, "." + relativePath);
      const relativeFilePath = path.relative(projectRoot, filePath);
      if (relativeFilePath.startsWith(".." + path.sep) || path.isAbsolute(relativeFilePath)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const content = await readFile(filePath);
      const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" };
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const browser = await execFileAsync(edgePath, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--user-data-dir=" + path.join(resultDir, "profile"),
      "--virtual-time-budget=2500",
      "--window-size=1280,900",
      "--screenshot=" + screenshotPath,
      "--dump-dom",
      `http://127.0.0.1:${port}/tests/browser-smoke.html`
    ], { windowsHide: true });

    const browserPage = await readFile(screenshotPath);
    assert.ok(browserPage.length > 0, "browser produced a non-empty page screenshot");
    const marker = "SMOKE_RESULT:";
    const markerIndex = browser.stdout.lastIndexOf(marker);
    assert.notEqual(markerIndex, -1, "browser smoke page did not publish a result");
    const result = JSON.parse(browser.stdout.slice(markerIndex + marker.length).trim().split("</body>")[0]);
    assert.equal(result.error, null, result.error || "browser integration smoke test failed");
    assert.equal(result.checks.length, 27);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});

test("storage preserves profile language, totals, and best score", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const profile = storageModule.createDefaultProfile();
  profile.lang = "en";
  profile.skin = "delta";
  profile.color = "red";
  profile.totals.runs = 2;
  storageModule.saveProfile(storage, "profile", profile);
  assert.equal(storageModule.loadProfile(storage, "profile").lang, "en");
  assert.equal(storageModule.loadProfile(storage, "profile").skin, "delta");
  assert.equal(storageModule.loadProfile(storage, "profile").color, "red");
  assert.equal(storageModule.loadProfile(storage, "profile").totals.runs, 2);

  storageModule.writeBestScore(storage, "best", 1234);
  assert.equal(storageModule.readBestScore(storage, "best"), 1234);
  assert.equal(storageModule.readBestScore(storage, "missing"), 0);
});

test("recordRun accumulates totals and accuracy", () => {
  const profile = storageModule.createDefaultProfile();
  const stats = {
    shotsFired: 4,
    shotsHit: 2,
    destroyedAsteroids: 3,
    collectedCores: 1,
    survivalTime: 42.7
  };
  storageModule.recordRun(profile, stats, 2);
  assert.equal(profile.totals.runs, 1);
  assert.equal(profile.totals.destroyedAsteroids, 3);
  assert.equal(profile.totals.collectedCores, 1);
  assert.equal(profile.totals.warps, 2);
  assert.equal(profile.totals.longestSurvival, 42);
  assert.equal(profile.totals.bestAccuracy, 50);

  storageModule.recordRun(profile, { ...stats, shotsFired: 0, shotsHit: 0, survivalTime: 10 }, 0);
  assert.equal(profile.totals.runs, 2);
  assert.equal(profile.totals.longestSurvival, 42, "longer run wins");
  assert.equal(profile.totals.bestAccuracy, 50, "worse accuracy does not lower the best");
});

test("disabling sfx also disables vibration", () => {
  const vibrations = [];
  const audio = audioModule.createAudioController({
    windowObject: {},
    navigatorObject: { vibrate: (duration) => vibrations.push(duration) }
  });

  audio.playSound("shoot");
  assert.deepEqual(vibrations, [10]);
  assert.equal(audio.toggleSfx(), false);
  audio.playSound("shoot");
  assert.deepEqual(vibrations, [10]);
});

test("touch boost engages high and releases low", () => {
  const { nextBoostState } = require("../input.js");
  assert.equal(nextBoostState(false, 0.7, 0.88, 0.78), false);
  assert.equal(nextBoostState(false, 0.9, 0.88, 0.78), true);
  assert.equal(nextBoostState(true, 0.85, 0.88, 0.78), true);
  assert.equal(nextBoostState(true, 0.7, 0.88, 0.78), false);
  assert.equal(nextBoostState(false, 0.85, 0.88, 0.78), false);
});

test("pointer boost uses the tuning object, not a copied threshold", () => {
  const { createInputController } = require("../input.js");
  // 40px of a 48px stick is scale 0.833: below the real 0.88 edge, above 0.5.
  const engage = (touchBoostOn) => {
    const listeners = {};
    const pad = {
      style: { setProperty() {} },
      classList: { toggle() {} },
      setPointerCapture() {},
      addEventListener(type, fn) { listeners[type] = fn; }
    };
    const input = createInputController({
      windowObject: { addEventListener() {} },
      documentObject: {
        addEventListener() {},
        getElementById() { return null; },
        querySelector(selector) { return selector === "[data-gesture-pad]" ? pad : null; },
        querySelectorAll() { return []; }
      },
      tuning: { touchBoostOn, touchBoostOff: touchBoostOn - 0.1 }
    });
    input.bind();
    const point = (type, clientY) => listeners[type]({
      pointerId: 1,
      clientX: 0,
      clientY,
      preventDefault() {}
    });
    point("pointerdown", 0);
    point("pointermove", -40);
    return input.isBoosting();
  };
  assert.equal(engage(0.5), true);
  assert.equal(engage(0.95), false);
});

test("render loop updates and draws one frame", () => {
  const callbacks = [];
  const calls = [];
  const state = { lastTime: 0, running: true, paused: false, gameOver: false };
  const loop = rendererModule.createRenderLoop({
    windowObject: { requestAnimationFrame(callback) { callbacks.push(callback); } },
    state,
    tuning: { idleFrameInterval: 1000 / 12 },
    update(dt) { calls.push(["update", dt]); },
    draw() { calls.push(["draw"]); }
  });

  loop.start();
  assert.equal(callbacks.length, 1);
  callbacks.shift()(1000);
  assert.deepEqual(calls, [["update", 0], ["draw"]]);
  assert.equal(callbacks.length, 1);
});
