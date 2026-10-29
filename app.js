const canvas = document.getElementById("game");
const hudCanvas = document.getElementById("hud");
const ctx = hudCanvas.getContext("2d");
const { bestKey, profileKey, tuning, uiText, regions, achievements, profileUi, i18n } = window.starRingConfig;
const audioController = window.starRingAudio.createAudioController({ windowObject: window, navigatorObject: navigator });
const storageController = window.starRingStorage;
const projection = window.starRingProjection;
let world3d = null;

const startMusic = () => audioController.startMusic();
const stopMusic = () => audioController.stopMusic();
const playSound = (type) => audioController.playSound(type);

let ui = (window.starRingConfig.uiText && window.starRingConfig.uiText.zh) || {};

const overlayStats = document.getElementById("overlay-stats");
const overlayStatGrid = document.getElementById("overlay-stat-grid");
const overlayRecord = document.getElementById("overlay-record");
const startButton = document.getElementById("start-button");
const backHomeButton = document.getElementById("back-home");
const playfieldEl = canvas.parentElement;
const orientationButton = document.querySelector("[data-orientation-button]");
const settingsButton = document.getElementById("settings-button");
const settingsCloseButton = document.querySelector(".settings-close");
const mobileViewportQuery = window.matchMedia("(pointer: coarse), (max-width: 780px)");

function L(key, ...args) {
  const table = (i18n && i18n[state ? state.lang : "zh"]) || {};
  const entry = table[key];
  if (typeof entry === "function") return entry(...args);
  return entry != null ? entry : key;
}

function regionDisplayName(r) {
  if (!r) return "";
  return state.lang === "en" ? (r.nameEn || r.label || r.name) : (r.name || r.label || r.nameEn);
}

function achLabel(a) {
  if (!a) return "";
  return state.lang === "en" ? (a.labelEn || a.label) : (a.label || a.labelEn);
}

function applyLanguage() {
  ui = (uiText && uiText[state.lang]) || uiText.zh || ui;
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === (state ? state.lang : "zh"));
  });
}

function setLanguage(lang) {
  if (lang !== "zh" && lang !== "en") return;
  state.lang = lang;
  applyLanguage();
  if (typeof profile !== "undefined" && profile) {
    profile.lang = lang;
    storageController.saveProfile(localStorage, profileKey, profile);
  }
  applyLanguageToDOM();
  syncLandscapeUi();
  if (overlay && !overlay.classList.contains("hidden")) {
    if (overlayMode === "pause") {
      showOverlay("pause", ui.pauseTitle, ui.pauseText, ui.pauseButton);
    } else if (overlayMode === "gameover") {
      showOverlay(
        "gameover",
        lastGameOver.newBest ? ui.recordTitle : ui.gameOverTitle,
        lastGameOver.newBest ? ui.newRecord(lastGameOver.score) : ui.gameOver(lastGameOver.score),
        ui.restartButton
      );
    }
  }
}

function applyLanguageToDOM() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setAttr = (id, attr, text) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, text);
  };
  document.title = L("gameTitle");
  set("score-label", L("scoreLabel"));
  set("health-label", L("healthLabel"));
  set("best-label", L("bestLabel"));
  set("orientation-hint", L("orientationHint"));
  set("touch-drag-label", L("touchDrag"));
  set("touch-fire-btn", L("touchFire"));
  set("touch-pause-btn", L("touchPause"));
  set("overlay-record", L("newRecord"));
  setAttr("game", "aria-label", L("gameTitle"));
  setAttr("settings-button", "aria-label", L("settings"));
  setAttr("settings-close-button", "aria-label", L("close"));
  setAttr("touch-controls-wrap", "aria-label", L("touchDrag"));
  set("panel-label", L("settings"));
  set("settings-audio-title", L("audio"));
  set("settings-music-label", L("music"));
  set("settings-sfx-label", L("sfx"));
  set("settings-ship-title", L("ship"));
  set("skin-fighter", L("fighter"));
  set("skin-delta", L("delta"));
  set("skin-saucer", L("saucer"));
  set("back-home", ui.homeReturn);
  set("settings-color-title", L("shipColor"));
  set("settings-language-title", L("language"));
  syncToggleButton(musicBtn, audioController.isMusicEnabled());
  syncToggleButton(sfxBtn, audioController.isSfxEnabled());
  document.querySelectorAll(".skin-card").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.skin === activeSkin));
  });
  document.querySelectorAll(".color-swatch").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.color === activeColor));
  });
}

let activeSkin = "default";
let activeColor = "blue";

const DEFAULT_REGION_ID = "drift";

const COLORS = {
  blue: makeColor(98, 228, 255),
  red: makeColor(255, 111, 135),
  green: makeColor(138, 255, 209)
};

function makeColor(r, g, b) {
  const rgb = `${r},${g},${b}`;
  const hiRgb = `${softenChannel(r)},${softenChannel(g)},${softenChannel(b)}`;
  return { rgb, hi: `rgb(${hiRgb})`, mid: `rgb(${rgb})`, glow: `rgb(${rgb})` };
}

