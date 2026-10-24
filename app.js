const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const { bestKey, profileKey, tuning, uiText, regions, achievements, profileUi, i18n } = window.starRingConfig;
const audioController = window.starRingAudio.createAudioController({ windowObject: window, navigatorObject: navigator });
const storageController = window.starRingStorage;
const projection = window.starRingProjection;
const render3d = window.starRingRender3d;

const startMusic = () => audioController.startMusic();
const stopMusic = () => audioController.stopMusic();
const playSound = (type) => audioController.playSound(type);

let ui = (window.starRingConfig.uiText && window.starRingConfig.uiText.zh) || {};

const overlayStats = document.getElementById("overlay-stats");
const overlayStatGrid = document.getElementById("overlay-stat-grid");
const overlayRecord = document.getElementById("overlay-record");
const startButton = document.getElementById("start-button");
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
    if (overlayMode === "start") {
      showOverlay("start", ui.startTitle, ui.startText, ui.startButton);
    } else if (overlayMode === "pause") {
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
  set("game-title", L("gameTitle"));
  set("game-subtitle", L("gameSubtitle"));
  set("score-label", L("scoreLabel"));
  set("health-label", L("healthLabel"));
  set("best-label", L("bestLabel"));
  set("mission-overview", L("missionOverview"));
  set("mission-1-title", L("mission1Title"));
  set("mission-1-desc", L("mission1Desc"));
  set("mission-2-title", L("mission2Title"));
  set("mission-2-desc", L("mission2Desc"));
  set("mission-3-title", L("mission3Title"));
  set("mission-3-desc", L("mission3Desc"));
  set("controls-label", L("controlsLabel"));
  set("control-hint-1", L("controlHint1"));
  set("control-hint-2", L("controlHint2"));
  set("control-hint-3", L("controlHint3"));
  set("tactical-view-label", L("tacticalView"));
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

const particlePool = [];
function acquireParticle(x, y, z, vx, vy, vz, life, size, color) {
  const p = particlePool.pop() || {};
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
  p.life = life; p.size = size; p.color = color; p.drag = 0.988;
  return p;
}
function releaseParticle(p) { particlePool.push(p); }

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
  if (canvas.width === physW && canvas.height === physH && dpr === nextDpr) return;

  dpr = nextDpr;
  cw = width;
  ch = height;
  canvas.width = physW;
  canvas.height = physH;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  state.player.radius = getPlayerRadius();
}

