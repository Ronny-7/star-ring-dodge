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
const sessionModule = require("../game-session.js");
const storageModule = require("../storage.js");

const execFileAsync = promisify(execFile);

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
    assert.equal(result.checks.length, 11);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});

test("game session covers start, pause, resume, warp, elite, language, and end", () => {
  const session = sessionModule.createGameSession("drift");

  session.start();
  assert.deepEqual(session.snapshot(), {
    running: true,
    paused: false,
    gameOver: false,
    regionId: "drift",
    regionJunctions: 0,
    eliteSpawned: false,
    language: "zh"
  });

  session.pause();
  assert.equal(session.snapshot().paused, true);
  session.resume();
  assert.equal(session.snapshot().paused, false);
  assert.equal(session.warp("belt"), true);
  assert.equal(session.snapshot().regionId, "belt");
  assert.equal(session.snapshot().regionJunctions, 1);
  assert.equal(session.markEliteSpawned(), true);
  assert.equal(session.snapshot().eliteSpawned, true);
  assert.equal(session.setLanguage("en"), true);
  assert.equal(session.snapshot().language, "en");
  assert.equal(session.setLanguage("fr"), false);

  session.end();
  assert.equal(session.snapshot().gameOver, true);
  assert.equal(session.warp("drift"), false);

  session.start();
  assert.deepEqual(session.snapshot(), {
    running: true,
    paused: false,
    gameOver: false,
    regionId: "drift",
    regionJunctions: 0,
    eliteSpawned: false,
    language: "en"
  });
});

test("storage preserves profile language, totals, and best score", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const profile = storageModule.createDefaultProfile();
  profile.lang = "en";
  profile.totals.runs = 2;
  storageModule.saveProfile(storage, "profile", profile);
  assert.equal(storageModule.loadProfile(storage, "profile").lang, "en");
  assert.equal(storageModule.loadProfile(storage, "profile").totals.runs, 2);

  storageModule.writeBestScore(storage, "best", 1234);
  assert.equal(storageModule.readBestScore(storage, "best"), 1234);
  assert.equal(storageModule.readBestScore(storage, "missing"), 0);
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