function softenChannel(channel) { return Math.round(channel + (255 - channel) * 0.92); }
function rgba(rgb, alpha) { return `rgba(${rgb},${alpha})`; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function getTuningValue(name, fallback) {
  const value = tuning[name];
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function distanceSquared3d(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
function isWithinRadius3d(ax, ay, az, bx, by, bz, radius) {
  return distanceSquared3d(ax, ay, az, bx, by, bz) < radius * radius;
}
function syncToggleButton(button, enabled) {
  button.textContent = enabled ? L("on") : L("off");
  button.classList.toggle("active", enabled);
  button.setAttribute("aria-pressed", String(enabled));
}

function toggleMusic() {
  const enabled = audioController.toggleMusic();
  syncToggleButton(musicBtn, enabled);
}

function toggleSfx() {
  const enabled = audioController.toggleSfx();
  syncToggleButton(sfxBtn, enabled);
}

const musicBtn = document.getElementById("settings-music-btn");
const sfxBtn = document.getElementById("settings-sfx-btn");
const scoreEl = document.getElementById("score");
const healthEl = document.getElementById("health");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

/* ---------- 画布 ---------- */

function getDisplaySize() {
  const rect = playfieldEl.getBoundingClientRect();
  const width = playfieldEl.clientWidth || rect.width || canvas.width;
  const height = playfieldEl.clientHeight || rect.height || canvas.height;
  return {
    width: Math.max(320, Math.round(width)),
    height: Math.max(240, Math.round(height))
  };
}

let dpr = 1;
let cw = 960, ch = 600;

function resizeCanvas() {
  const { width, height } = getDisplaySize();
  // 3D 透视下按设备全量渲染会拖垮手机，DPR 封顶 2。
  const nextDpr = Math.min(window.devicePixelRatio || 1, getTuningValue("dprCap", 2));
  const physW = Math.round(width * nextDpr);
  const physH = Math.round(height * nextDpr);
  const changed = canvas.width !== physW || canvas.height !== physH || dpr !== nextDpr;
  if (!changed) return;

  dpr = nextDpr;
  cw = width;
  ch = height;

  // WebGL canvas backing size is owned by three; the HUD overlay we size here.
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  hudCanvas.width = physW;
  hudCanvas.height = physH;
  hudCanvas.style.width = width + "px";
  hudCanvas.style.height = height + "px";

  world3d?.resize(width, height);
  state.player.radius = getPlayerRadius();
}

function getGameplayScale() {
  const shortSide = Math.min(cw, ch);
  return Math.max(0.72, Math.min(1, shortSide / 560));
}

function getPlayerRadius() {
  return getTuningValue("playerRadius3d", 26) * getGameplayScale();
}

function isPortraitViewport() {
  return window.innerHeight >= window.innerWidth;
}

function syncLandscapeUi() {
  const forced = document.body.classList.contains("force-landscape");
  const compactLandscape = mobileViewportQuery.matches && (forced || !isPortraitViewport());
  document.body.classList.toggle("landscape-layout", compactLandscape);
  if (orientationButton) {
    orientationButton.textContent = forced ? L("exit") : L("landscape");
  }
}

function isForceLandscapeMode() {
  return document.body.classList.contains("force-landscape");
}

function isCompactLandscapeMode() {
  return document.body.classList.contains("landscape-layout");
}

function refreshCanvasSoon() {
  syncLandscapeUi();
  requestAnimationFrame(() => {
    resizeCanvas();
    draw();
  });
  window.setTimeout(() => {
    resizeCanvas();
    draw();
  }, 220);
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatRate(hits, shots) {
  if (shots <= 0) return "--";
  return `${Math.round((hits / shots) * 100)}%`;
}

/* ---------- 覆盖层 ---------- */

function renderOverlayStats(stats, isRecord) {
  const statCards = stats.map(({ label, value }) => {
    const card = document.createElement("article");
    const labelEl = document.createElement("span");
    const valueEl = document.createElement("strong");
    card.className = "overlay-stat-card";
    labelEl.className = "overlay-stat-label";
    valueEl.className = "overlay-stat-value";
    labelEl.textContent = label;
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    return card;
  });
  overlayStatGrid.replaceChildren(...statCards);
  overlayStats.classList.remove("hidden");
  overlayRecord.classList.toggle("hidden", !isRecord);
}

function hideOverlayStats() {
  overlayStats.classList.add("hidden");
  overlayRecord.classList.add("hidden");
  overlayStatGrid.replaceChildren();
}

function showOverlay(mode, title, text, buttonText) {
  overlayMode = mode;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  if (backHomeButton) backHomeButton.hidden = mode !== "pause";
  if (mode !== "gameover") hideOverlayStats();
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
  if (backHomeButton) backHomeButton.hidden = true;
}

/* ---------- 存档 ---------- */

let bestScore = storageController.readBestScore(localStorage, bestKey);
let profile = storageController.loadProfile(localStorage, profileKey);
if (profile.skin) activeSkin = profile.skin;
if (profile.color) activeColor = profile.color;
let runAchievementUnlocks = [];
// The landing view owns the first screen, so no start panel exists to return to.
let overlayMode = "none";
let lastGameOver = { score: 0, newBest: false };
const hudCache = { score: null, health: null, best: null };
bestEl.textContent = String(bestScore);

function recordRunToProfile() {
  storageController.recordRun(profile, state.stats, state.regionJunctions);
  storageController.saveProfile(localStorage, profileKey, profile);
}

/* ---------- 状态 ---------- */

const state = {
  lang: (profile && profile.lang) || "zh",
  running: false,
  paused: false,
  gameOver: false,
  lastTime: 0,
  spawnTimer: 0,
  coreTimer: 0,
  powerUpTimer: 0,
  difficultyTimer: 0,
  pulseTime: 0,
  score: 0,
  health: 3,
  speedScale: 1,
  spawnInterval: tuning.baseSpawnInterval,
  flashTimer: 0,
  invulnerabilityTimer: 0,
  screenShakeTimer: 0,
  screenShakeStrength: 0,
  shootCooldown: 0,
  shieldCharges: 0,
  doubleShotTimer: 0,
  regionId: DEFAULT_REGION_ID,
  regionTimer: 0,
  regionJunctions: 0,
  achievementTimer: 0,
  eliteTimer: 0,
  routeChoice: { active: false, timer: 0, bannerTimer: 0, gates: [] },
  shipColor: COLORS[activeColor] || COLORS.blue,
  stats: {
    survivalTime: 0,
    destroyedAsteroids: 0,
    destroyedElites: 0,
    collectedCores: 0,
    shotsFired: 0,
    shotsHit: 0,
    damagedThisRun: false,
    newBest: false
  },
  // Free-flight ship: yaw/pitch aim the nose, velocity is in world space.
  player: {
    x: 0,
    y: 0,
    z: 0,
    radius: 26,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    thrust: 0,
    boost: false
  },
  // Camera lags the ship so turns read as motion rather than a snap.
  camera: {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0
  },
  world: {
    width: getTuningValue("worldWidth3d", 60000),
    height: getTuningValue("worldHeight3d", 60000),
    depth: getTuningValue("worldDepth3d", 60000)
  },
  asteroids: [],
  cores: [],
  powerUps: [],

  lasers: [],
  fx: { debris: [], flashes: [], rings: [], sparks: [] },
  warpFlash: { timer: 0, duration: 0, tint: "98,228,255", secondaryTint: "123,140,255" }
};

let inputController = null;
let gestureMovement = null;

function getCurrentRegion() {
  return regions[state.regionId] || regions[DEFAULT_REGION_ID];
}

function getRegionMultiplier(region, name) {
  const value = region[name];
  return typeof value === "number" ? value : 1;
}

function getRouteAdjustedSpawnInterval(region) {
  const slowdown = state.routeChoice.active ? tuning.routeChoiceSpawnSlowdown : 1;
  return state.spawnInterval * getRegionMultiplier(region, "asteroidSpawnMultiplier") * slowdown;
}

function triggerScreenShake(duration, strength) {
  state.screenShakeTimer = Math.max(state.screenShakeTimer, duration);
  state.screenShakeStrength = Math.max(state.screenShakeStrength, strength);
}

/* ---------- 重开 ---------- */

function resetGame() {
  inputController.clearAll();
  resizeCanvas();
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  startMusic();
  state.lastTime = 0;
  state.spawnTimer = 0;
  state.coreTimer = 0;
  state.powerUpTimer = 0;
  state.difficultyTimer = 0;
  state.pulseTime = 0;
  state.score = 0;
  state.health = 3;
  state.speedScale = 1;
  state.spawnInterval = tuning.baseSpawnInterval;
  state.flashTimer = 0;
  state.invulnerabilityTimer = 0;
  state.screenShakeTimer = 0;
  state.screenShakeStrength = 0;
  state.shootCooldown = 0;
  state.shieldCharges = 0;
  state.doubleShotTimer = 0;
  state.regionId = DEFAULT_REGION_ID;
  world3d?.setRegionTint(regions[DEFAULT_REGION_ID].tint);
  state.regionTimer = 0;
  state.regionJunctions = 0;
  state.eliteTimer = 0;
  state.routeChoice.active = false;
  state.routeChoice.timer = 0;
  state.routeChoice.bannerTimer = 0;
  state.routeChoice.gates = [];
  state.stats.survivalTime = 0;
  state.stats.destroyedAsteroids = 0;
  state.stats.destroyedElites = 0;
  state.stats.collectedCores = 0;
  state.stats.shotsFired = 0;
  state.stats.shotsHit = 0;
  state.stats.newBest = false;
  state.stats.damagedThisRun = false;
  state.achievementTimer = 0;
  runAchievementUnlocks.length = 0;
  state.player.radius = getPlayerRadius();
  state.player.x = state.world.width / 2;
  state.player.y = state.world.height / 2;
  state.player.z = state.world.depth / 2;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.vz = 0;
  state.player.yaw = 0;
  state.player.pitch = 0;
  state.player.roll = 0;
  state.player.thrust = 0;
  state.player.boost = false;
  snapCameraToShip();
  state.asteroids = [];
  state.cores = [];
  state.powerUps = [];
  state.lasers = [];
  state.fx = { debris: [], flashes: [], rings: [], sparks: [] };
  state.warpFlash.timer = 0;
  state.warpFlash.duration = 0;
  state.warpFlash.tint = regions[DEFAULT_REGION_ID].tint;
  state.warpFlash.secondaryTint = regions[DEFAULT_REGION_ID].secondaryTint;

  syncHud();
  hideOverlay();
}

function syncHud() {
  const nextScore = String(Math.floor(state.score));
  const nextHealth = `${"♥".repeat(state.health)}${"♡".repeat(3 - state.health)}`;
  const nextBest = String(Math.max(bestScore, Math.floor(state.score)));
  if (hudCache.score !== nextScore) { scoreEl.textContent = nextScore; hudCache.score = nextScore; }
  if (hudCache.health !== nextHealth) { healthEl.textContent = nextHealth; hudCache.health = nextHealth; }
  if (hudCache.best !== nextBest) { bestEl.textContent = nextBest; hudCache.best = nextBest; }
}

/* ---------- 设置面板 ---------- */

const settingsOverlay = document.getElementById("settings-overlay");
let pausedBeforeSettings = false;
let settingsReturnFocus = null;

function getSettingsFocusableElements() {
  return Array.from(settingsOverlay.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"))
    .filter((element) => element.getClientRects().length > 0);
}

function handleSettingsKeydown(event) {
  if (settingsOverlay.classList.contains("hidden")) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSettings();
    return true;
  }
  if (event.key !== "Tab") return true;
  const focusable = getSettingsFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

function openSettings() {
  if (!settingsOverlay.classList.contains("hidden")) return;
  settingsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : settingsButton;
  settingsOverlay.classList.remove("hidden");
  settingsOverlay.setAttribute("aria-hidden", "false");
  settingsButton.setAttribute("aria-expanded", "true");
  applyLanguageToDOM();
  pausedBeforeSettings = state.paused;
  if (state.running && !state.paused && !state.gameOver) {
    state.paused = true;
    inputController.clearAll();
  }
  window.requestAnimationFrame(() => settingsCloseButton?.focus());
}

function closeSettings() {
  if (settingsOverlay.classList.contains("hidden")) return;
  settingsOverlay.classList.add("hidden");
  settingsOverlay.setAttribute("aria-hidden", "true");
  settingsButton.setAttribute("aria-expanded", "false");
  if (state.running && state.paused && !state.gameOver && !pausedBeforeSettings) {
    state.paused = false;
    state.lastTime = 0;
  }
  if (settingsReturnFocus instanceof HTMLElement && document.contains(settingsReturnFocus)) {
    settingsReturnFocus.focus();
  }
  settingsReturnFocus = null;
}

function selectSkin(name) {
  activeSkin = name;
  world3d?.setShipVariant(name);
  document.querySelectorAll(".skin-card").forEach((el) => {
    const active = el.dataset.skin === name;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  profile.skin = name;
  storageController.saveProfile(localStorage, profileKey, profile);
  renderSkinPreviews();
}

function selectColor(name) {
  activeColor = name;
  state.shipColor = COLORS[name] || COLORS.blue;
  world3d?.setShipColor(state.shipColor.mid);
  document.querySelectorAll(".color-swatch").forEach((el) => {
    const active = el.dataset.color === name;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  profile.color = name;
  storageController.saveProfile(localStorage, profileKey, profile);
  renderSkinPreviews();
}

const SKIN_SHAPES = {
  default: { wingSpan: 1.45, wingRoot: 0.32, nose: 1.05, tail: 0.55 },
  delta: { wingSpan: 1.65, wingRoot: 0.28, nose: 0.95, tail: 0.5 },
  saucer: { wingSpan: 1.3, wingRoot: 1.2, nose: 0.55, tail: 0.55 }
};

function renderSkinPreviews() {
  const col = COLORS[activeColor];
  document.querySelectorAll(".skin-preview").forEach((preview) => {
    const skinName = preview.closest(".skin-card").dataset.skin;
    const pctx = preview.getContext("2d");
    const size = preview.width;
    const shape = SKIN_SHAPES[skinName] || SKIN_SHAPES.default;
    const unit = size * 0.2;
    pctx.clearRect(0, 0, size, size);
    pctx.save();
    pctx.translate(size / 2, size / 2 + unit * 0.3);

    pctx.fillStyle = rgba(col.rgb, 0.45);
    pctx.beginPath();
    pctx.moveTo(-unit * shape.wingSpan, unit * 0.42);
    pctx.lineTo(-unit * shape.wingRoot, -unit * 0.42);
    pctx.lineTo(-unit * 0.2, unit * 0.5);
    pctx.closePath();
    pctx.fill();
    pctx.beginPath();
    pctx.moveTo(unit * shape.wingSpan, unit * 0.42);
    pctx.lineTo(unit * shape.wingRoot, -unit * 0.42);
    pctx.lineTo(unit * 0.2, unit * 0.5);
    pctx.closePath();
    pctx.fill();

    const hull = pctx.createLinearGradient(0, -unit * shape.nose, 0, unit * shape.tail);
    hull.addColorStop(0, col.hi);
    hull.addColorStop(0.5, col.mid);
    hull.addColorStop(1, "#081428");
    pctx.fillStyle = hull;
    pctx.beginPath();
    pctx.moveTo(0, -unit * shape.nose);
    pctx.lineTo(unit * 0.42, unit * 0.1);
    pctx.lineTo(unit * 0.26, unit * shape.tail);
    pctx.lineTo(-unit * 0.26, unit * shape.tail);
    pctx.lineTo(-unit * 0.42, unit * 0.1);
    pctx.closePath();
    pctx.fill();

    pctx.shadowBlur = 10;
    pctx.shadowColor = col.glow;
    pctx.strokeStyle = rgba(col.rgb, 0.8);
    pctx.lineWidth = 1.5;
    pctx.stroke();
    pctx.restore();
  });
}

/* ---------- 3D 世界 ---------- */

function makeAsteroidShape(radius) {
  const craterCount = 3 + Math.floor(Math.random() * 3);
  const craters = Array.from({ length: craterCount }, () => ({
    x: (Math.random() - 0.5) * radius * 0.9,
    y: (Math.random() - 0.5) * radius * 0.9,
    r: radius * (0.1 + Math.random() * 0.2),
    shade: 0.75 + Math.random() * 0.35
  }));
  return { craters };
}

function makeAsteroid(x, y, z, radius, vx, vy, vz, region, scale = getGameplayScale()) {
  const shape = makeAsteroidShape(radius);
  const mineralChance = Math.random();
  const mineralTint = mineralChance > 0.82 ? region.tint : mineralChance > 0.68 ? region.secondaryTint : "160,180,220";
  return {
    x,
    y,
    z,
    radius,
    vx,
    vy,
    vz,
    spin: (Math.random() - 0.5) * 0.9,
    rotation: Math.random() * Math.PI * 2,
    craters: shape.craters,
    mineralTint,
    surfaceTone: 0.86 + Math.random() * 0.28,
    hp: radius > tuning.largeAsteroidThreshold * scale ? 2 : 1,
    hitFlash: 0,
    elite: false
  };
}

// Random point in an ellipsoid shell around a centre, so spawns stay fair.
function sampleAround(centerX, centerY, centerZ, minDistance, maxDistance) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const distance = minDistance + Math.random() * (maxDistance - minDistance);
  const sinPhi = Math.sin(phi);
  const x = centerX + Math.cos(theta) * sinPhi * distance;
  const y = centerY + Math.cos(phi) * distance;
  const z = centerZ + Math.sin(theta) * sinPhi * distance;
  return {
    x: clamp(x, 40, state.world.width - 40),
    y: clamp(y, 40, state.world.height - 40),
    z: clamp(z, 40, state.world.depth - 40)
  };
}

function canAddAsteroid() {
  return state.asteroids.length < getTuningValue("maxAsteroids", 30);
}

function spawnAsteroid(region = getCurrentRegion()) {
  if (!canAddAsteroid()) return null;
  const scale = getGameplayScale();
  const radius = (Math.random() * getTuningValue("asteroidRadiusRange3d", 34) + getTuningValue("asteroidRadiusMin3d", 30)) * scale;
  const spawn = sampleAround(
    state.player.x,
    state.player.y,
    state.player.z,
    tuning.safeSpawnDistance + radius,
    getTuningValue("farDistance", 1700) * 0.8
  );
  const speed = (Math.random() * getTuningValue("asteroidSpeedRange3d", 55) + getTuningValue("asteroidSpeed3d", 70))
    * state.speedScale
    * getRegionMultiplier(region, "asteroidSpeedMultiplier");
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  state.asteroids.push(makeAsteroid(
    spawn.x, spawn.y, spawn.z,
    radius,
    Math.cos(theta) * Math.sin(phi) * speed,
    Math.cos(phi) * speed,
    Math.sin(theta) * Math.sin(phi) * speed,
    region,
    scale
  ));
}

function getRegionEliteChance(region) {
  return typeof region.eliteChance === "number" ? region.eliteChance : 0;
}

function countEliteAsteroids() {
  return state.asteroids.reduce((count, asteroid) => count + (asteroid.elite ? 1 : 0), 0);
}

function spawnEliteAsteroid(region = getCurrentRegion()) {
  if (!canAddAsteroid()) return null;
  const scale = getGameplayScale();
  const radius = (tuning.asteroidRadiusMin + tuning.asteroidRadiusRange) * getTuningValue("eliteRadiusMultiplier", 2.05) * scale;
  const spawn = sampleAround(state.player.x, state.player.y, state.player.z, 520, 900);
  const elite = makeAsteroid(spawn.x, spawn.y, spawn.z, radius, 0, 0, 0, region, scale);
  elite.elite = true;
  elite.hp = getTuningValue("eliteHp", 6);
  elite.maxHp = elite.hp;
  elite.maxSpeed = getTuningValue("eliteMaxSpeedMultiplier", 0.8) * getTuningValue("shipSpeed3d", 330);
  state.asteroids.push(elite);
  return elite;
}

function updateEliteFlow(dt, region) {
  const firstDelay = getTuningValue("eliteFirstDelay", 16);
  const minInterval = getTuningValue("eliteMinInterval", 22);
  const maxActive = Math.floor(getTuningValue("eliteMaxActive", 1));
  state.eliteTimer += dt;

  if (state.stats.survivalTime < firstDelay) return;
  if (state.eliteTimer < minInterval) return;
  if (countEliteAsteroids() >= maxActive) return;
  if (state.routeChoice.active) return;
  if (Math.random() > getRegionEliteChance(region)) return;

  state.eliteTimer = 0;
  if (!spawnEliteAsteroid(region)) return;
}

function steerEliteAsteroid(elite, dt) {
  const accel = getTuningValue("eliteHomingAccel", 30);
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const dz = state.player.z - elite.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  elite.vx += (dx / dist) * accel * dt;
  elite.vy += (dy / dist) * accel * dt;
  elite.vz += (dz / dist) * accel * dt;
  const speed = Math.hypot(elite.vx, elite.vy, elite.vz);
  if (speed > elite.maxSpeed) {
    elite.vx = (elite.vx / speed) * elite.maxSpeed;
    elite.vy = (elite.vy / speed) * elite.maxSpeed;
    elite.vz = (elite.vz / speed) * elite.maxSpeed;
  }
}

function repelPlayerFromElite(elite) {
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const dz = state.player.z - elite.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const knockback = getTuningValue("eliteKnockback", 260) * getGameplayScale();
  state.player.vx += (dx / dist) * knockback;
  state.player.vy += (dy / dist) * knockback;
  state.player.vz += (dz / dist) * knockback;
  elite.vx -= (dx / dist) * getTuningValue("eliteRecoil", 90);
  elite.vy -= (dy / dist) * getTuningValue("eliteRecoil", 90);
  elite.vz -= (dz / dist) * getTuningValue("eliteRecoil", 90);
  clampPlayerToWorld();
}

function spawnEliteFragments(elite, region) {
  const count = Math.floor(getTuningValue("eliteSplitCount", 3));
  const speed = getTuningValue("eliteSplitSpeed", 165) * getGameplayScale();
  const safeGap = getTuningValue("eliteFragmentSafeGap", 52);
  for (let i = 0; i < count; i += 1) {
    const theta = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const radius = (tuning.asteroidRadiusMin + Math.random() * tuning.asteroidRadiusRange) * getGameplayScale();
    const offset = elite.radius + radius;
    const fragment = makeAsteroid(
      elite.x + Math.cos(theta) * offset,
      elite.y + (Math.random() - 0.5) * offset,
      elite.z + Math.sin(theta) * offset,
      radius,
      Math.cos(theta) * speed,
      (Math.random() - 0.5) * speed * 0.4,
      Math.sin(theta) * speed,
      region
    );
    if (Math.hypot(fragment.x - state.player.x, fragment.y - state.player.y, fragment.z - state.player.z) < safeGap) {
      fragment.vx *= -1;
      fragment.vz *= -1;
    }
    state.asteroids.push(fragment);
  }
}

/* ---------- 星域与跃迁 ---------- */

function updateRegionFlow(dt) {
  if (state.routeChoice.active) {
    state.routeChoice.timer = Math.max(0, state.routeChoice.timer - dt);
    state.routeChoice.bannerTimer = Math.max(0, state.routeChoice.bannerTimer - dt);
    for (const gate of state.routeChoice.gates) {
      gate.age = (gate.age || 0) + dt;
      const named = regions[gate.regionId];
      if (named) gate.label = regionDisplayName(named);
    }
    if (state.routeChoice.timer <= 0) chooseFallbackRoute();
    // The smoke test reads labels after tick, before the next paint.
    world3d?.syncGates?.(state.routeChoice.gates);
    return;
  }
  state.regionTimer += dt;
  if (state.regionTimer >= tuning.routeChoiceInterval) beginRouteChoice();
}

function makeRouteGate(regionId, x, y, z) {
  const region = regions[regionId];
  const margin = getTuningValue("routeGateMargin", 120);
  return {
    regionId,
    x: clamp(x, margin, state.world.width - margin),
    y: clamp(y, margin, state.world.height - margin),
    z: clamp(z, margin, state.world.depth - margin),
    age: 0,
    label: region ? regionDisplayName(region) : regionId,
    tint: region ? region.tint : "98,228,255"
  };
}

// Two rings float ahead of the ship inside the room, not on a fixed track.
function beginRouteChoice() {
  const ids = Object.keys(regions).filter((id) => id !== state.regionId);
  const picks = [];
  while (picks.length < 2 && ids.length) {
    picks.push(ids.splice(Math.floor(Math.random() * ids.length), 1)[0]);
  }
  const forward = projection.makeBasis(state.player.yaw, state.player.pitch).forward;
  const right = projection.makeBasis(state.player.yaw, 0).right;
  const baseX = state.player.x + forward.x * 620;
  const baseY = state.player.y + forward.y * 620;
  const baseZ = state.player.z + forward.z * 620;

  state.routeChoice.active = true;
  state.routeChoice.timer = tuning.routeChoiceDuration;
  state.routeChoice.bannerTimer = 2.5;
  state.routeChoice.gates = [
    makeRouteGate(picks[0], baseX - right.x * 260, baseY + 40, baseZ - right.z * 260),
    makeRouteGate(picks[1], baseX + right.x * 260, baseY - 40, baseZ + right.z * 260)
  ];
  playSound("pickup");
}

function chooseFallbackRoute() {
  if (!state.routeChoice.gates.length) {
    state.routeChoice.active = false;
    return;
  }
  let best = state.routeChoice.gates[0];
  let bestDistance = Infinity;
  for (const gate of state.routeChoice.gates) {
    const distance = Math.hypot(gate.x - state.player.x, gate.y - state.player.y, gate.z - state.player.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = gate;
    }
  }
  resolveRouteChoice(best.regionId);
}

// Warping clears the field, which is also how you shake an elite.
function pruneAsteroidsAfterRoute() {
  state.asteroids = state.asteroids.filter((asteroid) => !asteroid.elite);
  state.eliteTimer = 0;
}

function startWarpFlash(region) {
  state.warpFlash.timer = getTuningValue("warpFlashDuration", 0.58);
  state.warpFlash.duration = state.warpFlash.timer;
  state.warpFlash.tint = region.tint;
  state.warpFlash.secondaryTint = region.secondaryTint;
}

function resolveRouteChoice(regionId) {
  if (!regions[regionId]) return;
  const region = regions[regionId];
  state.regionId = regionId;
  state.regionJunctions += 1;
  state.regionTimer = 0;
  state.routeChoice.active = false;
  state.routeChoice.timer = 0;
  state.routeChoice.gates = [];
  pruneAsteroidsAfterRoute();
  startWarpFlash(region);
  world3d?.setRegionTint(region.tint);
  playSound("pickup");
  evaluateAchievements();
}

function handleRouteGateCollision() {
  if (!state.routeChoice.active) return;
  for (const gate of state.routeChoice.gates) {
    if (isWithinRadius3d(gate.x, gate.y, gate.z, state.player.x, state.player.y, state.player.z, tuning.routeGateRadius)) {
      resolveRouteChoice(gate.regionId);
      return;
    }
  }
}

/* ---------- 拾取物 ---------- */

function samplePickupPosition() {
  return sampleAround(
    state.player.x,
    state.player.y,
    state.player.z,
    200,
    getTuningValue("farDistance", 1700) * 0.5
  );
}

function findSafePickupPosition(radius) {
  let best = samplePickupPosition();
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < tuning.maxPickupSpawnAttempts; attempt += 1) {
    const candidate = samplePickupPosition();
    let score = Infinity;
    for (const asteroid of state.asteroids) {
      score = Math.min(score, Math.hypot(
        candidate.x - asteroid.x,
        candidate.y - asteroid.y,
        candidate.z - asteroid.z
      ) - asteroid.radius - radius);
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (bestScore >= tuning.pickupAsteroidDistance) break;
  }
  return best;
}

function spawnCore() {
  const radius = getTuningValue("coreRadius3d", 16) * getGameplayScale();
  const spawn = findSafePickupPosition(radius);
  state.cores.push({ x: spawn.x, y: spawn.y, z: spawn.z, radius, pulse: Math.random() * Math.PI * 2 });
}

function spawnPowerUp() {
  const type = Math.random() > 0.5 ? "shield" : "double";
  const radius = getTuningValue("powerUpRadius3d", 18) * getGameplayScale();
  const spawn = findSafePickupPosition(radius);
  state.powerUps.push({ x: spawn.x, y: spawn.y, z: spawn.z, radius, pulse: Math.random() * Math.PI * 2, type });
}

/* ---------- 暂停 ---------- */

function pauseGame() {
  if (!state.running || state.gameOver || state.paused) return;
  inputController.clearAll();
  state.paused = true;
  showOverlay("pause", ui.pauseTitle, ui.pauseText, ui.pauseButton);
}

function resumeGame() {
  if (!state.paused || state.gameOver) return;
  state.paused = false;
  state.lastTime = 0;
  hideOverlay();
}

function togglePause() {
  if (!state.running || state.gameOver) return;
  if (state.paused) resumeGame();
  else pauseGame();
}

/* ---------- 主循环 ---------- */

function update(dt) {
  state.pulseTime += dt;

  if (!state.running || state.paused) return;

  state.score += dt * 7;
  state.stats.survivalTime += dt;
  state.achievementTimer += dt;
  if (state.achievementTimer >= 1) {
    state.achievementTimer = 0;
    evaluateAchievements();
  }
  state.flashTimer = Math.max(0, state.flashTimer - dt);
  state.invulnerabilityTimer = Math.max(0, state.invulnerabilityTimer - dt);
  state.screenShakeTimer = Math.max(0, state.screenShakeTimer - dt);
  state.screenShakeStrength = state.screenShakeTimer > 0 ? Math.max(0, state.screenShakeStrength - dt * tuning.screenShakeDecay) : 0;
  state.warpFlash.timer = Math.max(0, state.warpFlash.timer - dt);
  state.shootCooldown = Math.max(0, state.shootCooldown - dt);
  state.doubleShotTimer = Math.max(0, state.doubleShotTimer - dt);
  if (inputController.isFireHeld()) fireLaser();

  updateRegionFlow(dt);
  const region = getCurrentRegion();
  updateEliteFlow(dt, region);

  state.spawnTimer += dt;
  state.coreTimer += dt;
  state.powerUpTimer += dt;
  state.difficultyTimer += dt;

  if (state.difficultyTimer >= tuning.difficultyStep) {
    state.difficultyTimer = 0;
    state.speedScale = Math.min(tuning.maxSpeedScale, state.speedScale + tuning.asteroidSpeedStep);
    state.spawnInterval = Math.max(tuning.minSpawnInterval, state.spawnInterval - tuning.spawnIntervalStep);
  }

  if (state.spawnTimer >= getRouteAdjustedSpawnInterval(region)) {
    state.spawnTimer = 0;
    spawnAsteroid(region);
  }

  if (state.coreTimer >= 2.5 * getRegionMultiplier(region, "coreIntervalMultiplier") && state.cores.length < 2) {
    state.coreTimer = 0;
    spawnCore();
  }

  if (state.powerUpTimer >= tuning.powerUpSpawnInterval * getRegionMultiplier(region, "powerUpIntervalMultiplier") && state.powerUps.length < 1) {
    state.powerUpTimer = 0;
    spawnPowerUp();
  }

  movePlayer(dt);
  snapCameraToShip();
  moveAsteroids(dt);
  moveLasers(dt);
  updatePickups(dt);
  handleCollisions();
  syncHud();
}

// Free flight: yaw/pitch aim the nose, W/S fly along it, A/D strafe sideways.
function movePlayer(dt) {
  const look = inputController.consumeLook();
  state.player.yaw += look.yaw;
  state.player.pitch = clamp(
    state.player.pitch - look.pitch,
    -getTuningValue("maxPitch", 1.15),
    getTuningValue("maxPitch", 1.15)
  );

  const move = inputController.getMoveInput();
  const basis = projection.makeBasis(state.player.yaw, state.player.pitch);
  const boosting = inputController.isBoosting() && move.forward > 0;
  const speedMultiplier = boosting ? getTuningValue("boostSpeedMultiplier", 1.65) : 1;
  const accelMultiplier = boosting ? getTuningValue("boostAccelMultiplier", 1.4) : 1;
  const baseForwardSpeed = getTuningValue("shipSpeed3d", 330);
  const forwardSpeed = baseForwardSpeed * speedMultiplier;
  const strafeSpeed = getTuningValue("strafeSpeed3d", 260);
  const acceleration = getTuningValue("shipAccel3d", 9);
  const deceleration = getTuningValue("shipDecel3d", 14);
  state.player.boost = boosting;

  const targetVx = basis.forward.x * forwardSpeed * move.forward + basis.right.x * strafeSpeed * move.strafe;
  const targetVy = basis.forward.y * forwardSpeed * move.forward;
  const targetVz = basis.forward.z * forwardSpeed * move.forward + basis.right.z * strafeSpeed * move.strafe;
  const moving = move.forward !== 0 || move.strafe !== 0;

  // With mass, the ship only brakes when the input opposes its momentum;
  // releasing the keys leaves it coasting.
  let blend;
  let forwardCorrection = 0;
  if (moving) {
    const opposing = targetVx * state.player.vx + targetVy * state.player.vy + targetVz * state.player.vz < 0;
    blend = 1 - Math.exp(-(opposing ? deceleration : acceleration) * dt);
    if (boosting && !opposing) {
      const blendBoosted = 1 - Math.exp(-acceleration * accelMultiplier * dt);
      forwardCorrection = ((targetVx - state.player.vx) * basis.forward.x +
        (targetVy - state.player.vy) * basis.forward.y +
        (targetVz - state.player.vz) * basis.forward.z) * (blendBoosted - blend);
    }
  } else {
    blend = 1 - Math.exp(-(deceleration * 0.25) * dt);
  }

  state.player.vx += (targetVx - state.player.vx) * blend;
  state.player.vy += (targetVy - state.player.vy) * blend;
  state.player.vz += (targetVz - state.player.vz) * blend;
  // Extra boost response follows the nose, never the lateral correction.
  if (boosting) {
    state.player.vx += basis.forward.x * forwardCorrection;
    state.player.vy += basis.forward.y * forwardCorrection;
    state.player.vz += basis.forward.z * forwardCorrection;
  }

  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;
  state.player.z += state.player.vz * dt;
  clampPlayerToWorld();

  // Boost lets the exhaust read as stronger: the ratio is measured against
  // cruising speed, not the boosted target, so thrust reaches 1.35 while held.
  const speedRatio = Math.min(1.35, Math.hypot(state.player.vx, state.player.vy, state.player.vz) / baseForwardSpeed);
  const thrustTarget = moving ? Math.max(0.4, speedRatio) : 0.3;
  state.player.thrust += (thrustTarget - state.player.thrust) * (1 - Math.exp(-10 * dt));

  // Bank into strafes and turns. Positive `roll` dips the starboard wing,
  // which is what "sliding right" should look like; the ship is held centre
  // by the chase camera so this lean is the main cue for lateral motion.
  const rollTarget = clamp(move.strafe * 0.9 + look.yaw * 22, -1, 1);
  state.player.roll += (rollTarget - state.player.roll) * (1 - Math.exp(-9 * dt));
}

// Soft boundary: push back and bleed the outward velocity instead of stopping dead.
function clampPlayerToWorld() {
  const pad = getTuningValue("boundaryPadding", 60) + state.player.radius;
  const axes = [
    ["x", 0, state.world.width],
    ["y", 0, state.world.height],
    ["z", 0, state.world.depth]
  ];
  for (const [axis, min, max] of axes) {
    const lo = min + pad;
    const hi = max - pad;
    const value = state.player[axis];
    if (value < lo) {
      state.player[axis] = lo + (value - lo) * 0.35;
      state.player[`v${axis}`] = Math.max(0, state.player[`v${axis}`] * -0.15);
    } else if (value > hi) {
      state.player[axis] = hi + (value - hi) * 0.35;
      state.player[`v${axis}`] = Math.min(0, state.player[`v${axis}`] * -0.15);
    }
  }
}

/* ---------- 相机 ---------- */

function cameraForward() {
  return projection.makeBasis(state.camera.yaw, state.camera.pitch).forward;
}

function placeCameraAtShip() {
  const cam = projection.createChaseCamera({
    ship: state.player,
    yaw: state.player.yaw,
    pitch: state.player.pitch,
    distance: getTuningValue("cameraDistance", 320),
    height: getTuningValue("cameraHeight", 90),
    width: cw,
    heightPx: ch,
    fovDegrees: getTuningValue("fovDegrees", 62)
  });
  state.camera.x = cam.x;
  state.camera.y = cam.y;
  state.camera.z = cam.z;
}

function snapCameraToShip() {
  state.camera.yaw = state.player.yaw;
  state.camera.pitch = state.player.pitch;
  placeCameraAtShip();
}

function getActiveCamera() {
  return projection.createCamera({
    x: state.camera.x,
    y: state.camera.y,
    z: state.camera.z,
    yaw: state.camera.yaw,
    pitch: state.camera.pitch,
    width: cw,
    height: ch,
    fovDegrees: getTuningValue("fovDegrees", 62)
  });
}


function moveAsteroids(dt) {
  const pad = getTuningValue("boundaryPadding", 60);
  let alive = 0;
  for (const asteroid of state.asteroids) {
    if (asteroid.elite) steerEliteAsteroid(asteroid, dt);
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.z += asteroid.vz * dt;
    asteroid.rotation += asteroid.spin * dt;
    asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 4);

    // Bounce off the room walls so rocks stay inside the play space.
    if (asteroid.x < pad || asteroid.x > state.world.width - pad) asteroid.vx *= -0.85;
    if (asteroid.y < pad || asteroid.y > state.world.height - pad) asteroid.vy *= -0.85;
    if (asteroid.z < pad || asteroid.z > state.world.depth - pad) asteroid.vz *= -0.85;
    asteroid.x = clamp(asteroid.x, pad, state.world.width - pad);
    asteroid.y = clamp(asteroid.y, pad, state.world.height - pad);
    asteroid.z = clamp(asteroid.z, pad, state.world.depth - pad);

    const cullRadius = asteroid.elite
      ? getTuningValue("eliteCullRadius3d", 3200)
      : getTuningValue("asteroidCullRadius3d", 2600);
    const dx = asteroid.x - state.player.x;
    const dy = asteroid.y - state.player.y;
    const dz = asteroid.z - state.player.z;
    if (dx * dx + dy * dy + dz * dz > cullRadius * cullRadius) continue;
    state.asteroids[alive++] = asteroid;
  }
  state.asteroids.length = alive;
}

function moveLasers(dt) {
  let alive = 0;
  for (const laser of state.lasers) {
    laser.x += laser.vx * dt;
    laser.y += laser.vy * dt;
    laser.z += laser.vz * dt;
    laser.life -= dt;
    const inside = laser.x > -200 && laser.x < state.world.width + 200
      && laser.y > -200 && laser.y < state.world.height + 200
      && laser.z > -200 && laser.z < state.world.depth + 200;
    if (laser.life > 0 && inside) state.lasers[alive++] = laser;
  }
  state.lasers.length = alive;
}

function updatePickups(dt) {
  for (const core of state.cores) core.pulse += dt * 3;
  for (const powerUp of state.powerUps) powerUp.pulse += dt * 3.5;

  const cullRadius = getTuningValue("pickupCullRadius3d", 2000);
  state.cores = state.cores.filter((core) => {
    const dx = core.x - state.player.x;
    const dy = core.y - state.player.y;
    const dz = core.z - state.player.z;
    return dx * dx + dy * dy + dz * dz <= cullRadius * cullRadius;
  });
  state.powerUps = state.powerUps.filter((powerUp) => {
    const dx = powerUp.x - state.player.x;
    const dy = powerUp.y - state.player.y;
    const dz = powerUp.z - state.player.z;
    return dx * dx + dy * dy + dz * dz <= cullRadius * cullRadius;
  });
}

/* ---------- 射击 ---------- */

function fireLaser() {
  if (!state.running || state.paused || state.gameOver || state.shootCooldown > 0) return;
  state.shootCooldown = tuning.shootCooldown;
  playSound("shoot");

  // Fire along the nose, which is where the crosshair points.
  const basis = projection.makeBasis(state.player.yaw, state.player.pitch);
  const speed = getTuningValue("laserSpeed3d", 1400);
  const offset = state.player.radius + 6;
  const baseX = state.player.x + basis.forward.x * offset;
  const baseY = state.player.y + basis.forward.y * offset;
  const baseZ = state.player.z + basis.forward.z * offset;

  if (state.doubleShotTimer > 0) {
    const side = tuning.doubleShotOffset;
    state.stats.shotsFired += 2;
    spawnLaser(baseX + basis.right.x * side, baseY, baseZ + basis.right.z * side, basis, speed);
    spawnLaser(baseX - basis.right.x * side, baseY, baseZ - basis.right.z * side, basis, speed);
    return;
  }
  state.stats.shotsFired += 1;
  spawnLaser(baseX, baseY, baseZ, basis, speed);
}

function spawnLaser(x, y, z, basis, speed) {
  state.lasers.push({
    x,
    y,
    z,
    vx: basis.forward.x * speed,
    vy: basis.forward.y * speed,
    vz: basis.forward.z * speed,
    life: tuning.laserLife * 1.6
  });
}

/* ---------- 碰撞 ---------- */

function handleCollisions() {
  handleRouteGateCollision();

  if (state.invulnerabilityTimer <= 0) {
    for (let i = state.asteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = state.asteroids[i];
      if (!isWithinRadius3d(asteroid.x, asteroid.y, asteroid.z, state.player.x, state.player.y, state.player.z, asteroid.radius + state.player.radius)) continue;

      if (asteroid.elite) {
        repelPlayerFromElite(asteroid);
      } else {
        state.asteroids.splice(i, 1);
      }

      if (state.shieldCharges > 0) {
        state.shieldCharges -= 1;
        state.invulnerabilityTimer = 0.3;
        state.flashTimer = 0;
        triggerScreenShake(0.2, 12);
        playSound("hurt");
        break;
      }

      state.health -= 1;
      state.stats.damagedThisRun = true;
      state.invulnerabilityTimer = tuning.hitInvulnerability;
      state.flashTimer = tuning.hitFlashDuration;
      triggerScreenShake(0.28, 18);
      playSound("hurt");
      evaluateAchievements();
      if (state.health <= 0) {
        endGame();
        return;
      }
      break;
    }
  }

  for (let i = state.lasers.length - 1; i >= 0; i -= 1) {
    const laser = state.lasers[i];
    let hit = false;
    for (let j = state.asteroids.length - 1; j >= 0; j -= 1) {
      const asteroid = state.asteroids[j];
      const threshold = asteroid.radius + getTuningValue("laserRadius", 7);
      if (!isWithinRadius3d(asteroid.x, asteroid.y, asteroid.z, laser.x, laser.y, laser.z, threshold)) continue;

      hit = true;
      state.lasers.splice(i, 1);
      state.stats.shotsHit += 1;
      asteroid.hp -= 1;
      asteroid.hitFlash = 1;
      const isLarge = asteroid.radius > tuning.largeAsteroidThreshold;
      triggerScreenShake(0.08, isLarge ? 6 : 4);

      if (asteroid.hp <= 0) {
        destroyAsteroid(asteroid, { elite: asteroid.elite });
      } else {
        queueFx("sparks", { ...asteroid, x: laser.x, y: laser.y, z: laser.z, hit: true });
        playSound("hit");
      }
      break;
    }
    if (hit) continue;
  }

  for (let i = state.cores.length - 1; i >= 0; i -= 1) {
    const core = state.cores[i];
    if (!isWithinRadius3d(core.x, core.y, core.z, state.player.x, state.player.y, state.player.z, core.radius + state.player.radius + getTuningValue("pickupCollectPadding", 20))) continue;
    state.cores.splice(i, 1);
    state.score += tuning.scoreCore;
    state.stats.collectedCores += 1;
    playSound("pickup");
    evaluateAchievements();
  }

  for (let i = state.powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = state.powerUps[i];
    if (!isWithinRadius3d(powerUp.x, powerUp.y, powerUp.z, state.player.x, state.player.y, state.player.z, powerUp.radius + state.player.radius + getTuningValue("pickupCollectPadding", 20))) continue;
    state.powerUps.splice(i, 1);
    if (powerUp.type === "shield") {
      state.shieldCharges = 1;
    } else {
      state.doubleShotTimer = tuning.doubleShotDuration;
    }
    triggerScreenShake(0.12, 8);
    playSound("pickup");
  }
}

/* ---------- 特效 ---------- */

function queueFx(kind, asteroid) {
  const queue = state.fx[kind];
  queue.push({ ...asteroid, born: state.pulseTime });
  if (queue.length > tuning.fxMaxDebrisGroups) queue.shift();
}

function destroyAsteroid(asteroid, { elite }) {
  const isLarge = asteroid.radius > tuning.largeAsteroidThreshold;
  state.stats.destroyedAsteroids += 1;
  const index = state.asteroids.indexOf(asteroid);
  if (index !== -1) state.asteroids.splice(index, 1);
  const effect = { ...asteroid, elite };
  for (const kind of ["debris", "flashes", "rings", "sparks"]) queueFx(kind, effect);
  if (elite) {
    const eliteScore = Math.round(getTuningValue("scoreElite", 140));
    state.score += eliteScore;
    state.stats.destroyedElites += 1;
    spawnEliteFragments(asteroid, getCurrentRegion());
    triggerScreenShake(0.36, 20);
  } else {
    state.score += tuning.scoreAsteroid;
    triggerScreenShake(isLarge ? 0.18 : 0.12, isLarge ? 12 : 7);
  }
  playSound("explode");
  evaluateAchievements();
}

/* ---------- 成就与结算 ---------- */

function getRunAccuracy() {
  if (state.stats.shotsFired < 10) return 0;
  return Math.round((state.stats.shotsHit / state.stats.shotsFired) * 100);
}

function getNoDamageSurvival() {
  return state.stats.damagedThisRun ? 0 : Math.floor(state.stats.survivalTime);
}

const metricGetters = {
  regionJunctions: () => state.regionJunctions,
  accuracy: getRunAccuracy,
  noDamageSurvival: getNoDamageSurvival,
  destroyedAsteroids: () => profile.totals.destroyedAsteroids + state.stats.destroyedAsteroids,
  collectedCores: () => profile.totals.collectedCores + state.stats.collectedCores,
  warps: () => profile.totals.warps + state.regionJunctions,
  runs: () => profile.totals.runs + 1
};

function evaluateAchievements() {
  let unlocked = false;
  for (const achievement of achievements) {
    if (profile.unlocked[achievement.id]) continue;
    const getter = metricGetters[achievement.metric];
    if (!getter || getter() < achievement.threshold) continue;
    profile.unlocked[achievement.id] = Date.now();
    runAchievementUnlocks.push(achievement.id);
    unlocked = true;
  }
  if (unlocked) storageController.saveProfile(localStorage, profileKey, profile);
}

function endGame() {
  state.running = false;
  state.paused = false;
  state.gameOver = true;
  state.screenShakeTimer = 0;
  state.screenShakeStrength = 0;
  stopMusic();

  const finalScore = Math.floor(state.score);
  state.stats.newBest = finalScore > bestScore;
  lastGameOver.score = finalScore;
  lastGameOver.newBest = state.stats.newBest;

  if (state.stats.newBest) {
    bestScore = finalScore;
    storageController.writeBestScore(localStorage, bestKey, finalScore);
  }

  syncHud();
  evaluateAchievements();
  recordRunToProfile();

  const overlayStatList = [
    { label: L("finalScore"), value: String(finalScore) },
    { label: L("survivalTime"), value: formatDuration(state.stats.survivalTime) },
    { label: L("destroyedAsteroids"), value: String(state.stats.destroyedAsteroids) },
    { label: L("collectedCores"), value: String(state.stats.collectedCores) },
    { label: L("warps"), value: String(state.regionJunctions) },
    { label: L("accuracy"), value: formatRate(state.stats.shotsHit, state.stats.shotsFired) }
  ];

  if (state.stats.destroyedElites > 0) {
    overlayStatList.push({ label: L("eliteBreakStat"), value: String(state.stats.destroyedElites) });
  }

  overlayStatList.push(
    { label: profileUi[state.lang].totalRunsLabel, value: String(profile.totals.runs) },
    { label: profileUi[state.lang].totalDestroyedLabel, value: String(profile.totals.destroyedAsteroids) }
  );

  for (const achievementId of runAchievementUnlocks) {
    const achievement = achievements.find((item) => item.id === achievementId);
    if (achievement) {
      overlayStatList.push({ label: `${profileUi[state.lang].statLabelPrefix}${achLabel(achievement)}`, value: profileUi[state.lang].unlockedValue });
    }
  }

  renderOverlayStats(overlayStatList, state.stats.newBest);

  showOverlay(
    "gameover",
    state.stats.newBest ? ui.recordTitle : ui.gameOverTitle,
    state.stats.newBest ? ui.newRecord(finalScore) : ui.gameOver(finalScore),
    ui.restartButton
  );
}

/* ---------- 渲染 ---------- */

function draw(worldDt = 0.016) {
  const region = getCurrentRegion();

  if (world3d) {
    world3d.render(state, state.camera, worldDt);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  if (world3d) {
    drawLaneRadar();
    drawHudOverlay(region);
    drawVignette();
    drawWarpFlash();
    drawCrosshair();
    return;
  }

  // Fallback: 2D HUD-only frame while the WebGL module is still loading.
  drawLaneRadar();
  drawHudOverlay(region);
  drawCrosshair();
}

function drawCrosshair() {
  const el = document.getElementById("crosshair");
  const active = state.running && !state.paused && !state.gameOver;
  el?.classList.toggle("is-active", active);
  const lookPad = document.querySelector("[data-look-pad]");
  lookPad?.classList.toggle("is-active", active && mobileViewportQuery.matches);
}

// Top-down radar centred on the ship: horizontal = world x, vertical = world z.
function drawLaneRadar() {
  const size = tuning.minimapSize;
  const margin = tuning.minimapMargin;
  const left = cw - size - margin;
  const top = margin + 46;

  const viewRadius = getTuningValue("minimapRange", 1300);
  const toX = (wx) => left + size / 2 + ((wx - state.player.x) / viewRadius) * (size / 2);
  const toY = (wz) => top + size / 2 - ((wz - state.player.z) / viewRadius) * (size / 2);
  const inRange = (obj) => Math.hypot(obj.x - state.player.x, obj.z - state.player.z) < viewRadius;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(4,10,22,0.72)";
  ctx.strokeStyle = "rgba(98,228,255,0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect?.(left, top, size, size, 8);
  if (ctx.roundRect) ctx.fill();
  else ctx.fillRect(left, top, size, size);
  ctx.stroke();

  ctx.strokeStyle = "rgba(98,228,255,0.14)";
  for (let i = 1; i < 4; i += 1) {
    const offset = (size * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left + offset, top);
    ctx.lineTo(left + offset, top + size);
    ctx.moveTo(left, top + offset);
    ctx.lineTo(left + size, top + offset);
    ctx.stroke();
  }

  for (const asteroid of state.asteroids) {
    if (!inRange(asteroid)) continue;
    ctx.fillStyle = asteroid.elite ? "rgba(255,181,158,0.95)" : "rgba(150,168,196,0.75)";
    ctx.beginPath();
    ctx.arc(toX(asteroid.x), toY(asteroid.z), asteroid.elite ? 2.6 : 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const core of state.cores) {
    if (!inRange(core)) continue;
    ctx.fillStyle = "rgba(138,255,209,0.9)";
    ctx.beginPath();
    ctx.arc(toX(core.x), toY(core.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const powerUp of state.powerUps) {
    if (!inRange(powerUp)) continue;
    ctx.fillStyle = powerUp.type === "shield" ? "rgba(127,180,255,0.95)" : "rgba(255,176,102,0.95)";
    ctx.beginPath();
    ctx.arc(toX(powerUp.x), toY(powerUp.z), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const gate of state.routeChoice.gates) {
    ctx.strokeStyle = rgba(gate.tint, 0.95);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(toX(gate.x), toY(gate.z), 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ship arrow points along the current heading.
  const dirX = Math.sin(state.player.yaw);
  const dirZ = Math.cos(state.player.yaw);
  const cx = toX(state.player.x);
  const cy = toY(state.player.z);
  ctx.fillStyle = "rgba(226,252,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(cx + dirX * 6, cy - dirZ * 6);
  ctx.lineTo(cx - dirX * 4 + dirZ * 4, cy + dirZ * 4 + dirX * 4);
  ctx.lineTo(cx - dirX * 4 - dirZ * 4, cy + dirZ * 4 - dirX * 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHudOverlay(region) {
  const pad = 14;
  ctx.save();
  ctx.font = '600 12px "Segoe UI", sans-serif';
  ctx.textAlign = "left";

  ctx.fillStyle = rgba(region.tint, 0.9);
  ctx.fillText(`${L("sector")} · ${regionDisplayName(region)}`, pad, pad + 10);

  ctx.fillStyle = "rgba(180,200,225,0.8)";
  ctx.fillText(`${L("threat")} ${Math.round(state.speedScale * 100)}%`, pad, pad + 28);

  if (state.routeChoice.active) {
    ctx.fillStyle = "rgba(255,215,161,0.95)";
    ctx.fillText(L("warpWindow", state.routeChoice.timer.toFixed(1)), pad, pad + 46);
  }

  if (state.routeChoice.active && state.routeChoice.bannerTimer > 0) {
    const timer = state.routeChoice.bannerTimer;
    const narrow = cw < 640;
    const y = narrow ? ch * 0.22 : Math.min(ch * 0.3, 200);
    ctx.save();
    ctx.globalAlpha = timer >= 0.5 ? 1 : timer / 0.5;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,236,214,0.96)";
    ctx.shadowColor = "rgba(0,0,0,0.72)";
    ctx.shadowBlur = 8;
    const title = L("chooseGate");
    const hint = L("chooseGateHint");
    ctx.font = '700 14px "Segoe UI", sans-serif';
    if (narrow) ctx.fillText(title, cw / 2, y, cw - 40);
    else ctx.fillText(title, cw / 2, y);
    ctx.font = '400 12px "Segoe UI", sans-serif';
    if (narrow) ctx.fillText(hint, cw / 2, y + 20, cw - 40);
    else ctx.fillText(hint, cw / 2, y + 20);
    ctx.restore();
  }

  const statusY = ch - pad - 8;
  ctx.textAlign = "right";
  if (state.shieldCharges > 0) {
    ctx.fillStyle = "#8affd1";
    ctx.fillText(L("shield"), cw - pad, statusY);
  }
  if (state.doubleShotTimer > 0) {
    ctx.fillStyle = "#ffb59e";
    ctx.fillText(L("double"), cw - pad, statusY - 18);
  }
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.78);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,4,12,${getTuningValue("visualVignetteTint", 0.16) + 0.22})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cw, ch);

  if (state.flashTimer > 0) {
    ctx.fillStyle = `rgba(255,90,110,${0.28 * (state.flashTimer / tuning.hitFlashDuration)})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawWarpFlash() {
  if (state.warpFlash.timer <= 0 || state.warpFlash.duration <= 0) return;
  const t = state.warpFlash.timer / state.warpFlash.duration;
  ctx.save();
  ctx.globalAlpha = t * 0.85;
  const gradient = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  gradient.addColorStop(0, `rgba(${state.warpFlash.tint},0.9)`);
  gradient.addColorStop(0.6, `rgba(${state.warpFlash.secondaryTint},0.35)`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

/* ---------- 启动 ---------- */

function startGame() {
  resetGame();
}

function handleOverlayAction() {
  if (overlayMode === "pause") {
    resumeGame();
    return;
  }
  startGame();
}

async function requestLandscapeMode() {
  if (document.body.classList.contains("force-landscape")) {
    document.body.classList.remove("force-landscape");
    if (screen.orientation?.unlock) screen.orientation.unlock();
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* 布局仍可回竖屏 */ }
    }
    refreshCanvasSoon();
    return;
  }

  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); } catch { /* 部分浏览器只允许手动旋转 */ }
  }

  if (screen.orientation?.lock) {
    try { await screen.orientation.lock("landscape"); } catch { /* iOS Safari 不提供方向锁定 */ }
  }

  window.setTimeout(() => {
    if (mobileViewportQuery.matches && isPortraitViewport()) {
      document.body.classList.add("force-landscape");
    }
    refreshCanvasSoon();
  }, 320);
}

function refreshViewportMeta() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute("content", meta.getAttribute("content"));
}

inputController = window.starRingInput.createInputController({
  windowObject: window,
  documentObject: document,
  getState: () => state,
  tuning,
  fireLaser,
  startGame,
  togglePause,
  pauseGame,
  handleSettingsKeydown,
  isGameViewActive: () => document.body.dataset.view === "game",
  isCompactLandscapeMode,
  isForceLandscapeMode,
  requestLandscapeMode,
  openSettings,
  setLanguage,
  closeSettings,
  toggleMusic,
  toggleSfx,
  selectSkin,
  selectColor
});
gestureMovement = inputController.gestureMovement;
inputController.bind();

startButton.addEventListener("click", handleOverlayAction);
window.addEventListener("resize", () => {
  refreshViewportMeta();
  if (!isPortraitViewport()) document.body.classList.remove("force-landscape");
  refreshCanvasSoon();
});
window.addEventListener("orientationchange", () => {
  refreshViewportMeta();
  window.setTimeout(refreshViewportMeta, 300);
  refreshCanvasSoon();
});
if (mobileViewportQuery.addEventListener) {
  mobileViewportQuery.addEventListener("change", refreshCanvasSoon);
}

syncLandscapeUi();
resizeCanvas();
renderSkinPreviews();
applyLanguage();
applyLanguageToDOM();
hideOverlay();
draw();

function startLoop() {
  window.starRingRenderer.createRenderLoop({
    windowObject: window,
    state,
    tuning,
    update,
    draw
  }).start();
}

// three.js is an ES module; the world boots asynchronously and the HUD-only
// fallback covers the gap.
window.starRingWorldReady = import("./world3d.js?v=4.6.0")
  .then((mod) => {
    world3d = mod.createWorld({ world: state.world, tuning, skin: activeSkin, color: state.shipColor.mid });
    world3d.resize(cw, ch);
    startLoop();
  })
  .catch((error) => {
    console.error("WebGL world failed to load, running HUD-only:", error);
    startLoop();
  });

// The page shell (views.js) owns navigation; this is the only handle it needs.
window.starRingGame = {
  start: startGame,
  leave() {
    inputController?.clearAll();
    closeSettings();
    stopMusic();
    state.running = false;
    state.paused = false;
    state.gameOver = true;
    state.lastTime = 0;
    hideOverlay();
    // A locked pointer outlives a hidden canvas and would keep feeding look input.
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
};

if (new URLSearchParams(window.location.search).has("test")) {
  window.starRingTestApi = {
    getWorldDebug: () => world3d?.getDebugReport?.() ?? null,
    disposeWorld: () => {
      const world = world3d;
      state.running = false;
      world3d = null;
      world.dispose();
      return world.getDebugReport().fx;
    },
    getState: () => ({
      running: state.running,
      paused: state.paused,
      gameOver: state.gameOver,
      regionId: state.regionId,
      regionJunctions: state.regionJunctions,
      eliteCount: state.asteroids.filter((asteroid) => asteroid.elite).length,
      asteroidCount: state.asteroids.length,
      coreCount: state.cores.length,
      powerUpCount: state.powerUps.length,
      gates: state.routeChoice.gates.map((gate) => ({ x: gate.x, y: gate.y, z: gate.z, regionId: gate.regionId })),
      bannerTimer: state.routeChoice.bannerTimer,
      maxAsteroids: getTuningValue("maxAsteroids", 30),
      world: { ...state.world },
      language: state.lang,
      title: document.title
    }),
    startGame,
    pauseGame,
    resumeGame,
    resolveRouteChoice,
    spawnEliteAsteroid,
    setLanguage,
    selectSkin,
    selectColor,
    endGame,
    spawnAsteroid,
    handleCollisions,
    destroyAsteroidAt: (x, y, z, radius = 30, elite = false) => {
      const asteroid = state.asteroids.find((a) => a.x === x && a.y === y && a.z === z)
        || makeAsteroid(x, y, z, radius, 0, 0, 0, getCurrentRegion());
      asteroid.elite = elite;
      destroyAsteroid(asteroid, { elite });
    },
    spawnAsteroidAt: (x, y, z, radius, form) => {
      const asteroid = makeAsteroid(x, y, z, radius || 30, 0, 0, 0, getCurrentRegion());
      if (form) asteroid.form = form;
      state.asteroids.push(asteroid);
      return asteroid;
    },
    clearAsteroids: () => {
      state.asteroids = [];
    },
    spawnCoreAt: (x, y, z) => {
      const core = { x, y, z, radius: getTuningValue("coreRadius3d", 16) * getGameplayScale(), pulse: Math.random() * Math.PI * 2 };
      state.cores.push(core);
      return core;
    },
    spawnPowerUpAt: (x, y, z, type = "shield") => {
      const powerUp = { x, y, z, radius: getTuningValue("powerUpRadius3d", 18) * getGameplayScale(), pulse: Math.random() * Math.PI * 2, type };
      state.powerUps.push(powerUp);
      return powerUp;
    },
    setPlayerPosition: (x, y, z, yaw = state.player.yaw, pitch = state.player.pitch) => {
      state.player.x = x;
      state.player.y = y;
      state.player.z = z;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.vz = 0;
      state.player.yaw = yaw;
      state.player.pitch = pitch;
      snapCameraToShip();
    },
    fireLaser,
    beginRouteChoice,
    tick: (dt) => update(dt),
    measureFps: (ms = 1200) => new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const step = () => {
        frames += 1;
        if (performance.now() - start < ms) requestAnimationFrame(step);
        else resolve(Math.round((frames * 1000) / (performance.now() - start)));
      };
      requestAnimationFrame(step);
    }),
    getScene: () => ({
      asteroids: state.asteroids.map((a) => ({ x: a.x, y: a.y, z: a.z, radius: a.radius })),
      player: { x: state.player.x, y: state.player.y, z: state.player.z, yaw: state.player.yaw, pitch: state.player.pitch, boost: state.player.boost === true, thrust: state.player.thrust },
      camera: { x: state.camera.x, y: state.camera.y, z: state.camera.z, yaw: state.camera.yaw, pitch: state.camera.pitch },
      health: state.health,
      score: state.score,
      lasers: state.lasers.length,
      shotsFired: state.stats.shotsFired
    })
  };
}