function getGameplayScale() {
  const shortSide = Math.min((canvas.width || 960) / dpr, (canvas.height || 600) / dpr);
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
  if (mode !== "gameover") hideOverlayStats();
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

/* ---------- 存档 ---------- */

let bestScore = storageController.readBestScore(localStorage, bestKey);
let profile = storageController.loadProfile(localStorage, profileKey);
let runAchievementUnlocks = [];
let overlayMode = "start";
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
  laneOffset: 0,
  approachSpeed: 195,
  routeChoice: { active: false, timer: 0, gates: [] },
  shipColor: COLORS.blue,
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
  player: {
    x: 0,
    y: 0,
    z: 0,
    radius: 26,
    vx: 0,
    vy: 0,
    thrust: 0,
    roll: 0,
    pitch: 0,
    trailTimer: 0
  },
  asteroids: [],
  cores: [],
  powerUps: [],
  stars3d: [],
  lasers: [],
  messages: [],
  particles: [],
  rings: [],
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
  state.regionTimer = 0;
  state.regionJunctions = 0;
  state.eliteTimer = 0;
  state.laneOffset = 0;
  state.approachSpeed = getTuningValue("approachSpeedBase", 195);
  state.routeChoice.active = false;
  state.routeChoice.timer = 0;
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
  state.player.x = 0;
  state.player.y = 0;
  state.player.z = 0;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.thrust = 0;
  state.player.roll = 0;
  state.player.pitch = 0;
  state.asteroids = [];
  state.cores = [];
  state.powerUps = [];
  state.lasers = [];
  state.messages = [];
  state.particles = [];
  state.rings = [];
  state.warpFlash.timer = 0;
  state.warpFlash.duration = 0;
  state.warpFlash.tint = regions[DEFAULT_REGION_ID].tint;
  state.warpFlash.secondaryTint = regions[DEFAULT_REGION_ID].secondaryTint;
  state.stars3d = Array.from({ length: tuning.starCount }, () => makeStar(true));
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
  document.querySelectorAll(".skin-card").forEach((el) => {
    const active = el.dataset.skin === name;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  renderSkinPreviews();
}

function selectColor(name) {
  activeColor = name;
  state.shipColor = COLORS[name] || COLORS.blue;
  document.querySelectorAll(".color-swatch").forEach((el) => {
    const active = el.dataset.color === name;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
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

function makeStar(randomDepth = false) {
  const far = getTuningValue("farDistance", 1700);
  return {
    x: (Math.random() - 0.5) * 2 * getTuningValue("laneHalfWidth", 340) * 2.4,
    y: (Math.random() - 0.5) * 2 * getTuningValue("laneHalfHeight", 220) * 2.4,
    z: randomDepth ? Math.random() * far : far,
    size: Math.random() * 1.6 + 0.5,
    alpha: Math.random() * 0.55 + 0.2,
    tint: Math.random() > 0.82 ? "150,190,255" : "222,238,255"
  };
}

function updateStars(dt) {
  const far = getTuningValue("farDistance", 1700);
  const speed = getTuningValue("starApproachSpeed", 150);
  for (const star of state.stars3d) {
    star.z -= speed * dt * (state.running && !state.paused ? 1 : 0.25);
    if (star.z < -40) {
      Object.assign(star, makeStar(false));
      star.z = far;
    }
  }
}

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

function makeAsteroid(x, y, z, radius, vx, vy, region, scale = getGameplayScale()) {
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
    spin: (Math.random() - 0.5) * 0.9,
    rotation: Math.random() * Math.PI * 2,
    craters: shape.craters,
    mineralTint,
    surfaceTone: 0.86 + Math.random() * 0.28,
    hp: radius > tuning.largeAsteroidThreshold * scale ? 2 : 1,
    hitFlash: 0,
    elite: false,
    approachFactor: 0.85 + Math.random() * 0.4
  };
}

function spawnAsteroid(region = getCurrentRegion()) {
  const scale = getGameplayScale();
  const radius = (Math.random() * getTuningValue("asteroidRadiusRange3d", 20) + getTuningValue("asteroidRadiusMin3d", 24)) * scale;
  const halfW = getTuningValue("laneHalfWidth", 340) - radius;
  const halfH = getTuningValue("laneHalfHeight", 220) - radius;
  const drift = getTuningValue("asteroidDriftSpeed", 46) * (Math.random() - 0.5) * 2;
  state.asteroids.push(makeAsteroid(
    (Math.random() - 0.5) * 2 * halfW,
    (Math.random() - 0.5) * 2 * halfH,
    getTuningValue("farDistance", 1700),
    radius,
    drift * 0.4,
    drift * 0.4,
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
  const scale = getGameplayScale();
  const radius = (tuning.asteroidRadiusMin + tuning.asteroidRadiusRange) * getTuningValue("eliteRadiusMultiplier", 2.05) * scale;
  const elite = makeAsteroid(
    (Math.random() - 0.5) * 1.3 * getTuningValue("laneHalfWidth", 340),
    (Math.random() - 0.5) * 1.3 * getTuningValue("laneHalfHeight", 220),
    getTuningValue("farDistance", 1700) * 0.86,
    radius,
    0,
    0,
    region,
    scale
  );
  elite.elite = true;
  elite.hp = getTuningValue("eliteHp", 6);
  elite.maxHp = elite.hp;
  elite.maxSpeed = getTuningValue("eliteMaxSpeedMultiplier", 0.8) * getTuningValue("shipSpeed3d", 300);
  elite.approachFactor = getTuningValue("eliteSpeedMultiplier", 0.5);
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
  spawnEliteAsteroid(region);
  spawnMessage(L("eliteApproach"), 0, 0, "#ffb59e", 1.4);
}

function steerEliteAsteroid(elite, dt) {
  const accel = getTuningValue("eliteHomingAccel", 30);
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const dist = Math.hypot(dx, dy) || 1;
  elite.vx += (dx / dist) * accel * dt;
  elite.vy += (dy / dist) * accel * dt;
  const speed = Math.hypot(elite.vx, elite.vy);
  if (speed > elite.maxSpeed) {
    elite.vx = (elite.vx / speed) * elite.maxSpeed;
    elite.vy = (elite.vy / speed) * elite.maxSpeed;
  }
}

function repelPlayerFromElite(elite) {
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const dist = Math.hypot(dx, dy) || 1;
  const knockback = getTuningValue("eliteKnockback", 260) * getGameplayScale();
  state.player.vx += (dx / dist) * knockback;
  state.player.vy += (dy / dist) * knockback;
  elite.vx -= (dx / dist) * getTuningValue("eliteRecoil", 90);
  elite.vy -= (dy / dist) * getTuningValue("eliteRecoil", 90);
  clampPlayerToLane();
}

function spawnEliteFragments(elite, region) {
  const count = Math.floor(getTuningValue("eliteSplitCount", 3));
  const speed = getTuningValue("eliteSplitSpeed", 165) * getGameplayScale();
  const safeGap = getTuningValue("eliteFragmentSafeGap", 52);
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const radius = (tuning.asteroidRadiusMin + Math.random() * tuning.asteroidRadiusRange) * getGameplayScale();
    let x = elite.x + Math.cos(angle) * (elite.radius + radius);
    let y = elite.y + Math.sin(angle) * (elite.radius + radius);
    if (Math.hypot(x - state.player.x, y - state.player.y) < safeGap) {
      x = elite.x - Math.cos(angle) * (elite.radius + radius);
      y = elite.y - Math.sin(angle) * (elite.radius + radius);
    }
    const fragment = makeAsteroid(x, y, elite.z, radius, Math.cos(angle) * speed, Math.sin(angle) * speed, region);
    fragment.approachFactor = 0.9;
    state.asteroids.push(fragment);
  }
}

/* ---------- 星域与跃迁 ---------- */

function updateRegionFlow(dt) {
  if (state.routeChoice.active) {
    state.routeChoice.timer = Math.max(0, state.routeChoice.timer - dt);
    for (const gate of state.routeChoice.gates) {
      gate.age = (gate.age || 0) + dt;
      gate.z = Math.max(220, gate.z - 95 * dt);
    }
    if (state.routeChoice.timer <= 0) chooseFallbackRoute();
    return;
  }
  state.regionTimer += dt;
  if (state.regionTimer >= tuning.routeChoiceInterval) beginRouteChoice();
}

function makeRouteGate(regionId, x, z) {
  const region = regions[regionId];
  return {
    regionId,
    x,
    z,
    age: 0,
    label: region ? region.label : regionId,
    tint: region ? region.tint : "98,228,255"
  };
}

function beginRouteChoice() {
  const ids = Object.keys(regions).filter((id) => id !== state.regionId);
  const picks = [];
  while (picks.length < 2 && ids.length) {
    picks.push(ids.splice(Math.floor(Math.random() * ids.length), 1)[0]);
  }
  const z = getTuningValue("farDistance", 1700) * 0.5;
  state.routeChoice.active = true;
  state.routeChoice.timer = tuning.routeChoiceDuration;
  state.routeChoice.gates = [
    makeRouteGate(picks[0], -getTuningValue("laneHalfWidth", 340) * 0.62, z),
    makeRouteGate(picks[1], getTuningValue("laneHalfWidth", 340) * 0.62, z)
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
    const distance = Math.hypot(gate.x - state.player.x, gate.z - state.player.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = gate;
    }
  }
  resolveRouteChoice(best.regionId);
}

function pruneAsteroidsAfterRoute() {
  state.asteroids = state.asteroids.filter((asteroid) => {
    if (asteroid.elite) return false;
    return asteroid.z > getTuningValue("farDistance", 1700) * 0.3;
  });
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
  playSound("pickup");
  evaluateAchievements();
}

function handleRouteGateCollision() {
  if (!state.routeChoice.active) return;
  for (const gate of state.routeChoice.gates) {
    const dx = state.player.x - gate.x;
    const dy = state.player.y;
    const dz = state.player.z - gate.z;
    if (dx * dx + dy * dy < tuning.routeGateRadius * tuning.routeGateRadius && Math.abs(dz) < 90) {
      resolveRouteChoice(gate.regionId);
      return;
    }
  }
}

/* ---------- 拾取物 ---------- */

function samplePickupPosition() {
  const halfW = getTuningValue("laneHalfWidth", 340);
  const halfH = getTuningValue("laneHalfHeight", 220);
  return {
    x: (Math.random() - 0.5) * 1.5 * halfW,
    y: (Math.random() - 0.5) * 1.5 * halfH,
    z: 420 + Math.random() * 620
  };
}

function findSafePickupPosition(radius) {
  let best = samplePickupPosition();
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < tuning.maxPickupSpawnAttempts; attempt += 1) {
    const candidate = samplePickupPosition();
    let score = Infinity;
    for (const asteroid of state.asteroids) {
      if (asteroid.z > candidate.z + 60 || asteroid.z < candidate.z - 60) continue;
      score = Math.min(score, Math.hypot(candidate.x - asteroid.x, candidate.y - asteroid.y) - asteroid.radius - radius);
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
  const radius = 11 * getGameplayScale();
  const spawn = findSafePickupPosition(radius);
  state.cores.push({ x: spawn.x, y: spawn.y, z: spawn.z, radius, pulse: Math.random() * Math.PI * 2 });
}

function spawnPowerUp() {
  const type = Math.random() > 0.5 ? "shield" : "double";
  const radius = 13 * getGameplayScale();
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

function hasActiveMovement() {
  return inputController.hasActiveMovement();
}

function update(dt) {
  state.pulseTime += dt;
  updateStars(dt);
  updateParticles(dt);
  updateRings(dt);
  updateMessages(dt);

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
    state.approachSpeed = Math.min(
      getTuningValue("approachSpeedMax", 330),
      state.approachSpeed + getTuningValue("approachSpeedStep", 0.075) * tuning.difficultyStep
    );
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
  state.laneOffset += state.approachSpeed * dt;
  spawnThrusterTrail(dt);
  moveAsteroids(dt);
  moveLasers(dt);
  updatePickups(dt);
  handleCollisions();
  syncHud();
}

function movePlayer(dt) {
  const keyboard = inputController.getKeyboardMovement();
  const dx = keyboard.dx + gestureMovement.dx;
  const dy = keyboard.dy + gestureMovement.dy;
  const inputLength = Math.hypot(dx, dy);
  const maxSpeed = getTuningValue("shipSpeed3d", 300);
  const acceleration = getTuningValue("shipAccel3d", 14);
  const deceleration = getTuningValue("shipDecel3d", 20);

  if (inputLength > 0) {
    const nx = dx / inputLength;
    const ny = dy / inputLength;
    const inputScale = Math.min(1, inputLength);
    const blend = 1 - Math.exp(-acceleration * dt);
    state.player.vx += (nx * maxSpeed * inputScale - state.player.vx) * blend;
    state.player.vy += (ny * maxSpeed * inputScale - state.player.vy) * blend;
  } else {
    const blend = Math.exp(-deceleration * dt);
    state.player.vx *= blend;
    state.player.vy *= blend;
  }

  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;
  clampPlayerToLane();

  const speedRatio = Math.min(1, Math.hypot(state.player.vx, state.player.vy) / maxSpeed);
  const thrustTarget = inputLength > 0 ? Math.max(0.4, speedRatio) : 0.35;
  state.player.thrust += (thrustTarget - state.player.thrust) * (1 - Math.exp(-10 * dt));

  const rollTarget = clamp(state.player.vx / maxSpeed, -1, 1);
  const pitchTarget = clamp(state.player.vy / maxSpeed, -1, 1);
  state.player.roll += (rollTarget - state.player.roll) * (1 - Math.exp(-9 * dt));
  state.player.pitch += (pitchTarget - state.player.pitch) * (1 - Math.exp(-9 * dt));
}

// 管状软边界：贴边时推回并吃掉朝外的速度，而不是硬停。
function clampPlayerToLane() {
  const halfW = getTuningValue("laneHalfWidth", 340) - state.player.radius;
  const halfH = getTuningValue("laneHalfHeight", 220) - state.player.radius;
  if (state.player.x < -halfW || state.player.x > halfW) {
    const limit = state.player.x < 0 ? -halfW : halfW;
    const overshoot = state.player.x - limit;
    state.player.x = limit + overshoot * 0.35;
    state.player.vx *= -0.15;
  }
  if (state.player.y < -halfH || state.player.y > halfH) {
    const limit = state.player.y < 0 ? -halfH : halfH;
    const overshoot = state.player.y - limit;
    state.player.y = limit + overshoot * 0.35;
    state.player.vy *= -0.15;
  }
}

function spawnThrusterTrail(dt) {
  if (!hasActiveMovement()) {
    state.player.trailTimer = 0;
    return;
  }
  state.player.trailTimer += dt;
  if (state.player.trailTimer < getTuningValue("thrusterTrailInterval", 0.035)) return;
  state.player.trailTimer = 0;
  const color = state.shipColor;
  for (let i = 0; i < 2; i += 1) {
    state.particles.push(acquireParticle(
      state.player.x + (Math.random() - 0.5) * 14,
      state.player.y + (Math.random() - 0.5) * 10,
      state.player.z - 18,
      -state.player.vx * 0.12 + (Math.random() - 0.5) * 26,
      -state.player.vy * 0.12 + (Math.random() - 0.5) * 26,
      -140 - Math.random() * 80,
      0.2 + Math.random() * 0.2,
      2 + Math.random() * 2.4,
      Math.random() > 0.5 ? color.hi : rgba(color.rgb, 0.8)
    ));
  }
}

function moveAsteroids(dt) {
  const approach = state.approachSpeed;
  const cullZ = -getTuningValue("behindCull", 120);
  let alive = 0;
  for (const asteroid of state.asteroids) {
    if (asteroid.elite) steerEliteAsteroid(asteroid, dt);
    asteroid.z -= approach * asteroid.approachFactor * dt;
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.rotation += asteroid.spin * dt;
    asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 4);

    const halfW = getTuningValue("laneHalfWidth", 340);
    const halfH = getTuningValue("laneHalfHeight", 220);
    if (asteroid.x < -halfW || asteroid.x > halfW) asteroid.vx *= -0.6;
    if (asteroid.y < -halfH || asteroid.y > halfH) asteroid.vy *= -0.6;

    if (asteroid.z > cullZ) state.asteroids[alive++] = asteroid;
  }
  state.asteroids.length = alive;
}

function moveLasers(dt) {
  let alive = 0;
  const cullZ = getTuningValue("farDistance", 1700);
  for (const laser of state.lasers) {
    laser.z += laser.vz * dt;
    laser.life -= dt;
    if (laser.life > 0 && laser.z < cullZ) state.lasers[alive++] = laser;
  }
  state.lasers.length = alive;
}

function updatePickups(dt) {
  const approach = state.approachSpeed * 0.55;
  for (const core of state.cores) core.pulse += dt * 3;
  for (const powerUp of state.powerUps) powerUp.pulse += dt * 3.5;
  state.cores = state.cores.filter((core) => { core.z -= approach * dt; return core.z > -60; });
  state.powerUps = state.powerUps.filter((powerUp) => { powerUp.z -= approach * dt; return powerUp.z > -60; });
}

function updateParticles(dt) {
  let alive = 0;
  for (let i = 0; i < state.particles.length; i += 1) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life > 0) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= p.drag ?? 0.988;
      p.vy *= p.drag ?? 0.988;
      p.vz *= p.drag ?? 0.988;
      state.particles[alive++] = p;
    } else {
      releaseParticle(p);
    }
  }
  state.particles.length = alive;
}

function updateRings(dt) {
  let alive = 0;
  for (const ring of state.rings) {
    ring.life -= dt;
    ring.radius += ring.speed * dt;
    if (ring.life > 0) state.rings[alive++] = ring;
  }
  state.rings.length = alive;
}

function updateMessages(dt) {
  let alive = 0;
  for (const message of state.messages) {
    message.life -= dt;
    message.y += message.vy * dt;
    if (message.life > 0) state.messages[alive++] = message;
  }
  state.messages.length = alive;
}

/* ---------- 射击 ---------- */

function fireLaser() {
  if (!state.running || state.paused || state.gameOver || state.shootCooldown > 0) return;
  state.shootCooldown = tuning.shootCooldown;
  playSound("shoot");

  const speed = tuning.laserSpeed * 2.4;
  const offsetX = tuning.doubleShotOffset;
  if (state.doubleShotTimer > 0) {
    state.stats.shotsFired += 2;
    spawnLaser(state.player.x - offsetX, state.player.y, speed);
    spawnLaser(state.player.x + offsetX, state.player.y, speed);
    return;
  }
  state.stats.shotsFired += 1;
  spawnLaser(state.player.x, state.player.y, speed);
}

function spawnLaser(x, y, speed) {
  state.lasers.push({ x, y, z: 8, vz: speed, life: tuning.laserLife });
  for (let i = 0; i < 4; i += 1) {
    state.particles.push(acquireParticle(
      x, y, 10,
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 60,
      120 + Math.random() * 140,
      0.1 + Math.random() * 0.1,
      1.6 + Math.random() * 2,
      Math.random() > 0.5 ? "#77ebff" : "#b7f4ff"
    ));
  }
}

/* ---------- 碰撞 ---------- */

function handleCollisions() {
  handleRouteGateCollision();

  if (state.invulnerabilityTimer <= 0) {
    for (let i = state.asteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = state.asteroids[i];
      if (!isWithinRadius3d(asteroid.x, asteroid.y, asteroid.z, state.player.x, state.player.y, state.player.z, asteroid.radius + state.player.radius)) continue;

      spawnBurst(asteroid.x, asteroid.y, asteroid.z, 18, ["#ff8ea1", "#ffc5cf", "#ffd7a1"]);
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
        spawnShieldImpactEffect(state.player.x, state.player.y, state.player.z);
        spawnMessage(L("shieldMinus"), state.player.x, state.player.y, "#8affd1");
        playSound("hurt");
        break;
      }

      state.health -= 1;
      state.stats.damagedThisRun = true;
      state.invulnerabilityTimer = tuning.hitInvulnerability;
      state.flashTimer = tuning.hitFlashDuration;
      triggerScreenShake(0.28, 18);
      spawnHullImpactEffect(state.player.x, state.player.y, state.player.z);
      spawnMessage(L("hullMinus"), state.player.x, state.player.y, "#ff8ea1");
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
      spawnBurst(laser.x, laser.y, laser.z, isLarge ? 9 : 7, ["#74ecff", "#d2fbff", "#8c9bb7"]);
      spawnImpactEffect(laser.x, laser.y, laser.z, isLarge);
      triggerScreenShake(0.08, isLarge ? 6 : 4);

      if (asteroid.hp <= 0) {
        state.stats.destroyedAsteroids += 1;
        state.asteroids.splice(j, 1);
        if (asteroid.elite) {
          const eliteScore = Math.round(getTuningValue("scoreElite", 140));
          state.score += eliteScore;
          state.stats.destroyedElites += 1;
          spawnEliteFragments(asteroid, getCurrentRegion());
          spawnBurst(asteroid.x, asteroid.y, asteroid.z, 34, ["#7fe8ff", "#dce7ff", "#ffd7a1", "#95a5bf"]);
          spawnExplosionEffect(asteroid.x, asteroid.y, asteroid.z, asteroid.radius, true);
          spawnMessage(L("eliteBreak", eliteScore), asteroid.x, asteroid.y, rgba(asteroid.mineralTint, 0.95));
          triggerScreenShake(0.36, 20);
        } else {
          state.score += tuning.scoreAsteroid;
          spawnBurst(asteroid.x, asteroid.y, asteroid.z, isLarge ? 24 : 16, ["#7fe8ff", "#dce7ff", "#95a5bf"]);
          spawnExplosionEffect(asteroid.x, asteroid.y, asteroid.z, asteroid.radius, isLarge);
          triggerScreenShake(isLarge ? 0.18 : 0.12, isLarge ? 12 : 7);
        }
        playSound("explode");
        evaluateAchievements();
      } else {
        playSound("hit");
      }
      break;
    }
    if (hit) continue;
  }

  for (let i = state.cores.length - 1; i >= 0; i -= 1) {
    const core = state.cores[i];
    if (!isWithinRadius3d(core.x, core.y, core.z, state.player.x, state.player.y, state.player.z, core.radius + state.player.radius + 6)) continue;
    state.cores.splice(i, 1);
    state.score += tuning.scoreCore;
    state.stats.collectedCores += 1;
    spawnBurst(core.x, core.y, core.z, 12, ["#8affd1", "#f3fffd", "#62e4ff"]);
    spawnMessage(L("corePlus"), core.x, core.y, "#8affd1");
    playSound("pickup");
    evaluateAchievements();
  }

  for (let i = state.powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = state.powerUps[i];
    if (!isWithinRadius3d(powerUp.x, powerUp.y, powerUp.z, state.player.x, state.player.y, state.player.z, powerUp.radius + state.player.radius + 6)) continue;
    state.powerUps.splice(i, 1);
    if (powerUp.type === "shield") {
      state.shieldCharges = 1;
      spawnBurst(powerUp.x, powerUp.y, powerUp.z, 16, ["#8affd1", "#d9fffb", "#62e4ff"]);
      spawnShieldImpactEffect(state.player.x, state.player.y, state.player.z);
      spawnMessage(L("shieldReady"), powerUp.x, powerUp.y, "#8affd1");
    } else {
      state.doubleShotTimer = tuning.doubleShotDuration;
      spawnBurst(powerUp.x, powerUp.y, powerUp.z, 16, ["#ffd7a1", "#ffb59e", "#ff8ea1"]);
      spawnMessage(L("doubleFire"), powerUp.x, powerUp.y, "#ffb59e");
    }
    triggerScreenShake(0.12, 8);
    playSound("pickup");
  }
}

/* ---------- 特效 ---------- */

function spawnRing(x, y, z, radius, speed, color, life = getTuningValue("impactRingLife", 0.34), lineWidth = 2) {
  state.rings.push({ x, y, z, radius, speed, color, life, maxLife: life, lineWidth });
}

function spawnDirectionalBurst(x, y, z, count, colors, speedBase, speedRange) {
  for (let i = 0; i < count; i += 1) {
    const p = acquireParticle(
      x, y, z,
      (Math.random() - 0.5) * 2 * (speedBase + Math.random() * speedRange) * 0.5,
      (Math.random() - 0.5) * 2 * (speedBase + Math.random() * speedRange) * 0.5,
      (Math.random() - 0.5) * 2 * (speedBase + Math.random() * speedRange) * 0.5,
      0.18 + Math.random() * 0.28,
      1.2 + Math.random() * 3.2,
      colors[Math.floor(Math.random() * colors.length)]
    );
    p.drag = 0.974;
    state.particles.push(p);
  }
}

function spawnBurst(x, y, z, count, colors) {
  for (let i = 0; i < count; i += 1) {
    const s = 50 + Math.random() * 200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    state.particles.push(acquireParticle(
      x, y, z,
      Math.sin(phi) * Math.cos(theta) * s,
      Math.sin(phi) * Math.sin(theta) * s,
      Math.cos(phi) * s,
      0.22 + Math.random() * 0.45,
      1.4 + Math.random() * 3.6,
      colors[Math.floor(Math.random() * colors.length)]
    ));
  }
}

function spawnImpactEffect(x, y, z, isLarge) {
  spawnRing(x, y, z, isLarge ? 10 : 7, isLarge ? 130 : 110, "rgba(116,236,255,0.88)", 0.24, isLarge ? 2.4 : 1.8);
  spawnDirectionalBurst(x, y, z, isLarge ? 10 : 7, ["#74ecff", "#d2fbff", "#8c9bb7"], 90, 210);
}

function spawnExplosionEffect(x, y, z, radius, isLarge) {
  spawnRing(x, y, z, radius * 0.55, isLarge ? 220 : 170, "rgba(127,232,255,0.82)", isLarge ? 0.44 : 0.36, isLarge ? 3.2 : 2.4);
  spawnRing(x, y, z, radius * 0.25, isLarge ? 150 : 120, "rgba(255,215,161,0.62)", 0.28, 1.8);
  spawnBurst(x, y, z, isLarge ? 22 : 14, ["#7fe8ff", "#dce7ff", "#ffd7a1", "#95a5bf"]);
}

function spawnShieldImpactEffect(x, y, z) {
  spawnRing(x, y, z, state.player.radius + 10, 170, "rgba(138,255,209,0.9)", 0.34, 3.2);
  spawnBurst(x, y, z, 14, ["#8affd1", "#d4fff4", "#62e4ff"]);
}

function spawnHullImpactEffect(x, y, z) {
  spawnRing(x, y, z, state.player.radius + 6, 150, "rgba(255,111,135,0.86)", 0.34, 3);
  spawnBurst(x, y, z, 16, ["#ff8ea1", "#ffd7a1", "#fff0d6"]);
}

function spawnMessage(text, x, y, color = "#f2f7ff", life = 0.9) {
  state.messages.push({ text, x, y, z: 120, vy: -40, color, life });
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

function evaluateAchievements({ silent = false } = {}) {
  let unlocked = false;
  for (const achievement of achievements) {
    if (profile.unlocked[achievement.id]) continue;
    const getter = metricGetters[achievement.metric];
    if (!getter || getter() < achievement.threshold) continue;
    profile.unlocked[achievement.id] = Date.now();
    runAchievementUnlocks.push(achievement.id);
    unlocked = true;
    if (!silent) {
      spawnMessage(
        `${profileUi[state.lang].achievementPrefix}${achLabel(achievement)}`,
        state.player.x,
        state.player.y,
        profileUi.achievementColor,
        profileUi.toastLife
      );
    }
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
  evaluateAchievements({ silent: true });
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

function makeCamera() {
  return projection.createCamera({
    player: {
      x: state.player.x * 0.7,
      y: state.player.y * 0.7,
      z: state.player.z
    },
    width: cw,
    height: ch,
    fovDegrees: getTuningValue("fovDegrees", 55),
    cameraDistance: getTuningValue("cameraDistance", 520),
    cameraHeight: getTuningValue("cameraHeight", 150),
    cameraPitch: getTuningValue("cameraPitch", 0.16)
  });
}

function draw() {
  const region = getCurrentRegion();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();

  if (state.screenShakeTimer > 0 && state.screenShakeStrength > 0) {
    const intensity = state.screenShakeStrength * Math.min(1, 0.45 + state.screenShakeTimer * 4);
    ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
  }

  const camera = makeCamera();
  render3d.renderScene(ctx, {
    width: cw,
    height: ch,
    state,
    tuning,
    camera,
    region,
    lang: state.lang,
    skin: activeSkin
  });

  drawMessages(camera);
  drawVignette();
  drawLaneRadar();
  drawHudOverlay(region);
  drawWarpFlash();
  ctx.restore();
}

function drawMessages(camera) {
  for (const message of state.messages) {
    const p = projection.projectPoint({ x: message.x, y: message.y, z: message.z }, camera);
    if (!p.visible) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, message.life * 2);
    ctx.font = `600 ${Math.max(11, 15 * p.scale)}px "Segoe UI", sans-serif`;
    ctx.fillStyle = message.color;
    ctx.textAlign = "center";
    ctx.fillText(message.text, p.x, p.y);
    ctx.restore();
  }
}

function drawLaneRadar() {
  const size = tuning.minimapSize;
  const margin = tuning.minimapMargin;
  // Top-right: the ship sits near the bottom of a 3D frame, so the old
  // bottom-left radar would cover it.
  const left = cw - size - margin;
  const top = margin + 46;

  const far = getTuningValue("farDistance", 1700);
  const halfW = getTuningValue("laneHalfWidth", 340);
  const toX = (wx) => left + ((wx / halfW) * 0.5 + 0.5) * size;
  const toY = (wz) => top + size - (wz / far) * size;

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
    const y = top + (size * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + size, y);
    ctx.stroke();
  }

  for (const asteroid of state.asteroids) {
    if (asteroid.z < 0) continue;
    const x = toX(asteroid.x);
    const y = toY(asteroid.z);
    ctx.fillStyle = asteroid.elite ? "rgba(255,181,158,0.95)" : "rgba(150,168,196,0.75)";
    ctx.beginPath();
    ctx.arc(x, y, asteroid.elite ? 2.6 : 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const core of state.cores) {
    if (core.z < 0) continue;
    ctx.fillStyle = "rgba(138,255,209,0.9)";
    ctx.beginPath();
    ctx.arc(toX(core.x), toY(core.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const gate of state.routeChoice.gates) {
    ctx.strokeStyle = rgba(gate.tint, 0.95);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(toX(gate.x), toY(gate.z), 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(226,252,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(toX(state.player.x), toY(0) - 5);
  ctx.lineTo(toX(state.player.x) + 4, toY(0) + 3);
  ctx.lineTo(toX(state.player.x) - 4, toY(0) + 3);
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

  const statusY = ch - pad - 8;
  ctx.textAlign = "right";
  if (state.shieldCharges > 0) {
    ctx.fillStyle = "#8affd1";
    ctx.fillText(L("shield"), ch > 0 ? cw - pad : 0, statusY);
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
  fireLaser,
  startGame,
  togglePause,
  pauseGame,
  handleSettingsKeydown,
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
showOverlay("start", ui.startTitle, ui.startText, ui.startButton);
state.stars3d = Array.from({ length: tuning.starCount }, () => makeStar(true));
draw();
window.starRingRenderer.createRenderLoop({
  windowObject: window,
  state,
  tuning,
  update,
  draw
}).start();

if (new URLSearchParams(window.location.search).has("test")) {
  window.starRingTestApi = {
    getState: () => ({
      running: state.running,
      paused: state.paused,
      gameOver: state.gameOver,
      regionId: state.regionId,
      regionJunctions: state.regionJunctions,
      eliteCount: state.asteroids.filter((asteroid) => asteroid.elite).length,
      language: state.lang,
      title: document.title
    }),
    startGame,
    pauseGame,
    resumeGame,
    resolveRouteChoice,
    spawnEliteAsteroid,
    setLanguage,
    endGame,
    spawnAsteroid,
    handleCollisions,
    spawnAsteroidAt: (x, y, z, radius) => {
      const asteroid = makeAsteroid(x, y, z, radius || 30, 0, 0, getCurrentRegion());
      state.asteroids.push(asteroid);
      return asteroid;
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
      player: { x: state.player.x, y: state.player.y, z: state.player.z },
      health: state.health,
      score: state.score
    })
  };
}