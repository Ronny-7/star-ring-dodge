const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const { bestKey, profileKey, tuning, uiText, regions, achievements, profileUi, i18n } = window.starRingConfig;

let ui = (window.starRingConfig.uiText && window.starRingConfig.uiText.zh) || {};

function L(key, ...args) {
  const table = (i18n && i18n[state ? state.lang : "zh"]) || {};
  const entry = table[key];
  if (typeof entry === "function") return entry(...args);
  return entry != null ? entry : key;
}

function regionDisplayName(r) {
  if (!r) return "";
  return state.lang === "en" ? (r.label || r.name) : (r.name || r.label);
}

function achLabel(a) {
  if (!a) return "";
  return state.lang === "en" ? (a.labelEn || a.label) : (a.label || a.labelEn);
}

function applyLanguage() {
  ui = (uiText && uiText[state.lang]) || uiText.zh || ui;
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  const langButtons = document.querySelectorAll("[data-lang]");
  langButtons.forEach((b) => b.classList.toggle("active", b.dataset.lang === (state ? state.lang : "zh")));
}

function setLanguage(lang) {
  if (lang !== "zh" && lang !== "en") return;
  state.lang = lang;
  applyLanguage();
  if (typeof profile !== "undefined" && profile) {
    profile.lang = lang;
    saveProfile();
  }
  applyLanguageToDOM();
  const langButtons = document.querySelectorAll("[data-lang]");
  langButtons.forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
}

function applyLanguageToDOM() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
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
  syncToggleButton(musicBtn, musicEnabled);
  syncToggleButton(sfxBtn, sfxEnabled);
}


let audioCtx = null;
let musicEnabled = true;
let sfxEnabled = true;
let activeSkin = "default";
let activeColor = "blue";

const REGION_IDS = Object.keys(regions);
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
function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function isWithinRadius(ax, ay, bx, by, radius) {
  return distanceSquared(ax, ay, bx, by) < radius * radius;
}
let musicGain = null;
let musicNodes = [];

function getAudioContext() {
  if (audioCtx) {
    return audioCtx;
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  try {
    audioCtx = new AudioContextCtor();
    return audioCtx;
  } catch {
    return null;
  }
}

async function ensureAudioRunning(ctx) {
  if (ctx.state !== "suspended") {
    return true;
  }
  try {
    await ctx.resume();
    return true;
  } catch {
    return false;
  }
}

async function startMusic() {
  if (!musicEnabled || musicNodes.length) return;
  const ctxAudio = getAudioContext();
  if (!ctxAudio || !(await ensureAudioRunning(ctxAudio))) return;
  if (!musicEnabled || musicNodes.length) return;
  const master = ctxAudio.createGain();
  master.gain.setValueAtTime(0.06, ctxAudio.currentTime);
  master.connect(ctxAudio.destination);
  musicGain = master;

  // bass drone
  const bass = ctxAudio.createOscillator();
  const bassG = ctxAudio.createGain();
  bass.type = "sine";
  bass.frequency.value = 55;
  bassG.gain.value = 0.5;
  bass.connect(bassG); bassG.connect(master);
  bass.start();

  // mid pad
  const pad = ctxAudio.createOscillator();
  const padG = ctxAudio.createGain();
  pad.type = "triangle";
  pad.frequency.value = 110;
  padG.gain.value = 0.3;
  pad.connect(padG); padG.connect(master);
  pad.start();

  // slow LFO on pad volume for breathing effect
  const lfo = ctxAudio.createOscillator();
  const lfoG = ctxAudio.createGain();
  lfo.frequency.value = 0.18;
  lfoG.gain.value = 0.15;
  lfo.connect(lfoG); lfoG.connect(padG.gain);
  lfo.start();

  musicNodes = [bass, pad, lfo, bassG, padG, lfoG, master];
}

function stopMusic() {
  for (const node of musicNodes) {
    try { node.stop ? node.stop() : node.disconnect(); } catch {}
  }
  musicNodes = [];
  musicGain = null;
}

function syncToggleButton(button, enabled) {
  button.textContent = enabled ? L("on") : L("off");
  button.classList.toggle("active", enabled);
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  if (musicEnabled) startMusic();
  else stopMusic();
  syncToggleButton(musicBtn, musicEnabled);
}

function toggleSfx() {
  sfxEnabled = !sfxEnabled;
  syncToggleButton(sfxBtn, sfxEnabled);
}

const vibrationMap = { shoot: 10, hit: 20, explode: 40, pickup: 15, hurt: 80 };

function playSound(type) {
  if (!sfxEnabled) return;
  const vibrationDuration = vibrationMap[type];
  if (!vibrationDuration) return;
  if (navigator.vibrate) navigator.vibrate(vibrationDuration);

  const ctxAudio = getAudioContext();
  if (!ctxAudio) return;
  if (ctxAudio.state === "suspended") {
    ctxAudio.resume().catch(() => {});
  }
  const now = ctxAudio.currentTime;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.connect(gain);
  gain.connect(ctxAudio.destination);

  if (type === "shoot") {
    // crisp laser zap: triangle + quick pitch drop
    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.07);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.start(now); osc.stop(now + 0.07);
  } else if (type === "hit") {
    // dull thud: low sawtooth
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === "explode") {
    // rumble: noise-like via detuned sawtooth + filter
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.35);
    const filter = ctxAudio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    osc.disconnect(); osc.connect(filter); filter.connect(gain);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now); osc.stop(now + 0.35);
  } else if (type === "pickup") {
    // bright chime: two-tone arpeggio
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.setValueAtTime(0.1, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.start(now); osc.stop(now + 0.22);
  } else if (type === "hurt") {
    // harsh buzz: square wave descend
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.28);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(now); osc.stop(now + 0.28);
  }
}

const particlePool = [];
function acquireParticle(x, y, vx, vy, life, size, color) {
  const p = particlePool.pop() || {};
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.size = size; p.color = color; p.drag = 0.988;
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
const overlayStats = document.getElementById("overlay-stats");
const overlayStatGrid = document.getElementById("overlay-stat-grid");
const overlayRecord = document.getElementById("overlay-record");
const startButton = document.getElementById("start-button");
const playfieldEl = canvas.parentElement;
const touchControls = document.querySelectorAll("[data-touch-action]");
const gesturePad = document.querySelector("[data-gesture-pad]");
const orientationButton = document.querySelector("[data-orientation-button]");
const settingsButton = document.getElementById("settings-button");
const settingsCloseButton = document.querySelector(".settings-close");
const skinCards = document.querySelectorAll("[data-skin]");
const colorSwatches = document.querySelectorAll("[data-color]");
const mobileViewportQuery = window.matchMedia("(pointer: coarse), (max-width: 780px)");

function getDisplaySize() {
  const rect = playfieldEl.getBoundingClientRect();
  const width = playfieldEl.clientWidth || rect.width || canvas.width;
  const height = playfieldEl.clientHeight || rect.height || canvas.height;
  return {
    width: Math.max(320, Math.round(width)),
    height: Math.max(240, Math.round(height))
  };
}

let dpr = window.devicePixelRatio || 1;
let cw = 960, ch = 600;
let backgroundGradient = null;
let backgroundGradientWidth = 0;
let backgroundGradientHeight = 0;

function resizeCanvas() {
  const { width, height } = getDisplaySize();
  const nextDpr = window.devicePixelRatio || 1;
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
  // scale is reset each draw via setTransform, not here

  state.world.width = Math.max(cw, getTuningValue("worldWidth", 2400));
  state.world.height = Math.max(ch, getTuningValue("worldHeight", 1600));
  state.player.radius = getPlayerRadius();
  updateCamera();
  refreshRouteGatePresentation();
}

function scaleEntity(entity, scaleX, scaleY) {
  entity.x *= scaleX;
  entity.y *= scaleY;
  const scale = Math.min(scaleX, scaleY);
  if (typeof entity.vx === "number") {
    entity.vx *= scaleX;
  }
  if (typeof entity.vy === "number") {
    entity.vy *= scaleY;
  }
  if (typeof entity.radius === "number") {
    entity.radius *= scale;
  }
  if (typeof entity.size === "number") {
    entity.size *= scale;
  }
  if (entity.points) {
    for (const point of entity.points) {
      point.distance *= scale;
    }
  }
  if (entity.craters) {
    for (const crater of entity.craters) {
      crater.x *= scaleX;
      crater.y *= scaleY;
      crater.r *= scale;
    }
  }
  if (entity.cracks) {
    for (const crack of entity.cracks) {
      crack.length *= scale;
    }
  }
  if (entity.glints) {
    for (const glint of entity.glints) {
      glint.x *= scaleX;
      glint.y *= scaleY;
      glint.size *= scale;
    }
  }
}

function getGameplayScale() {
  const shortSide = Math.min((canvas.width || 960) / dpr, (canvas.height || 600) / dpr);
  return Math.max(0.72, Math.min(1, shortSide / 560));
}

function getPlayerRadius() {
  return 22 * getGameplayScale();
}

function updateCamera() {
  const maxX = Math.max(0, state.world.width - cw);
  const maxY = Math.max(0, state.world.height - ch);
  state.camera.x = clamp(state.player.x - cw / 2, 0, maxX);
  state.camera.y = clamp(state.player.y - ch / 2, 0, maxY);
}

function getCameraRect(pad = 0) {
  return {
    left: state.camera.x - pad,
    top: state.camera.y - pad,
    right: state.camera.x + cw + pad,
    bottom: state.camera.y + ch + pad
  };
}

function isCircleInCamera(entity, pad = 0) {
  const rect = getCameraRect(pad + (entity.radius || 0));
  return entity.x >= rect.left && entity.x <= rect.right && entity.y >= rect.top && entity.y <= rect.bottom;
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
applyLanguage();
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


function readBestScore() {
  try {
    return Number(localStorage.getItem(bestKey) || 0);
  } catch {
    return 0;
  }
}

function writeBestScore(score) {
  try {
    localStorage.setItem(bestKey, String(score));
  } catch {
    // Ignore storage failures so the game still runs in restricted contexts.
  }
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatRate(hits, shots) {
  if (shots <= 0) {
    return "--";
  }
  return `${Math.round((hits / shots) * 100)}%`;
}

function createDefaultProfile() {
  return {
    version: 1,
    totals: {
      runs: 0,
      destroyedAsteroids: 0,
      collectedCores: 0,
      warps: 0,
      longestSurvival: 0,
      bestAccuracy: 0
    },
    unlocked: {}
  };
}

function normalizeProfile(raw) {
  const fallback = createDefaultProfile();
  if (!raw || typeof raw !== "object" || raw.version !== 1) {
    return fallback;
  }
  const totals = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  const num = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
  return {
    version: 1,
    totals: {
      runs: num(totals.runs),
      destroyedAsteroids: num(totals.destroyedAsteroids),
      collectedCores: num(totals.collectedCores),
      warps: num(totals.warps),
      longestSurvival: num(totals.longestSurvival),
      bestAccuracy: num(totals.bestAccuracy)
    },
    unlocked: raw.unlocked && typeof raw.unlocked === "object" ? { ...raw.unlocked } : {}
  };
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(profileKey);
    return normalizeProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return createDefaultProfile();
  }
}

function saveProfile() {
  try {
    localStorage.setItem(profileKey, JSON.stringify(profile));
  } catch {
    // Ignore storage failures so the game still runs in restricted contexts.
  }
}

function recordRunToProfile() {
  const accuracy = state.stats.shotsFired > 0
    ? Math.round((state.stats.shotsHit / state.stats.shotsFired) * 100)
    : 0;
  profile.totals.runs += 1;
  profile.totals.destroyedAsteroids += state.stats.destroyedAsteroids;
  profile.totals.collectedCores += state.stats.collectedCores;
  profile.totals.warps += state.regionJunctions;
  profile.totals.longestSurvival = Math.max(profile.totals.longestSurvival, Math.floor(state.stats.survivalTime));
  profile.totals.bestAccuracy = Math.max(profile.totals.bestAccuracy, accuracy);
  saveProfile();
}

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

let bestScore = readBestScore();
let profile = loadProfile();
let runAchievementUnlocks = [];
let overlayMode = "start";
const hudCache = {
  score: null,
  health: null,
  best: null
};
bestEl.textContent = String(bestScore);

const state = {
  lang: (typeof profile !== "undefined" && profile && profile.lang) || "zh",
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
  world: {
    width: Math.max(cw, getTuningValue("worldWidth", 2400)),
    height: Math.max(ch, getTuningValue("worldHeight", 1600))
  },
  camera: {
    x: 0,
    y: 0
  },
  routeChoice: {
    active: false,
    timer: 0,
    gates: []
  },
  vortexCenters: [],
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
    x: cw / 2,
    y: ch / 2,
    radius: tuning.playerRadius,
    speed: tuning.playerSpeed,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrust: 0,
    turnLean: 0,
    trailTimer: 0
  },
  asteroids: [],
  cores: [],
  powerUps: [],
  stars: [],
  lasers: [],
  messages: [],
  particles: [],
  rings: [],
  warpFlash: {
    timer: 0,
    duration: 0,
    tint: "98,228,255",
    secondaryTint: "123,140,255"
  }
};

const keys = new Set();
const fireKeys = new Set(["j", "J"]);
let fireHeld = false;
const gestureMovement = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0
};

function resetGame() {
  keys.clear();
  fireHeld = false;
  clearGestureMovement();
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
  state.routeChoice.active = false;
  state.routeChoice.timer = 0;
  state.routeChoice.gates = [];
  state.vortexCenters = [];
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
  state.world.width = Math.max(cw, getTuningValue("worldWidth", 2400));
  state.world.height = Math.max(ch, getTuningValue("worldHeight", 1600));
  state.player.radius = getPlayerRadius();
  state.player.x = state.world.width / 2;
  state.player.y = state.world.height / 2;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.angle = -Math.PI / 2;
  state.player.thrust = 0;
  state.player.turnLean = 0;
  state.player.trailTimer = 0;
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
  updateCamera();
  state.stars = Array.from({ length: tuning.starCount }, () => makeStar(true));
  syncHud();
  hideOverlay();
}

function syncHud() {
  const nextScore = String(Math.floor(state.score));
  const nextHealth = `${"♥".repeat(state.health)}${"♡".repeat(3 - state.health)}`;
  const nextBest = String(Math.max(bestScore, Math.floor(state.score)));

  if (hudCache.score !== nextScore) {
    scoreEl.textContent = nextScore;
    hudCache.score = nextScore;
  }
  if (hudCache.health !== nextHealth) {
    healthEl.textContent = nextHealth;
    hudCache.health = nextHealth;
  }
  if (hudCache.best !== nextBest) {
    bestEl.textContent = nextBest;
    hudCache.best = nextBest;
  }
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

const settingsOverlay = document.getElementById("settings-overlay");

let pausedBeforeSettings = false;

function openSettings() {
  settingsOverlay.classList.remove("hidden");
  pausedBeforeSettings = state.paused;
  if (state.running && !state.paused && !state.gameOver) {
    state.paused = true;
    keys.clear();
  }
}

function closeSettings() {
  settingsOverlay.classList.add("hidden");
  if (state.running && state.paused && !state.gameOver && !pausedBeforeSettings) {
    state.paused = false;
    state.lastTime = 0;
  }
}

function selectSkin(name) {
  activeSkin = name;
  document.querySelectorAll(".skin-card").forEach(el => {
    el.classList.toggle("active", el.dataset.skin === name);
  });
  renderSkinPreviews();
}

function selectColor(name) {
  activeColor = name;
  document.querySelectorAll(".color-swatch").forEach(el => {
    el.classList.toggle("active", el.dataset.color === name);
  });
  renderSkinPreviews();
}

function renderSkinPreviews() {
  const col = COLORS[activeColor];
  document.querySelectorAll(".skin-preview").forEach(canvas => {
    const skinName = canvas.closest(".skin-card").dataset.skin;
    const pctx = canvas.getContext("2d");
    const size = canvas.width;
    const r = size * 0.26;
    pctx.clearRect(0, 0, size, size);
    pctx.save();
    pctx.translate(size / 2, size / 2 + r * 0.2);
    const skin = SKINS[skinName];
    const top = skin.hullTop(r);
    const hullG = pctx.createLinearGradient(0, top, 0, r + 4);
    hullG.addColorStop(0, col.hi);
    hullG.addColorStop(0.45, col.mid);
    hullG.addColorStop(1, "#0a1a3a");
    pctx.fillStyle = hullG;
    skin.drawHull(pctx, r);
    pctx.fill();
    pctx.shadowBlur = 10;
    pctx.shadowColor = col.glow;
    pctx.strokeStyle = rgba(col.rgb, 0.8);
    pctx.lineWidth = 1.5;
    skin.drawHull(pctx, r);
    pctx.stroke();
    pctx.restore();
  });
}

function showOverlay(mode, title, text, buttonText) {
  overlayMode = mode;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  if (mode !== "gameover") {
    hideOverlayStats();
  }
  overlay.classList.remove("hidden");
}

function makeStar(randomY = false) {
  return {
    x: Math.random() * cw,
    y: randomY ? Math.random() * ch : -20,
    radius: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 36 + 12,
    alpha: Math.random() * 0.6 + 0.18,
    depth: Math.random() * 0.8 + 0.4
  };
}

function makeAsteroidShape(radius) {
  const points = [];
  const count = 12 + Math.floor(Math.random() * 5);
  const jaggedness = 0.22 + Math.random() * 0.18;
  for (let i = 0; i < count; i += 1) {
    const notch = i % 3 === 0 ? -Math.random() * 0.12 : Math.random() * 0.1;
    points.push({
      angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.09,
      distance: radius * (0.76 + Math.random() * jaggedness + notch)
    });
  }

  const craterCount = 3 + Math.floor(Math.random() * 3);
  const craters = Array.from({ length: craterCount }, () => ({
    x: (Math.random() - 0.5) * radius * 0.9,
    y: (Math.random() - 0.5) * radius * 0.9,
    r: radius * (0.1 + Math.random() * 0.2),
    shade: 0.75 + Math.random() * 0.35
  }));

  const crackCount = 3 + Math.floor(Math.random() * 3);
  const cracks = Array.from({ length: crackCount }, () => ({
    angle: Math.random() * Math.PI * 2,
    length: radius * (0.32 + Math.random() * 0.36),
    branch: (Math.random() - 0.5) * 0.55,
    width: 0.8 + Math.random() * 0.8
  }));

  const glints = Array.from({ length: Math.random() > 0.55 ? 2 + Math.floor(Math.random() * 3) : 0 }, () => ({
    x: (Math.random() - 0.5) * radius * 0.95,
    y: (Math.random() - 0.5) * radius * 0.95,
    size: radius * (0.025 + Math.random() * 0.04),
    alpha: 0.22 + Math.random() * 0.28
  }));

  return { points, craters, cracks, glints };
}

function sampleAsteroidSpawn(radius) {
  const edge = Math.floor(Math.random() * 4);
  const rect = getCameraRect(radius);

  if (edge === 0) {
    return {
      x: clamp(rect.left, -radius, state.world.width + radius),
      y: clamp(Math.random() * (rect.bottom - rect.top) + rect.top, radius, state.world.height - radius)
    };
  }

  if (edge === 1) {
    return {
      x: clamp(rect.right, -radius, state.world.width + radius),
      y: clamp(Math.random() * (rect.bottom - rect.top) + rect.top, radius, state.world.height - radius)
    };
  }

  if (edge === 2) {
    return {
      x: clamp(Math.random() * (rect.right - rect.left) + rect.left, radius, state.world.width - radius),
      y: clamp(rect.top, -radius, state.world.height + radius)
    };
  }

  return {
    x: clamp(Math.random() * (rect.right - rect.left) + rect.left, radius, state.world.width - radius),
    y: clamp(rect.bottom, -radius, state.world.height + radius)
  };
}

function triggerScreenShake(duration, strength) {
  state.screenShakeTimer = Math.max(state.screenShakeTimer, duration);
  state.screenShakeStrength = Math.max(state.screenShakeStrength, strength);
}

function getCurrentRegion() {
  return regions[state.regionId] || regions[DEFAULT_REGION_ID];
}

function initRegionMechanics(region) {
  state.vortexCenters = [];
  const mechanic = region && region.mechanic;
  if (!mechanic || mechanic.type !== "vortex") {
    return;
  }
  const desired = Math.max(1, Math.floor(mechanic.centers || 1));
  const safe = 400;
  const margin = tuning.routeGateRadius;
  const attempts = desired * 10;
  let placed = 0;
  for (let i = 0; i < attempts && placed < desired; i += 1) {
    const x = margin + Math.random() * Math.max(1, state.world.width - margin * 2);
    const y = margin + Math.random() * Math.max(1, state.world.height - margin * 2);
    if (Math.hypot(x - state.player.x, y - state.player.y) < safe) continue;
    state.vortexCenters.push({ x, y, phase: Math.random() * Math.PI * 2, spin: Math.random() < 0.5 ? 1 : -1 });
    placed += 1;
  }
  if (placed === 0) {
    state.vortexCenters.push({ x: state.world.width / 2, y: state.world.height / 2, phase: 0, spin: 1 });
  }
}

function getRegionMultiplier(region, name) {
  const value = region[name];
  return typeof value === "number" ? value : 1;
}

function getRouteAdjustedSpawnInterval(region) {
  const slowdown = state.routeChoice.active ? tuning.routeChoiceSpawnSlowdown : 1;
  return state.spawnInterval * getRegionMultiplier(region, "asteroidSpawnMultiplier") * slowdown;
}

function updateRegionFlow(dt) {
  if (state.routeChoice.active) {
    state.routeChoice.timer = Math.max(0, state.routeChoice.timer - dt);
    for (const gate of state.routeChoice.gates) {
      gate.age = (gate.age || 0) + dt;
    }
    if (state.routeChoice.timer <= 0) {
      chooseFallbackRoute();
    }
    return;
  }

  state.regionTimer += dt;
  if (state.regionTimer >= tuning.routeChoiceInterval) {
    beginRouteChoice();
  }
}

function refreshRouteGatePresentation() {
  if (!state.routeChoice.active) {
    return;
  }

  ctx.save();
  ctx.font = '11px "Segoe UI", sans-serif';
  const maxWidth = Math.max(76, Math.min(160, cw * 0.27));
  for (const gate of state.routeChoice.gates) {
    gate.descriptionLines = wrapCanvasText(gate.description, maxWidth, 2);
  }
  ctx.restore();
}

function makeRouteGate(regionId, x, y) {
  const region = regions[regionId];
  return {
    regionId,
    x,
    y,
    radius: tuning.routeGateRadius,
    label: region.label,
    name: region.name,
    description: region.description,
    tint: region.tint,
    secondaryTint: region.secondaryTint,
    age: 0,
    descriptionLines: []
  };
}

function beginRouteChoice() {
  const candidates = REGION_IDS.filter(id => id !== state.regionId);
  const first = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
  const second = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
  const margin = Math.max(getTuningValue("routeGateMargin", 120), cw * 0.16);
  const gateY = clamp(state.player.y, state.player.radius + 90, state.world.height - state.player.radius - 90);
  const leftX = clamp(state.camera.x + margin, tuning.routeGateRadius, state.world.width - tuning.routeGateRadius);
  const rightX = clamp(state.camera.x + cw - margin, tuning.routeGateRadius, state.world.width - tuning.routeGateRadius);

  state.routeChoice.active = true;
  state.routeChoice.timer = tuning.routeChoiceDuration;
  state.routeChoice.gates = [
    makeRouteGate(first, leftX, gateY),
    makeRouteGate(second, rightX, gateY)
  ];
  for (const gate of state.routeChoice.gates) {
    spawnRing(gate.x, gate.y, gate.radius * 0.35, 160, rgba(gate.tint, 0.62), 0.44, 1.8);
  }
  refreshRouteGatePresentation();
  state.regionTimer = 0;
  spawnMessage(L("chooseGate"), state.camera.x + cw / 2, Math.max(state.camera.y + 42, gateY - 72), "#eaf4ff");
}

function chooseFallbackRoute() {
  let fallback = null;
  let closestDistance = Infinity;
  for (const gate of state.routeChoice.gates) {
    const distance = Math.hypot(gate.x - state.player.x, gate.y - state.player.y);
    if (distance < closestDistance) {
      fallback = gate;
      closestDistance = distance;
    }
  }
  if (fallback) {
    resolveRouteChoice(fallback.regionId, fallback.x, fallback.y);
  }
}

function getRouteAsteroidKeepScore(asteroid, x, y) {
  const distanceFromPlayer = Math.hypot(asteroid.x - state.player.x, asteroid.y - state.player.y);
  const distanceFromGate = Math.hypot(asteroid.x - x, asteroid.y - y);
  const isOffscreen = !isCircleInCamera(asteroid, 0);
  const isMovingAway =
    (asteroid.x - state.player.x) * asteroid.vx +
    (asteroid.y - state.player.y) * asteroid.vy > 0;

  return distanceFromPlayer + distanceFromGate * 0.35 + (isOffscreen ? 260 : 0) + (isMovingAway ? 120 : 0);
}

function pruneAsteroidsAfterRoute(x, y) {
  let kept = 0;
  for (const asteroid of state.asteroids) {
    if (!asteroid.elite) {
      state.asteroids[kept++] = asteroid;
    }
  }
  state.asteroids.length = kept;
  state.eliteTimer = 0;

  const targetCount = Math.min(state.asteroids.length, Math.max(2, Math.floor(state.asteroids.length * 0.6)));
  if (state.asteroids.length <= targetCount) {
    return;
  }

  const scoredAsteroids = [];
  for (const asteroid of state.asteroids) {
    scoredAsteroids.push({ asteroid, keepScore: getRouteAsteroidKeepScore(asteroid, x, y) });
  }
  scoredAsteroids.sort((a, b) => b.keepScore - a.keepScore);

  for (let i = 0; i < targetCount; i += 1) {
    state.asteroids[i] = scoredAsteroids[i].asteroid;
  }
  state.asteroids.length = targetCount;
}

function startWarpFlash(region) {
  state.warpFlash.timer = getTuningValue("warpFlashDuration", 0.58);
  state.warpFlash.duration = getTuningValue("warpFlashDuration", 0.58);
  state.warpFlash.tint = region.tint;
  state.warpFlash.secondaryTint = region.secondaryTint;
}

function resolveRouteChoice(regionId, x = state.player.x, y = state.player.y) {
  const nextRegion = regions[regionId];
  if (!nextRegion) {
    return;
  }

  state.regionId = regionId;
  initRegionMechanics(nextRegion);
  state.regionTimer = 0;
  state.regionJunctions += 1;
  state.routeChoice.active = false;
  state.routeChoice.timer = 0;
  state.routeChoice.gates = [];
  pruneAsteroidsAfterRoute(x, y);
  startWarpFlash(nextRegion);
  spawnBurst(x, y, 36, [rgba(nextRegion.tint, 0.95), rgba(nextRegion.secondaryTint, 0.9), "#f4fbff"]);
  spawnRing(x, y, tuning.routeGateRadius * 0.9, 300, rgba(nextRegion.tint, 0.86), 0.52, 4);
  spawnRing(x, y, tuning.routeGateRadius * 1.4, 190, rgba(nextRegion.secondaryTint, 0.62), 0.6, 2.4);
  spawnMessage(regionDisplayName(nextRegion), x, y - 34, rgba(nextRegion.tint, 0.95));
  triggerScreenShake(0.2, 10);
  playSound("pickup");
  evaluateAchievements();
}

function handleRouteGateCollision() {
  if (!state.routeChoice.active) {
    return;
  }

  for (const gate of state.routeChoice.gates) {
    if (isWithinRadius(gate.x, gate.y, state.player.x, state.player.y, gate.radius + state.player.radius)) {
      resolveRouteChoice(gate.regionId, gate.x, gate.y);
      return;
    }
  }
}

function makeAsteroid(x, y, radius, vx, vy, region, scale = getGameplayScale()) {
  const shape = makeAsteroidShape(radius);
  const mineralChance = Math.random();
  const mineralTint = mineralChance > 0.82 ? region.tint : mineralChance > 0.68 ? region.secondaryTint : "160,180,220";

  return {
    x,
    y,
    radius,
    vx,
    vy,
    spin: (Math.random() - 0.5) * 0.03,
    rotation: Math.random() * Math.PI * 2,
    points: shape.points,
    craters: shape.craters,
    cracks: shape.cracks,
    glints: shape.glints,
    mineralTint,
    surfaceTone: 0.86 + Math.random() * 0.28,
    rimAngle: Math.random() * Math.PI * 2,
    hp: radius > tuning.largeAsteroidThreshold * scale ? 2 : 1,
    hitFlash: 0,
    elite: false
  };
}

function findAsteroidSpawn(radius, minDistance) {
  let spawn = sampleAsteroidSpawn(radius);
  let bestDistance = Math.hypot(state.player.x - spawn.x, state.player.y - spawn.y);

  for (let attempt = 1; attempt < tuning.maxSpawnAttempts && bestDistance < minDistance; attempt += 1) {
    const candidate = sampleAsteroidSpawn(radius);
    const candidateDistance = Math.hypot(state.player.x - candidate.x, state.player.y - candidate.y);
    if (candidateDistance > bestDistance) {
      spawn = candidate;
      bestDistance = candidateDistance;
    }
  }

  return bestDistance < minDistance ? null : spawn;
}

function spawnAsteroid(region = getCurrentRegion()) {
  const scale = getGameplayScale();
  const radius = (Math.random() * tuning.asteroidRadiusRange + tuning.asteroidRadiusMin) * scale;
  const spawn = findAsteroidSpawn(radius, tuning.safeSpawnDistance + radius + state.player.radius);
  if (!spawn) return;

  const angle = Math.atan2(state.player.y - spawn.y, state.player.x - spawn.x);
  const speed = (Math.random() * tuning.asteroidSpeedRange + tuning.asteroidSpeedBase) * state.speedScale * getRegionMultiplier(region, "asteroidSpeedMultiplier");

  state.asteroids.push(makeAsteroid(spawn.x, spawn.y, radius, Math.cos(angle) * speed, Math.sin(angle) * speed, region, scale));
}

function getRegionEliteChance(region) {
  return typeof region.eliteChance === "number" ? region.eliteChance : 0;
}

function countEliteAsteroids() {
  let count = 0;
  for (const asteroid of state.asteroids) {
    if (asteroid.elite) count += 1;
  }
  return count;
}

function spawnEliteAsteroid(region = getCurrentRegion()) {
  const scale = getGameplayScale();
  const radius = (tuning.asteroidRadiusMin + tuning.asteroidRadiusRange) * getTuningValue("eliteRadiusMultiplier", 2.05) * scale;
  const spawn = findAsteroidSpawn(radius, tuning.safeSpawnDistance * 1.35 + radius + state.player.radius);
  if (!spawn) return;

  const regionSpeed = getRegionMultiplier(region, "asteroidSpeedMultiplier");
  const angle = Math.atan2(state.player.y - spawn.y, state.player.x - spawn.x);
  const speed = (tuning.asteroidSpeedBase + tuning.asteroidSpeedRange * 0.5) * state.speedScale * regionSpeed * getTuningValue("eliteSpeedMultiplier", 0.5);
  const elite = makeAsteroid(spawn.x, spawn.y, radius, Math.cos(angle) * speed, Math.sin(angle) * speed, region, scale);

  elite.elite = true;
  elite.maxHp = Math.max(2, Math.round(getTuningValue("eliteHp", 6)));
  elite.hp = elite.maxHp;
  elite.spin *= 0.45;
  elite.mineralTint = region.tint;
  elite.pulseSeed = Math.random() * Math.PI * 2;
  elite.maxSpeed = (tuning.asteroidSpeedBase + tuning.asteroidSpeedRange) * state.speedScale * regionSpeed * getTuningValue("eliteMaxSpeedMultiplier", 0.8);
  state.asteroids.push(elite);

  spawnRing(elite.x, elite.y, radius * 0.8, 240, rgba(region.tint, 0.82), 0.52, 3.2);
  spawnRing(elite.x, elite.y, radius * 1.15, 160, rgba(region.secondaryTint, 0.5), 0.6, 2);
  spawnMessage(L("eliteApproach"), elite.x, elite.y - radius - 18, rgba(region.tint, 0.95));
  triggerScreenShake(0.24, 12);
  playSound("explode");
}

function updateEliteFlow(dt, region) {
  if (state.routeChoice.active) {
    return;
  }

  state.eliteTimer += dt;
  if (state.stats.survivalTime < getTuningValue("eliteFirstDelay", 16)) {
    return;
  }
  if (state.eliteTimer < getTuningValue("eliteMinInterval", 22)) {
    return;
  }

  state.eliteTimer = 0;
  const chance = getRegionEliteChance(region);
  if (chance <= 0 || Math.random() >= chance) {
    return;
  }
  if (countEliteAsteroids() >= getTuningValue("eliteMaxActive", 1)) {
    return;
  }

  spawnEliteAsteroid(region);
}

function steerEliteAsteroid(elite, dt) {
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const distance = Math.hypot(dx, dy) || 1;
  const accel = getTuningValue("eliteHomingAccel", 30);

  elite.vx += (dx / distance) * accel * dt;
  elite.vy += (dy / distance) * accel * dt;

  const maxSpeed = elite.maxSpeed || 0;
  if (maxSpeed <= 0) return;

  const speed = Math.hypot(elite.vx, elite.vy);
  if (speed > maxSpeed) {
    elite.vx = (elite.vx / speed) * maxSpeed;
    elite.vy = (elite.vy / speed) * maxSpeed;
  }
}

function placeFragmentClearOfPlayer(x, y, radius) {
  const minGap = state.player.radius + radius + getTuningValue("eliteFragmentSafeGap", 52);
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  const distance = Math.hypot(dx, dy);
  const angle = distance > 0.001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
  const safeDistance = Math.max(distance, minGap);

  return {
    x: clamp(state.player.x + Math.cos(angle) * safeDistance, radius, state.world.width - radius),
    y: clamp(state.player.y + Math.sin(angle) * safeDistance, radius, state.world.height - radius)
  };
}

function spawnEliteFragments(elite, region) {
  const scale = getGameplayScale();
  const count = Math.max(2, Math.round(getTuningValue("eliteSplitCount", 3)));
  const splitSpeed = getTuningValue("eliteSplitSpeed", 165);
  const baseAngle = Math.random() * Math.PI * 2;

  for (let i = 0; i < count; i += 1) {
    const angle = baseAngle + (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const radius = (Math.random() * tuning.asteroidRadiusRange + tuning.asteroidRadiusMin) * scale;
    const spawn = placeFragmentClearOfPlayer(
      elite.x + Math.cos(angle) * elite.radius * 0.62,
      elite.y + Math.sin(angle) * elite.radius * 0.62,
      radius
    );
    const speed = splitSpeed * (0.75 + Math.random() * 0.5);
    state.asteroids.push(makeAsteroid(spawn.x, spawn.y, radius, Math.cos(angle) * speed, Math.sin(angle) * speed, region, scale));
  }
}

function repelPlayerFromElite(elite) {
  const dx = state.player.x - elite.x;
  const dy = state.player.y - elite.y;
  const distance = Math.hypot(dx, dy);
  const angle = distance > 0.001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
  const clearance = elite.radius + state.player.radius + 8;
  const knockback = getTuningValue("eliteKnockback", 260);
  const recoil = getTuningValue("eliteRecoil", 90);

  state.player.x = clamp(elite.x + Math.cos(angle) * clearance, state.player.radius, state.world.width - state.player.radius);
  state.player.y = clamp(elite.y + Math.sin(angle) * clearance, state.player.radius, state.world.height - state.player.radius);
  state.player.vx = Math.cos(angle) * knockback;
  state.player.vy = Math.sin(angle) * knockback;
  elite.vx -= Math.cos(angle) * recoil;
  elite.vy -= Math.sin(angle) * recoil;
}

function samplePickupPosition(margin) {
  const radius = getTuningValue("pickupSpawnLocalRadius", 460);
  const angle = Math.random() * Math.PI * 2;
  const distance = margin + Math.random() * Math.max(1, radius - margin);
  return {
    x: clamp(state.player.x + Math.cos(angle) * distance, margin, state.world.width - margin),
    y: clamp(state.player.y + Math.sin(angle) * distance, margin, state.world.height - margin)
  };
}

function getPickupSafetyScore(position, radius) {
  let score = Math.hypot(position.x - state.player.x, position.y - state.player.y) - state.player.radius - radius;

  for (const asteroid of state.asteroids) {
    const distance = Math.hypot(position.x - asteroid.x, position.y - asteroid.y) - asteroid.radius - radius;
    score = Math.min(score, distance);
  }

  for (const pickup of [...state.cores, ...state.powerUps]) {
    const distance = Math.hypot(position.x - pickup.x, position.y - pickup.y) - pickup.radius - radius;
    score = Math.min(score, distance);
  }

  return score;
}

function findSafePickupPosition(radius, margin) {
  let bestPosition = samplePickupPosition(margin);
  let bestScore = getPickupSafetyScore(bestPosition, radius);
  const targetScore = Math.max(tuning.pickupSafeDistance, tuning.pickupAsteroidDistance);

  for (let attempt = 1; attempt < tuning.maxPickupSpawnAttempts; attempt += 1) {
    const candidate = samplePickupPosition(margin);
    const score = getPickupSafetyScore(candidate, radius);
    if (score > bestScore) {
      bestPosition = candidate;
      bestScore = score;
    }
    if (score >= targetScore) {
      return candidate;
    }
  }

  return bestPosition;
}

function spawnCore() {
  const radius = 11 * getGameplayScale();
  const spawn = findSafePickupPosition(radius, 70);
  state.cores.push({
    x: spawn.x,
    y: spawn.y,
    radius,
    pulse: Math.random() * Math.PI * 2
  });
}

function spawnPowerUp() {
  const type = Math.random() > 0.5 ? "shield" : "double";
  const radius = 13 * getGameplayScale();
  const spawn = findSafePickupPosition(radius, 80);
  state.powerUps.push({
    x: spawn.x,
    y: spawn.y,
    radius,
    pulse: Math.random() * Math.PI * 2,
    type
  });
}

function pauseGame() {
  if (!state.running || state.gameOver || state.paused) {
    return;
  }
  keys.clear();
  state.paused = true;
  showOverlay("pause", ui.pauseTitle, ui.pauseText, ui.pauseButton);
}

function resumeGame() {
  if (!state.paused || state.gameOver) {
    return;
  }
  state.paused = false;
  state.lastTime = 0;
  hideOverlay();
}

function togglePause() {
  if (!state.running || state.gameOver) {
    return;
  }
  if (state.paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function update(dt) {
  state.pulseTime += dt;
  updateStars(dt);
  updateParticles(dt);
  updateRings(dt);
  updateMessages(dt);

  if (!state.running || state.paused) {
    return;
  }

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
  if (fireHeld) {
    fireLaser();
  }
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
  updateCamera();
  spawnThrusterTrail(dt);
  moveAsteroids(dt);
  moveLasers(dt);
  updateCores(dt);
  updatePowerUps(dt);
  handleCollisions();
  syncHud();
}

function spawnThrusterTrail(dt) {
  if (!hasActiveMovement()) {
    state.player.trailTimer = 0;
    return;
  }

  state.player.trailTimer += dt;
  if (state.player.trailTimer < getTuningValue("thrusterTrailInterval", 0.035)) {
    return;
  }
  state.player.trailTimer = 0;

  const skin = SKINS[activeSkin];
  const col = COLORS[activeColor];
  const backAngle = state.player.angle + Math.PI / 2;
  const sideAngle = state.player.angle;
  const sin = Math.sin(state.player.angle);
  const cos = Math.cos(state.player.angle);

  for (const engine of skin.engines) {
    const localX = engine.x * state.player.radius;
    const localY = engine.y * state.player.radius;
    const x = state.player.x + localX * cos - localY * sin;
    const y = state.player.y + localX * sin + localY * cos;
    const spread = (Math.random() - 0.5) * 0.7;
    const speed = 85 + Math.random() * 95;
    const drift = (Math.random() - 0.5) * 34;
    const p = acquireParticle(
      x,
      y,
      Math.cos(backAngle + spread) * speed + Math.cos(sideAngle) * drift,
      Math.sin(backAngle + spread) * speed + Math.sin(sideAngle) * drift,
      0.26 + Math.random() * 0.18,
      2.2 + Math.random() * 2.8,
      Math.random() > 0.22 ? rgba(col.rgb, 0.82) : "rgba(255,243,182,0.88)"
    );
    p.drag = 0.965;
    state.particles.push(p);
  }
}

function updateStars(dt) {
  if (state.stars.length < tuning.starCount) {
    state.stars.push(makeStar());
  }

  for (const star of state.stars) {
    star.y += star.speed * star.depth * dt;
    if (star.y > ch + 20) {
      star.x = Math.random() * cw;
      star.y = -12;
    }
  }
}

function updateParticles(dt) {
  let alive = 0;
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life > 0) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag ?? 0.988;
      p.vy *= p.drag ?? 0.988;
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
    if (ring.life > 0) {
      state.rings[alive++] = ring;
    }
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

function getKeyboardMovement() {
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) dy += 1;

  return { dx, dy };
}

function hasActiveMovement() {
  const keyboard = getKeyboardMovement();
  return keyboard.dx !== 0 || keyboard.dy !== 0 || gestureMovement.dx !== 0 || gestureMovement.dy !== 0;
}

function movePlayer(dt) {
  const keyboard = getKeyboardMovement();
  const dx = keyboard.dx + gestureMovement.dx;
  const dy = keyboard.dy + gestureMovement.dy;
  const inputLength = Math.hypot(dx, dy);
  const maxSpeed = getTuningValue("playerSpeed", state.player.speed);
  const acceleration = getTuningValue("playerAcceleration", 16);
  const deceleration = getTuningValue("playerDeceleration", 22);
  const turnLerp = getTuningValue("playerTurnLerp", 18);
  const stopThreshold = getTuningValue("playerStopThreshold", 18);
  const previousAngle = state.player.angle;

  if (inputLength > 0) {
    const nx = dx / inputLength;
    const ny = dy / inputLength;
    const inputScale = Math.min(1, inputLength);
    const targetVx = nx * maxSpeed * inputScale;
    const targetVy = ny * maxSpeed * inputScale;
    const blend = 1 - Math.exp(-acceleration * dt);
    state.player.vx += (targetVx - state.player.vx) * blend;
    state.player.vy += (targetVy - state.player.vy) * blend;
    const targetAngle = Math.atan2(ny, nx) + Math.PI / 2;
    state.player.angle += shortestAngleDelta(state.player.angle, targetAngle) * (1 - Math.exp(-turnLerp * dt));
  } else {
    const blend = Math.exp(-deceleration * dt);
    state.player.vx *= blend;
    state.player.vy *= blend;
    if (Math.hypot(state.player.vx, state.player.vy) < stopThreshold) {
      state.player.vx = 0;
      state.player.vy = 0;
    }
  }

  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;

  const minX = state.player.radius;
  const maxX = state.world.width - state.player.radius;
  const minY = state.player.radius;
  const maxY = state.world.height - state.player.radius;
  if (state.player.x < minX) {
    state.player.x = minX;
    state.player.vx = Math.max(0, state.player.vx);
  } else if (state.player.x > maxX) {
    state.player.x = maxX;
    state.player.vx = Math.min(0, state.player.vx);
  }
  if (state.player.y < minY) {
    state.player.y = minY;
    state.player.vy = Math.max(0, state.player.vy);
  } else if (state.player.y > maxY) {
    state.player.y = maxY;
    state.player.vy = Math.min(0, state.player.vy);
  }

  const speedRatio = Math.min(1, Math.hypot(state.player.vx, state.player.vy) / maxSpeed);
  const thrustTarget = inputLength > 0 ? Math.max(0.35, speedRatio) : speedRatio * 0.25;
  state.player.thrust += (thrustTarget - state.player.thrust) * (1 - Math.exp(-12 * dt));
  const turnDelta = shortestAngleDelta(previousAngle, state.player.angle) / Math.max(dt, 0.001);
  const leanTarget = Math.max(-1, Math.min(1, turnDelta / 8));
  state.player.turnLean += (leanTarget - state.player.turnLean) * (1 - Math.exp(-10 * dt));
}

function moveAsteroids(dt) {
  let alive = 0;
  const padding = getTuningValue("asteroidCullPadding", 160);
  const elitePadding = getTuningValue("eliteCullPadding", 560);
  const vortexRegion = getCurrentRegion();
  const vortexMechanic = vortexRegion.mechanic && vortexRegion.mechanic.type === "vortex" ? vortexRegion.mechanic : null;
  for (const asteroid of state.asteroids) {
    if (asteroid.elite) {
      steerEliteAsteroid(asteroid, dt);
    }
    applyVortexForces(asteroid, vortexMechanic, dt);
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.rotation += asteroid.spin;
    asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 4);
    if (isCircleInCamera(asteroid, asteroid.elite ? elitePadding : padding)) {
      state.asteroids[alive++] = asteroid;
    }
  }
  state.asteroids.length = alive;
}

function applyVortexForces(asteroid, mechanic, dt) {
  if (!mechanic || !state.vortexCenters.length) return;
  const radius = mechanic.radius || 200;
  const strength = mechanic.strength || 140;
  for (const center of state.vortexCenters) {
    const dx = asteroid.x - center.x;
    const dy = asteroid.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius || dist < 0.001) continue;
    const falloff = 1 - dist / radius;
    const nx = dx / dist;
    const ny = dy / dist;
    const tx = -ny * center.spin;
    const ty = nx * center.spin;
    let rx = nx * falloff * strength;
    let ry = ny * falloff * strength;
    if (dist < radius * 0.35) {
      rx = -nx * falloff * strength * 0.8;
      ry = -ny * falloff * strength * 0.8;
    }
    asteroid.vx += (rx + tx * falloff * strength) * dt;
    asteroid.vy += (ry + ty * falloff * strength) * dt;
  }
}

function moveLasers(dt) {
  let alive = 0;
  const padding = getTuningValue("laserCullPadding", 120);
  for (const laser of state.lasers) {
    laser.x += laser.vx * dt;
    laser.y += laser.vy * dt;
    laser.life -= dt;
    if (laser.life > 0 && isCircleInCamera(laser, padding)) {
      state.lasers[alive++] = laser;
    }
  }
  state.lasers.length = alive;
}

function updateCores(dt) {
  for (const core of state.cores) {
    core.pulse += dt * 3;
  }
}

function updatePowerUps(dt) {
  for (const powerUp of state.powerUps) {
    powerUp.pulse += dt * 3.5;
  }
}

function spawnLaser(x, y, angle) {
  const speed = tuning.laserSpeed;
  state.lasers.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: tuning.laserLife
  });

  for (let i = 0; i < 5; i += 1) {
    state.particles.push(acquireParticle(
      x, y,
      Math.cos(angle) * (180 + Math.random() * 120) + (Math.random() - 0.5) * 70,
      Math.sin(angle) * (180 + Math.random() * 120) + (Math.random() - 0.5) * 70,
      0.12 + Math.random() * 0.12,
      1.6 + Math.random() * 2.2,
      Math.random() > 0.5 ? "#77ebff" : "#b7f4ff"
    ));
  }
}

function fireLaser() {
  if (!state.running || state.paused || state.gameOver || state.shootCooldown > 0) {
    return;
  }

  state.shootCooldown = tuning.shootCooldown;
  playSound("shoot");
  const angle = state.player.angle - Math.PI / 2;
  const offset = state.player.radius + tuning.laserSpawnOffset;
  const baseX = state.player.x + Math.cos(angle) * offset;
  const baseY = state.player.y + Math.sin(angle) * offset;
  const sideX = Math.cos(state.player.angle);
  const sideY = Math.sin(state.player.angle);

  if (state.doubleShotTimer > 0) {
    state.stats.shotsFired += 2;
    spawnLaser(baseX + sideX * tuning.doubleShotOffset, baseY + sideY * tuning.doubleShotOffset, angle);
    spawnLaser(baseX - sideX * tuning.doubleShotOffset, baseY - sideY * tuning.doubleShotOffset, angle);
    return;
  }

  state.stats.shotsFired += 1;
  spawnLaser(baseX, baseY, angle);
}

function handleCollisions() {
  handleRouteGateCollision();
  if (state.invulnerabilityTimer <= 0) {
    for (let i = state.asteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = state.asteroids[i];
      if (isWithinRadius(asteroid.x, asteroid.y, state.player.x, state.player.y, asteroid.radius + state.player.radius)) {
        spawnBurst(asteroid.x, asteroid.y, 20, ["#ff8ea1", "#ffc5cf", "#ffd7a1"]);
        spawnBurst(state.player.x, state.player.y, 16, ["#ff8ea1", "#ffd7a1", "#fff0d6"]);
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
          spawnBurst(state.player.x, state.player.y, 18, ["#8affd1", "#d4fff4", "#62e4ff"]);
          spawnShieldImpactEffect(state.player.x, state.player.y);
          spawnMessage(L("shieldMinus"), state.player.x, state.player.y - 34, "#8affd1");
          break;
        }

        state.health -= 1;
        state.stats.damagedThisRun = true;
        state.invulnerabilityTimer = tuning.hitInvulnerability;
        state.flashTimer = tuning.hitFlashDuration;
        triggerScreenShake(0.28, 18);
        spawnHullImpactEffect(state.player.x, state.player.y);
        spawnMessage(L("hullMinus"), state.player.x, state.player.y - 34, "#ff8ea1");
        playSound("hurt");
        evaluateAchievements();
        if (state.health <= 0) {
          endGame();
          return;
        }
        break;
      }
    }
  }

  for (let i = state.lasers.length - 1; i >= 0; i -= 1) {
    const laser = state.lasers[i];
    let hit = false;
    for (let j = state.asteroids.length - 1; j >= 0; j -= 1) {
      const asteroid = state.asteroids[j];
      const threshold = asteroid.radius + 7;
      if (Math.abs(asteroid.x - laser.x) > threshold || Math.abs(asteroid.y - laser.y) > threshold) continue;
      const isLargeAsteroid = asteroid.radius > tuning.largeAsteroidThreshold;
      if (isWithinRadius(asteroid.x, asteroid.y, laser.x, laser.y, threshold)) {
        hit = true;
        state.lasers.splice(i, 1);
        state.stats.shotsHit += 1;
        asteroid.hp -= 1;
        asteroid.hitFlash = 1;
        spawnBurst(laser.x, laser.y, isLargeAsteroid ? 10 : 8, ["#74ecff", "#d2fbff", "#8c9bb7"]);
        spawnImpactEffect(laser.x, laser.y, laser.angle, isLargeAsteroid);
        triggerScreenShake(0.08, isLargeAsteroid ? 6 : 4);

        if (asteroid.hp <= 0) {
          state.stats.destroyedAsteroids += 1;
          state.asteroids.splice(j, 1);

          if (asteroid.elite) {
            const eliteScore = Math.round(getTuningValue("scoreElite", 140));
            state.score += eliteScore;
            state.stats.destroyedElites += 1;
            spawnEliteFragments(asteroid, getCurrentRegion());
            spawnBurst(asteroid.x, asteroid.y, 42, ["#7fe8ff", "#dce7ff", "#ffd7a1", "#95a5bf"]);
            spawnExplosionEffect(asteroid.x, asteroid.y, asteroid.radius, true);
            spawnRing(asteroid.x, asteroid.y, asteroid.radius * 0.9, 300, rgba(asteroid.mineralTint, 0.85), 0.6, 4);
            spawnMessage(L("eliteBreak", eliteScore), asteroid.x, asteroid.y - asteroid.radius * 0.6, rgba(asteroid.mineralTint, 0.95));
            triggerScreenShake(0.36, 20);
          } else {
            state.score += tuning.scoreAsteroid;
            spawnBurst(asteroid.x, asteroid.y, isLargeAsteroid ? 28 : 20, ["#7fe8ff", "#dce7ff", "#95a5bf"]);
            spawnExplosionEffect(asteroid.x, asteroid.y, asteroid.radius, isLargeAsteroid);
            triggerScreenShake(isLargeAsteroid ? 0.18 : 0.12, isLargeAsteroid ? 12 : 7);
          }

          playSound("explode");
          evaluateAchievements();
        } else {
          playSound("hit");
        }
        break;
      }
    }
    if (hit) {
      continue;
    }
  }

  for (let i = state.cores.length - 1; i >= 0; i -= 1) {
    const core = state.cores[i];
    if (isWithinRadius(core.x, core.y, state.player.x, state.player.y, core.radius + state.player.radius + 4)) {
      state.cores.splice(i, 1);
      state.score += tuning.scoreCore;
      state.stats.collectedCores += 1;
      spawnBurst(core.x, core.y, 14, ["#8affd1", "#f3fffd", "#62e4ff"]);
      spawnCorePickupEffect(core.x, core.y);
      spawnMessage(L("corePlus"), core.x, core.y - 22, "#8affd1");
      playSound("pickup");
      evaluateAchievements();
    }
  }

  for (let i = state.powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = state.powerUps[i];
    if (isWithinRadius(powerUp.x, powerUp.y, state.player.x, state.player.y, powerUp.radius + state.player.radius + 4)) {
      state.powerUps.splice(i, 1);
      if (powerUp.type === "shield") {
        state.shieldCharges = 1;
        spawnBurst(powerUp.x, powerUp.y, 18, ["#8affd1", "#d9fffb", "#62e4ff"]);
        spawnShieldPickupEffect(state.player.x, state.player.y);
        spawnMessage(L("shieldReady"), powerUp.x, powerUp.y - 24, "#8affd1");
      } else {
        state.doubleShotTimer = tuning.doubleShotDuration;
        spawnBurst(powerUp.x, powerUp.y, 18, ["#ffd7a1", "#ffb59e", "#ff8ea1"]);
        spawnDoubleFirePickupEffect(state.player.x, state.player.y);
        spawnMessage(L("doubleFire"), powerUp.x, powerUp.y - 24, "#ffb59e");
      }
      triggerScreenShake(0.12, 8);
      playSound("pickup");
    }
  }
}

function spawnRing(x, y, radius, speed, color, life = getTuningValue("impactRingLife", 0.34), lineWidth = 2) {
  state.rings.push({ x, y, radius, speed, color, life, maxLife: life, lineWidth });
}

function spawnDirectionalBurst(x, y, angle, count, colors, speedBase, speedRange, spread = Math.PI * 0.7) {
  for (let i = 0; i < count; i += 1) {
    const particleAngle = angle + (Math.random() - 0.5) * spread;
    const speed = speedBase + Math.random() * speedRange;
    const p = acquireParticle(
      x,
      y,
      Math.cos(particleAngle) * speed,
      Math.sin(particleAngle) * speed,
      0.18 + Math.random() * 0.28,
      1.2 + Math.random() * 3.2,
      colors[Math.floor(Math.random() * colors.length)]
    );
    p.drag = 0.974;
    state.particles.push(p);
  }
}

function spawnImpactEffect(x, y, angle, isLarge) {
  spawnRing(x, y, isLarge ? 10 : 7, isLarge ? 130 : 110, "rgba(116,236,255,0.88)", 0.24, isLarge ? 2.4 : 1.8);
  spawnDirectionalBurst(x, y, angle, isLarge ? 12 : 8, ["#74ecff", "#d2fbff", "#8c9bb7"], 90, 210, Math.PI * 0.9);
}

function spawnExplosionEffect(x, y, radius, isLarge) {
  spawnRing(x, y, radius * 0.55, isLarge ? 220 : 170, "rgba(127,232,255,0.82)", isLarge ? 0.44 : 0.36, isLarge ? 3.2 : 2.4);
  spawnRing(x, y, radius * 0.25, isLarge ? 150 : 120, "rgba(255,215,161,0.62)", 0.28, 1.8);
  spawnBurst(x, y, isLarge ? 24 : 16, ["#7fe8ff", "#dce7ff", "#ffd7a1", "#95a5bf"]);
}

function spawnShieldImpactEffect(x, y) {
  spawnRing(x, y, state.player.radius + 8, 170, "rgba(138,255,209,0.9)", 0.34, 3.2);
  spawnRing(x, y, state.player.radius + 18, 110, "rgba(98,228,255,0.62)", 0.42, 2.2);
}

function spawnHullImpactEffect(x, y) {
  spawnRing(x, y, state.player.radius + 4, 150, "rgba(255,111,135,0.86)", 0.34, 3);
  spawnDirectionalBurst(x, y, -Math.PI / 2, 18, ["#ff8ea1", "#ffd7a1", "#fff0d6"], 70, 190, Math.PI * 2);
}

function spawnCorePickupEffect(x, y) {
  spawnRing(x, y, 10, 120, "rgba(138,255,209,0.82)", 0.32, 2.2);
  spawnDirectionalBurst(x, y, -Math.PI / 2, 16, ["#8affd1", "#f3fffd", "#62e4ff"], 50, 150, Math.PI * 2);
}

function spawnShieldPickupEffect(x, y) {
  spawnRing(x, y, state.player.radius + 4, 190, "rgba(138,255,209,0.92)", 0.46, 3.4);
  spawnRing(x, y, state.player.radius + 20, 90, "rgba(212,255,244,0.72)", 0.56, 2.2);
  spawnDirectionalBurst(x, y, -Math.PI / 2, 18, ["#8affd1", "#d9fffb", "#62e4ff"], 70, 170, Math.PI * 2);
}

function spawnDoubleFirePickupEffect(x, y) {
  spawnRing(x, y, state.player.radius + 6, 170, "rgba(255,181,158,0.86)", 0.42, 2.8);
  const angle = state.player.angle - Math.PI / 2;
  spawnDirectionalBurst(x - Math.cos(state.player.angle) * 12, y - Math.sin(state.player.angle) * 12, angle, 12, ["#ffd7a1", "#ffb59e", "#ff8ea1"], 100, 190, Math.PI * 0.65);
  spawnDirectionalBurst(x + Math.cos(state.player.angle) * 12, y + Math.sin(state.player.angle) * 12, angle, 12, ["#ffd7a1", "#ffb59e", "#ff8ea1"], 100, 190, Math.PI * 0.65);
}

function spawnBurst(x, y, count, colors) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 220;
    state.particles.push(acquireParticle(
      x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.22 + Math.random() * 0.45,
      1.4 + Math.random() * 3.8,
      colors[Math.floor(Math.random() * colors.length)]
    ));
  }
}

function spawnMessage(text, x, y, color = "#f2f7ff", life = 0.9) {
  state.messages.push({
    text,
    x,
    y,
    vy: -36,
    color,
    life
  });
}

function getRunAccuracy() {
  if (state.stats.shotsFired < 10) {
    return 0;
  }
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
    if (profile.unlocked[achievement.id]) {
      continue;
    }
    const getter = metricGetters[achievement.metric];
    if (!getter || getter() < achievement.threshold) {
      continue;
    }
    profile.unlocked[achievement.id] = Date.now();
    runAchievementUnlocks.push(achievement.id);
    unlocked = true;
    if (!silent) {
      spawnMessage(
        `${profileUi[state.lang].achievementPrefix}${achLabel(achievement)}`,
        state.player.x,
        state.player.y - 48,
        profileUi.achievementColor,
        profileUi.toastLife
      );
    }
  }
  if (unlocked) {
    saveProfile();
  }
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

  if (state.stats.newBest) {
    bestScore = finalScore;
    writeBestScore(finalScore);
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

function drawVortexCenters() {
  if (!state.vortexCenters.length) return;
  const region = getCurrentRegion();
  const mechanic = region.mechanic;
  if (!mechanic || mechanic.type !== "vortex") return;
  const radius = mechanic.radius || 200;
  for (const center of state.vortexCenters) {
    const t = state.regionTimer * 0.8 + center.phase;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(t * center.spin);
    ctx.strokeStyle = rgba(region.secondaryTint, 0.5);
    ctx.lineWidth = 1.5;
    for (let ring = 0; ring < 3; ring += 1) {
      const r = radius * (0.3 + ring * 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(region.tint, 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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

  drawBackground(region);
  drawStars();
  drawRings(region);

  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);
  drawRouteChoice();
  drawVortexCenters();
  drawCores();
  drawPowerUps();
  drawParticles();
  drawEffectRings();
  drawMessages();
  drawLasers();
  drawAsteroids();
  drawPlayer();
  ctx.restore();

  drawAsteroidWarnings();
  drawRouteChoiceOverlay();
  drawHudOverlay(region);
  drawVignette();
  ctx.restore();
}

function getBackgroundGradient() {
  if (backgroundGradient && backgroundGradientWidth === cw && backgroundGradientHeight === ch) {
    return backgroundGradient;
  }

  backgroundGradient = ctx.createLinearGradient(0, 0, 0, ch);
  backgroundGradient.addColorStop(0, "#08111f");
  backgroundGradient.addColorStop(0.45, "#07101d");
  backgroundGradient.addColorStop(1, "#030814");
  backgroundGradientWidth = cw;
  backgroundGradientHeight = ch;
  return backgroundGradient;
}

function getRegionVisualBoosts(region) {
  const mechanic = region && region.mechanic;
  if (mechanic && mechanic.type === "nebula") {
    return { hazeBoost: mechanic.hazeBoost || 0, vignetteBoost: mechanic.vignetteBoost || 0 };
  }
  return { hazeBoost: 0, vignetteBoost: 0 };
}

function drawBackground(region) {
  ctx.fillStyle = getBackgroundGradient();
  ctx.fillRect(0, 0, cw, ch);

  const drift = state.regionTimer * 18;
  const haze = getTuningValue("visualHazeStrength", 0.14) + getRegionVisualBoosts(region).hazeBoost;
  const playerDx = (state.player.x - (state.camera.x + cw / 2)) * 0.025;
  const playerDy = (state.player.y - (state.camera.y + ch / 2)) * 0.018;
  const glowA = ctx.createRadialGradient(180 + Math.sin(state.pulseTime * 0.35) * 34 - playerDx, 120 + drift % 180 - playerDy, 40, 180, 120, 340);
  glowA.addColorStop(0, rgba(region.tint, 0.2 + haze * 0.16));
  glowA.addColorStop(1, rgba(region.tint, 0));
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, cw, ch);

  const glowB = ctx.createRadialGradient(cw - 140 + playerDx, ch - 90 - drift % 150 + playerDy, 50, cw - 140, ch - 90, 320);
  glowB.addColorStop(0, rgba(region.secondaryTint, 0.16 + haze * 0.12));
  glowB.addColorStop(1, rgba(region.secondaryTint, 0));
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, cw, ch);

  const centerHaze = ctx.createRadialGradient(cw / 2, ch * 0.42, 20, cw / 2, ch * 0.52, Math.max(cw, ch) * 0.55);
  centerHaze.addColorStop(0, rgba(region.secondaryTint, haze * 0.16));
  centerHaze.addColorStop(0.45, rgba(region.tint, haze * 0.08));
  centerHaze.addColorStop(1, rgba(region.tint, 0));
  ctx.fillStyle = centerHaze;
  ctx.fillRect(0, 0, cw, ch);
}

function drawStars() {
  const trailStrength = getTuningValue("visualStarTrail", 0.72);
  for (const star of state.stars) {
    const depth = star.depth || 1;
    const radius = star.radius * (0.82 + depth * 0.28);
    const alpha = Math.min(0.9, star.alpha * (0.72 + depth * 0.34));
    const trail = Math.max(0, star.speed * 0.035 * depth * trailStrength);
    if (trail > 1.2) {
      const gradient = ctx.createLinearGradient(star.x, star.y - trail, star.x, star.y + radius);
      gradient.addColorStop(0, "rgba(220,236,255,0)");
      gradient.addColorStop(1, `rgba(220,236,255,${alpha * 0.42})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(0.5, radius * 0.72);
      ctx.beginPath();
      ctx.moveTo(star.x, star.y - trail);
      ctx.lineTo(star.x, star.y + radius);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#dcecff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRings(region) {
  const pulse = Math.sin(state.pulseTime * 0.8) * 0.5 + 0.5;
  const depth = getTuningValue("visualRingDepth", 0.5);
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(state.regionTimer * 0.018);
  for (let i = 0; i < 4; i += 1) {
    const layer = i / 3;
    const alpha = 0.05 + pulse * 0.035 + layer * depth * 0.035;
    ctx.strokeStyle = rgba(i % 2 ? region.secondaryTint : region.tint, alpha);
    ctx.lineWidth = 0.8 + layer * 0.7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 160 + i * 90, 92 + i * 50, 0.16 + layer * 0.04, Math.PI * 0.08, Math.PI * 1.08);
    ctx.stroke();
    ctx.strokeStyle = rgba(region.tint, alpha * 0.42);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 160 + i * 90, 92 + i * 50, 0.16 + layer * 0.04, Math.PI * 1.08, Math.PI * 2.08);
    ctx.stroke();
  }
  ctx.restore();
}

function trimCanvasText(text, maxWidth) {
  const chars = Array.from(text);
  while (chars.length && ctx.measureText(`${chars.join("")}...`).width > maxWidth) {
    chars.pop();
  }
  return chars.length ? `${chars.join("")}...` : "";
}

function wrapCanvasText(text, maxWidth, maxLines = 2) {
  const lines = [];
  let line = "";

  for (const char of Array.from(text)) {
    const nextLine = line + char;
    if (!line || ctx.measureText(nextLine).width <= maxWidth) {
      line = nextLine;
      continue;
    }

    lines.push(line);
    line = char;
    if (lines.length === maxLines) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  if (lines.length === maxLines && ctx.measureText(lines[lines.length - 1]).width > maxWidth) {
    lines[lines.length - 1] = trimCanvasText(lines[lines.length - 1], maxWidth);
  }

  return lines;
}

function drawWrappedTextLines(lines, x, y, lineHeight) {
  lines.forEach((lineText, index) => {
    ctx.fillText(lineText, x, y + index * lineHeight);
  });
}

function drawRouteChoice() {
  if (!state.routeChoice.active) {
    return;
  }

  const pulse = Math.sin(state.pulseTime * 7) * 0.5 + 0.5;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const gate of state.routeChoice.gates) {
    const gateX = Number.isFinite(gate.x) ? gate.x : cw / 2;
    const gateY = Number.isFinite(gate.y) ? gate.y : ch / 2;
    const gateRadius = Number.isFinite(gate.radius) ? gate.radius : tuning.routeGateRadius;
    const gateAge = Number.isFinite(gate.age) ? gate.age : 0;
    const appearDuration = getTuningValue("routeGateAppearDuration", 0.7);
    const appear = Math.min(1, gateAge / appearDuration);
    const ease = 1 - Math.pow(1 - appear, 3);
    const radius = Math.max(1, (gateRadius + pulse * 5) * (0.58 + ease * 0.42));
    const alpha = 0.28 + ease * 0.72;
    const rippleRadius = Math.max(1, gateRadius * (0.8 + appear * 1.75 + pulse * 0.15));
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(gateX, gateY, 4, gateX, gateY, radius * 1.9);
    glow.addColorStop(0, rgba(gate.tint, 0.34));
    glow.addColorStop(0.48, rgba(gate.tint, 0.18));
    glow.addColorStop(1, rgba(gate.tint, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gateX, gateY, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 24;
    ctx.shadowColor = rgba(gate.tint, 0.9);
    ctx.strokeStyle = rgba(gate.tint, 0.88);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gateX, gateY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(gateX, gateY, radius * 0.66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = (1 - appear) * 0.75;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(gate.secondaryTint, 0.7);
    ctx.beginPath();
    ctx.arc(gateX, gateY, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;

    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(238,248,255,0.96)";
    ctx.font = '700 13px "Segoe UI", sans-serif';
    ctx.fillText(regionDisplayName(gate), gateX, gateY - 6);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(regionDisplayName(gate), gateX, gateY + 12);
    ctx.fillStyle = rgba(gate.tint, 0.9);
    drawWrappedTextLines(gate.descriptionLines, gateX, gateY + radius + 24, 14);
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRouteChoiceOverlay() {
  if (!state.routeChoice.active) {
    return;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(230,242,255,0.92)";
  ctx.font = '700 15px "Segoe UI", sans-serif';
  ctx.fillText(L("warpWindow", Math.ceil(state.routeChoice.timer)), cw / 2, Math.max(38, ch * 0.16));
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText(L("chooseGateHint"), cw / 2, Math.max(60, ch * 0.16 + 22));
  ctx.restore();
}

function drawAsteroidWarnings() {
  ctx.save();
  const warningDistance = getTuningValue("asteroidWarningDistance", 96);
  const visible = getCameraRect(0);
  const nearby = getCameraRect(warningDistance);
  for (const asteroid of state.asteroids) {
    const screenX = asteroid.x - state.camera.x;
    const screenY = asteroid.y - state.camera.y;
    const isInside =
      asteroid.x >= visible.left &&
      asteroid.x <= visible.right &&
      asteroid.y >= visible.top &&
      asteroid.y <= visible.bottom;

    if (isInside) {
      continue;
    }

    const isNearby =
      asteroid.x >= nearby.left &&
      asteroid.x <= nearby.right &&
      asteroid.y >= nearby.top &&
      asteroid.y <= nearby.bottom;

    if (!isNearby) {
      continue;
    }

    const x = clamp(screenX, 28, cw - 28);
    const y = clamp(screenY, 28, ch - 28);
    const angle = Math.atan2(ch / 2 - y, cw / 2 - x);
    const scale = asteroid.elite ? 1.45 : 1;
    const tint = asteroid.elite ? asteroid.mineralTint || "255,111,135" : "255,111,135";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.shadowBlur = asteroid.elite ? 24 : 16;
    ctx.shadowColor = rgba(tint, 1);
    ctx.fillStyle = rgba(tint, 0.88);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    if (asteroid.elite) {
      ctx.strokeStyle = "rgba(246,252,255,0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

const SKINS = {
  default: {
    drawHull(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r - 20);
      ctx.lineTo(r * 0.82, r * 0.5);
      ctx.lineTo(r * 0.44, r * 0.34);
      ctx.lineTo(r * 0.3, r + 5);
      ctx.lineTo(0, r * 0.6);
      ctx.lineTo(-r * 0.3, r + 5);
      ctx.lineTo(-r * 0.44, r * 0.34);
      ctx.lineTo(-r * 0.82, r * 0.5);
      ctx.closePath();
    },
    drawWings(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.98, r * 0.52);
      ctx.lineTo(-r * 0.38, r * 0.16);
      ctx.lineTo(-r * 0.2, r * 0.64);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.98, r * 0.52);
      ctx.lineTo(r * 0.38, r * 0.16);
      ctx.lineTo(r * 0.2, r * 0.64);
      ctx.closePath();
      ctx.fill();
    },
    hullTop: r => -r - 20,
    engines: [{ x: -0.32, y: 0.55 }, { x: 0.32, y: 0.55 }],
    nozzles: [{ x: -0.5, y: -0.18, w: 0.2, h: 0.46 }, { x: 0.3, y: -0.18, w: 0.2, h: 0.46 }]
  },
  delta: {
    drawHull(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r - 8);
      ctx.lineTo(r * 1.4, r * 0.7);
      ctx.lineTo(r * 0.5, r * 0.5);
      ctx.lineTo(r * 0.28, r + 4);
      ctx.lineTo(0, r * 0.75);
      ctx.lineTo(-r * 0.28, r + 4);
      ctx.lineTo(-r * 0.5, r * 0.5);
      ctx.lineTo(-r * 1.4, r * 0.7);
      ctx.closePath();
    },
    drawWings(ctx, r) {},
    hullTop: r => -r - 8,
    engines: [{ x: -0.28, y: 0.6 }, { x: 0.28, y: 0.6 }],
    nozzles: [{ x: -0.44, y: -0.1, w: 0.18, h: 0.38 }, { x: 0.26, y: -0.1, w: 0.18, h: 0.38 }]
  },
  saucer: {
    drawHull(ctx, r) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.55, 0, 0, Math.PI * 2);
    },
    drawWings(ctx, r) {
      ctx.strokeStyle = "rgba(200,240,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.1, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    hullTop: r => -r * 0.55,
    engines: [{ x: -0.55, y: 0.2 }, { x: 0.55, y: 0.2 }],
    nozzles: [{ x: -0.7, y: 0.05, w: 0.18, h: 0.28 }, { x: 0.52, y: 0.05, w: 0.18, h: 0.28 }]
  }
};

function drawSoftShadow(x, y, radius, alpha = getTuningValue("visualShadowAlpha", 0.22), scaleX = 1.35, scaleY = 0.42) {
  const offset = getTuningValue("visualShadowOffset", 8) * getGameplayScale();
  ctx.save();
  ctx.translate(x, y + offset);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * scaleX);
  shadow.addColorStop(0, `rgba(0, 6, 18, ${alpha})`);
  shadow.addColorStop(0.62, `rgba(0, 10, 24, ${alpha * 0.34})`);
  shadow.addColorStop(1, "rgba(0, 10, 24, 0)");
  ctx.scale(scaleX, scaleY);
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const { x, y, radius, angle } = state.player;
  const pulse = Math.sin(state.pulseTime * 5) * 0.5 + 0.5;
  const fastPulse = Math.sin(state.pulseTime * 18) * 0.5 + 0.5;
  const invulnerable = state.invulnerabilityTimer > 0;
  const flicker = invulnerable && Math.floor(state.invulnerabilityTimer * 18) % 2 === 0;
  const thrust = Math.max(state.player.thrust || 0, state.running && !state.paused && hasActiveMovement() ? 0.3 : 0);
  const lean = state.player.turnLean || 0;
  const skin = SKINS[activeSkin];
  const col = COLORS[activeColor];

  drawSoftShadow(x, y, radius, 0.18 + thrust * 0.05, 1.3 + Math.abs(lean) * 0.08, 0.36);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1 + Math.abs(lean) * 0.04, 1 - Math.abs(lean) * 0.03);
  ctx.transform(1, 0, lean * 0.08, 1, 0, 0);
  ctx.globalAlpha = flicker ? 0.7 : 1;

  for (const engine of skin.engines) {
    const engX = engine.x * radius;
    const engY = engine.y * radius;
    const glowRadius = radius * (0.34 + thrust * 0.28);
    const eg = ctx.createRadialGradient(engX, engY, 0, engX, engY, glowRadius);
    eg.addColorStop(0, rgba(col.rgb, 0.45 + pulse * 0.2 + thrust * 0.38));
    eg.addColorStop(0.58, rgba(col.rgb, 0.16 + thrust * 0.16));
    eg.addColorStop(1, rgba(col.rgb, 0));
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(engX, engY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (thrust > 0.04) {
    for (const engine of skin.engines) {
      const engX = engine.x * radius;
      const engY = engine.y * radius;
      const flame = 10 + thrust * 24 + fastPulse * (5 + thrust * 9);
      const width = 4 + thrust * 4;
      const fg = ctx.createLinearGradient(engX, engY, engX, engY + flame);
      fg.addColorStop(0, "rgba(255,252,214,0.98)");
      fg.addColorStop(0.28, rgba(col.rgb, 0.92));
      fg.addColorStop(0.68, rgba(col.rgb, 0.44));
      fg.addColorStop(1, rgba(col.rgb, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(engX - width, engY);
      ctx.quadraticCurveTo(engX - lean * radius * 0.16, engY + flame, engX + width, engY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(engX - width * 0.38, engY + 1);
      ctx.quadraticCurveTo(engX, engY + flame * 0.48, engX + width * 0.38, engY + 1);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.shadowBlur = state.flashTimer > 0 ? 46 : invulnerable ? 38 : 30 + thrust * 12;
  ctx.shadowColor = state.flashTimer > 0 ? "#ff6f87" : invulnerable ? "#9ff3ff" : col.glow;

  ctx.strokeStyle = invulnerable
    ? `rgba(214,249,255,${0.6 + pulse * 0.25})`
    : rgba(col.rgb, 0.6 + pulse * 0.18 + thrust * 0.12);
  ctx.lineWidth = 2.2 + thrust * 0.7;
  skin.drawHull(ctx, radius);
  ctx.stroke();

  const top = skin.hullTop(radius);
  const hullGradient = ctx.createLinearGradient(-radius * 0.32, top, radius * 0.28, radius + 6);
  hullGradient.addColorStop(0, "#ffffff");
  hullGradient.addColorStop(0.16, col.hi);
  hullGradient.addColorStop(0.52, col.mid);
  hullGradient.addColorStop(1, "#071329");
  ctx.fillStyle = hullGradient;
  skin.drawHull(ctx, radius);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "screen";
  const edgeGradient = ctx.createLinearGradient(0, top, 0, radius * 0.72);
  edgeGradient.addColorStop(0, "rgba(255,255,255,0.62)");
  edgeGradient.addColorStop(0.4, rgba(col.rgb, 0.24 + thrust * 0.18));
  edgeGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = edgeGradient;
  ctx.lineWidth = 1.2;
  skin.drawHull(ctx, radius * 0.92);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  if (activeSkin !== "saucer") {
    // cockpit
    const cockpitG = ctx.createRadialGradient(0, -radius * 0.5, 1, 0, -radius * 0.4, radius * 0.52);
    cockpitG.addColorStop(0, "rgba(200,248,255,0.95)");
    cockpitG.addColorStop(0.5, "rgba(60,160,255,0.7)");
    cockpitG.addColorStop(1, "rgba(8,16,31,0.92)");
    ctx.fillStyle = cockpitG;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.98);
    ctx.bezierCurveTo(radius * 0.3, -radius * 0.22, radius * 0.26, radius * 0.06, 0, radius * 0.26);
    ctx.bezierCurveTo(-radius * 0.26, radius * 0.06, -radius * 0.3, -radius * 0.22, 0, -radius * 0.98);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.08, -radius * 0.72, radius * 0.08, radius * 0.18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // panel lines
    ctx.strokeStyle = "rgba(233,249,255,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, top + 4);
    ctx.lineTo(0, radius * 0.52);
    ctx.moveTo(-radius * 0.54, radius * 0.1);
    ctx.lineTo(radius * 0.54, radius * 0.1);
    ctx.stroke();
  } else {
    // saucer dome
    const domeG = ctx.createRadialGradient(0, -radius * 0.15, 1, 0, 0, radius * 0.5);
    domeG.addColorStop(0, "rgba(200,248,255,0.9)");
    domeG.addColorStop(0.5, "rgba(60,160,255,0.6)");
    domeG.addColorStop(1, "rgba(8,16,31,0.85)");
    ctx.fillStyle = domeG;
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.05, radius * 0.42, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // wings
  ctx.fillStyle = col.hi;
  ctx.shadowBlur = 8;
  ctx.shadowColor = col.glow;
  skin.drawWings(ctx, radius);

  // engine nozzles
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(col.rgb, 0.95);
  for (const n of skin.nozzles) {
    ctx.fillRect(n.x * radius, n.y * radius, n.w * radius, n.h * radius);
  }

  ctx.shadowBlur = 12 + thrust * 10;
  ctx.shadowColor = col.glow;
  ctx.strokeStyle = rgba(col.rgb, 0.78 + thrust * 0.18);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.34, -radius * 0.2);
  ctx.lineTo(-radius * 0.58, radius * 0.42);
  ctx.moveTo(radius * 0.34, -radius * 0.2);
  ctx.lineTo(radius * 0.58, radius * 0.42);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.42 + thrust * 0.28})`;
  ctx.beginPath();
  ctx.arc(0, top + radius * 0.26, radius * (0.06 + thrust * 0.03), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (state.shieldCharges > 0) {
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#8affd1";
    ctx.strokeStyle = `rgba(138,255,209,${0.45 + pulse * 0.3})`;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 20 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 12 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (invulnerable) {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = `rgba(127,241,255,${0.35 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 15 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAsteroids() {
  for (const asteroid of state.asteroids) {
    const hit = asteroid.hitFlash > 0;
    const isLarge = asteroid.radius > tuning.largeAsteroidThreshold;
    const tone = asteroid.surfaceTone || 1;
    const mineralTint = asteroid.mineralTint || "160,180,220";
    drawSoftShadow(asteroid.x, asteroid.y, asteroid.radius, isLarge ? 0.22 : 0.16, 1.24, 0.36);

    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rotation);

    ctx.shadowBlur = hit ? 34 : isLarge ? 24 : 15;
    ctx.shadowColor = hit ? "#74ecff" : isLarge ? `rgba(${mineralTint},0.42)` : "rgba(60,80,130,0.5)";

    const rock = ctx.createRadialGradient(
      -asteroid.radius * 0.38, -asteroid.radius * 0.36, 2,
      asteroid.radius * 0.14, asteroid.radius * 0.16, asteroid.radius * 1.14
    );
    rock.addColorStop(0, hit ? "#f4fbff" : `rgb(${Math.round(204 * tone)},${Math.round(214 * tone)},${Math.round(232 * tone)})`);
    rock.addColorStop(0.24, hit ? "#8ad8ff" : isLarge ? "#7d8aa0" : "#68778f");
    rock.addColorStop(0.6, "#343d4d");
    rock.addColorStop(1, "#111826");
    ctx.fillStyle = rock;
    ctx.strokeStyle = hit ? "rgba(111,232,255,0.95)" : isLarge ? `rgba(${mineralTint},0.42)` : "rgba(150,170,210,0.24)";
    ctx.lineWidth = hit ? 2.3 : 1.5;

    ctx.beginPath();
    asteroid.points.forEach((point, index) => {
      const px = Math.cos(point.angle) * point.distance;
      const py = Math.sin(point.angle) * point.distance;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const lowerShade = ctx.createLinearGradient(0, -asteroid.radius * 0.5, 0, asteroid.radius);
    lowerShade.addColorStop(0, "rgba(255,255,255,0.08)");
    lowerShade.addColorStop(0.45, "rgba(255,255,255,0)");
    lowerShade.addColorStop(1, "rgba(2,7,18,0.38)");
    ctx.fillStyle = lowerShade;
    ctx.beginPath();
    asteroid.points.forEach((point, index) => {
      const px = Math.cos(point.angle) * point.distance * 0.96;
      const py = Math.sin(point.angle) * point.distance * 0.96;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(225,238,255,${isLarge ? 0.24 : 0.16})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    asteroid.points.forEach((point, index) => {
      const rimBoost = Math.max(0.82, Math.cos(point.angle - (asteroid.rimAngle || -2.2)) * 0.12 + 0.9);
      const px = Math.cos(point.angle) * point.distance * rimBoost;
      const py = Math.sin(point.angle) * point.distance * rimBoost;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    for (const crater of asteroid.craters) {
      const cg = ctx.createRadialGradient(
        crater.x - crater.r * 0.38, crater.y - crater.r * 0.38, 1,
        crater.x, crater.y, crater.r
      );
      cg.addColorStop(0, `rgba(8,13,24,${0.92 * (crater.shade || 1)})`);
      cg.addColorStop(0.62, "rgba(48,58,76,0.58)");
      cg.addColorStop(1, "rgba(150,170,205,0.2)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(crater.x, crater.y, crater.r * 1.08, crater.r * 0.82, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(210,225,255,0.16)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.lineCap = "round";
    for (const crack of asteroid.cracks) {
      const sx = Math.cos(crack.angle) * crack.length * -0.16;
      const sy = Math.sin(crack.angle) * crack.length * -0.16;
      const ex = Math.cos(crack.angle) * crack.length;
      const ey = Math.sin(crack.angle) * crack.length;
      ctx.strokeStyle = hit ? "rgba(111,232,255,0.9)" : `rgba(${mineralTint},${0.26 + (asteroid.glints?.length ? 0.1 : 0)})`;
      ctx.lineWidth = crack.width || 1.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (Math.abs(crack.branch || 0) > 0.12) {
        ctx.strokeStyle = hit ? "rgba(210,250,255,0.65)" : "rgba(25,34,54,0.58)";
        ctx.lineWidth = Math.max(0.7, (crack.width || 1.1) * 0.7);
        ctx.beginPath();
        ctx.moveTo(ex * 0.42, ey * 0.42);
        ctx.lineTo(ex * 0.72 + Math.cos(crack.angle + crack.branch) * crack.length * 0.28, ey * 0.72 + Math.sin(crack.angle + crack.branch) * crack.length * 0.28);
        ctx.stroke();
      }
    }

    if (asteroid.glints?.length) {
      ctx.shadowBlur = hit ? 16 : 8;
      ctx.shadowColor = `rgba(${mineralTint},0.8)`;
      for (const glint of asteroid.glints) {
        ctx.fillStyle = `rgba(${mineralTint},${hit ? 0.75 : glint.alpha})`;
        ctx.beginPath();
        ctx.moveTo(glint.x, glint.y - glint.size * 2.2);
        ctx.lineTo(glint.x + glint.size, glint.y);
        ctx.lineTo(glint.x, glint.y + glint.size * 2.2);
        ctx.lineTo(glint.x - glint.size, glint.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();

    if (asteroid.elite) {
      drawEliteMarkings(asteroid);
    }
  }
}

function drawEliteMarkings(elite) {
  const tint = elite.mineralTint || "160,180,220";
  const pulse = 0.62 + Math.sin(state.pulseTime * 3.2 + (elite.pulseSeed || 0)) * 0.38;
  const ratio = clamp(elite.hp / Math.max(1, elite.maxHp || 1), 0, 1);
  const ringRadius = elite.radius + 14;

  ctx.save();
  ctx.translate(elite.x, elite.y);

  ctx.save();
  ctx.rotate(elite.rotation * 0.45);
  ctx.shadowBlur = 18;
  ctx.shadowColor = rgba(tint, 0.55);
  ctx.strokeStyle = rgba(tint, 0.34 + pulse * 0.3);
  ctx.lineWidth = 2.4;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(6,12,24,0.55)";
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.arc(0, 0, ringRadius + 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ratio > 0.35 ? rgba(tint, 0.95) : "rgba(255,111,135,0.95)";
  ctx.lineWidth = 4.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, ringRadius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  ctx.stroke();

  ctx.restore();
}

function drawCores() {
  for (const core of state.cores) {
    const radius = core.radius + Math.sin(core.pulse) * 2;
    drawSoftShadow(core.x, core.y, radius, 0.12, 1.08, 0.3);
    ctx.save();
    ctx.shadowBlur = 26;
    ctx.shadowColor = "#8affd1";

    const glow = ctx.createRadialGradient(core.x, core.y, 2, core.x, core.y, radius + 12);
    glow.addColorStop(0, "#f3fffd");
    glow.addColorStop(0.38, "#8affd1");
    glow.addColorStop(1, "rgba(138, 255, 209, 0.06)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(core.x, core.y, radius + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(237, 255, 250, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(core.x, core.y, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPowerUps() {
  for (const powerUp of state.powerUps) {
    const radius = powerUp.radius + Math.sin(powerUp.pulse) * 2;
    const isShield = powerUp.type === "shield";
    const glowColor = isShield ? "#8affd1" : "#ffb59e";
    const coreColor = isShield ? "#f3fffd" : "#fff0d6";

    drawSoftShadow(powerUp.x, powerUp.y, radius, 0.12, 1.08, 0.3);
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = glowColor;

    const glow = ctx.createRadialGradient(powerUp.x, powerUp.y, 2, powerUp.x, powerUp.y, radius + 14);
    glow.addColorStop(0, coreColor);
    glow.addColorStop(0.42, glowColor);
    glow.addColorStop(1, isShield ? "rgba(138,255,209,0.05)" : "rgba(255,181,158,0.05)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(powerUp.x, powerUp.y, radius + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isShield ? "rgba(230,255,248,0.9)" : "rgba(255,231,214,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(powerUp.x, powerUp.y, radius + 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.translate(powerUp.x, powerUp.y);
    ctx.strokeStyle = isShield ? "rgba(138,255,209,0.95)" : "rgba(255,181,158,0.95)";
    ctx.lineWidth = 2;

    if (isShield) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.76, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * 0.46, -radius * 0.08);
      ctx.lineTo(-radius * 0.1, radius * 0.42);
      ctx.lineTo(radius * 0.32, -radius * 0.1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.46, radius * 0.3);
      ctx.lineTo(-radius * 0.1, -radius * 0.3);
      ctx.lineTo(radius * 0.12, radius * 0.02);
      ctx.lineTo(radius * 0.44, -radius * 0.44);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = Math.max(0, particle.life / 0.6);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEffectRings() {
  ctx.save();
  for (const ring of state.rings) {
    const alpha = Math.max(0, ring.life / ring.maxLife);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.lineWidth;
    ctx.shadowBlur = 18 * alpha;
    ctx.shadowColor = ring.color;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMessages() {
  ctx.save();
  ctx.font = '700 13px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const message of state.messages) {
    ctx.globalAlpha = Math.min(1, message.life / 0.35);
    ctx.shadowBlur = 10;
    ctx.shadowColor = message.color;
    ctx.fillStyle = message.color;
    ctx.fillText(message.text, message.x, message.y);
  }
  ctx.restore();
}

function drawLasers() {
  const trailScale = getTuningValue("visualLaserTrail", 0.58);
  for (const laser of state.lasers) {
    ctx.save();
    ctx.translate(laser.x, laser.y);
    ctx.rotate(laser.angle);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#77ebff";
    const trailLength = 28 + 30 * trailScale;
    const trail = ctx.createLinearGradient(-trailLength, 0, 18, 0);
    trail.addColorStop(0, "rgba(119, 235, 255, 0)");
    trail.addColorStop(0.46, "rgba(119, 235, 255, 0.22)");
    trail.addColorStop(1, "rgba(216, 251, 255, 0.9)");
    ctx.fillStyle = trail;
    ctx.fillRect(-trailLength, -1.3, trailLength + 18, 2.6);

    const beam = ctx.createLinearGradient(-18, 0, 18, 0);
    beam.addColorStop(0, "rgba(119, 235, 255, 0)");
    beam.addColorStop(0.45, "#d8fbff");
    beam.addColorStop(1, "rgba(119, 235, 255, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(-18, -2, 36, 4);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(17, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawMinimap(region) {
  const size = getTuningValue("minimapSize", 150);
  const margin = getTuningValue("minimapMargin", 14);
  const mobileClearance = getTuningValue("minimapMobileClearance", 140);
  const worldW = Math.max(1, state.world.width);
  const worldH = Math.max(1, state.world.height);
  const mobile = mobileViewportQuery.matches;
  const left = margin;
  const top = mobile ? (ch - mobileClearance - size) : (ch - margin - size);

  ctx.save();

  ctx.fillStyle = "rgba(8,16,28,0.42)";
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = rgba(region.tint, 0.14);
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);

  const toX = (wx) => left + (wx / worldW) * size;
  const toY = (wy) => top + (wy / worldH) * size;

  ctx.strokeStyle = rgba(region.tint, 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(toX(state.camera.x), toY(state.camera.y), (cw / worldW) * size, (ch / worldH) * size);

  for (const a of state.asteroids) {
    ctx.fillStyle = a.elite ? "rgba(255,120,140,0.95)" : "rgba(200,214,240,0.5)";
    ctx.beginPath();
    ctx.arc(toX(a.x), toY(a.y), a.elite ? 2.2 : 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(138,255,209,0.85)";
  for (const p of state.powerUps) {
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.y), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.routeChoice.active) {
    for (const g of state.routeChoice.gates) {
      const gx = toX(g.x);
      const gy = toY(g.y);
      ctx.fillStyle = rgba(g.tint, 0.95);
      ctx.beginPath();
      ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(g.tint, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#0b1320";
      ctx.font = '7px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((state.lang === "en" ? g.label : g.name || g.label).charAt(0), gx, gy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(toX(state.player.x), toY(state.player.y), 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHudOverlay(region) {
  const routeProgress = Math.min(1, state.regionTimer / tuning.routeChoiceInterval);
  ctx.save();
  ctx.strokeStyle = state.flashTimer > 0 ? "rgba(255, 111, 135, 0.32)" : rgba(region.tint, 0.14);
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, cw - 28, ch - 28);

  ctx.fillStyle = "rgba(190, 210, 255, 0.9)";
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText(`${L("sector")} ${regionDisplayName(region)}`, 28, 38);
  ctx.fillText(`${L("threat")} x${state.asteroids.length}`, cw - 126, 38);
  ctx.fillText(`${L("laser")} ${state.shootCooldown > 0 ? L("cooldown") : L("ready")}`, 28, ch - 26);
  ctx.fillText(`${L("core")} x${state.stats.collectedCores}`, 28, 58);
  ctx.fillStyle = rgba(region.tint, 0.92);
  ctx.fillText(regionDisplayName(region), 28, 78);
  ctx.fillText(
    state.routeChoice.active ? `${L("warp")} ${Math.ceil(state.routeChoice.timer)}s` : `${L("next")} ${Math.round(routeProgress * 100)}%`,
    cw - 126,
    58
  );

  if (state.shieldCharges > 0) {
    ctx.fillStyle = "rgba(138, 255, 209, 0.96)";
    ctx.fillText(`${L("shield")} x${state.shieldCharges}`, cw - 130, ch - 42);
  } else if (state.invulnerabilityTimer > 0) {
    ctx.fillStyle = "rgba(144, 244, 255, 0.95)";
    ctx.fillText(L("shielding"), cw - 116, ch - 42);
  }

  if (state.doubleShotTimer > 0) {
    ctx.fillStyle = "rgba(255, 196, 168, 0.98)";
    ctx.fillText(`${L("double")} x${Math.ceil(state.doubleShotTimer)}s`, cw - 128, ch - 24);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(224, 237, 255, 0.9)";
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText(L("paused"), cw - 88, ch - 24);
  }
  drawMinimap(region);
  ctx.restore();
}

function drawVignette() {
  const region = getCurrentRegion();
  const tint = getTuningValue("visualVignetteTint", 0.16) + getRegionVisualBoosts(region).vignetteBoost;
  const vignette = ctx.createRadialGradient(
    cw / 2,
    ch / 2,
    ch * 0.16,
    cw / 2,
    ch / 2,
    ch * 0.76
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, rgba(region.secondaryTint, tint * 0.08));
  vignette.addColorStop(1, `rgba(0,0,0,${0.48 - tint * 0.08})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cw, ch);

  if (state.flashTimer > 0) {
    const alpha = state.flashTimer / tuning.hitFlashDuration;
    const damageGlow = ctx.createRadialGradient(
      cw / 2,
      ch / 2,
      ch * 0.18,
      cw / 2,
      ch / 2,
      ch * 0.82
    );
    damageGlow.addColorStop(0, "rgba(255,111,135,0)");
    damageGlow.addColorStop(0.72, `rgba(255,111,135,${0.04 + alpha * 0.08})`);
    damageGlow.addColorStop(1, `rgba(255,111,135,${0.18 + alpha * 0.22})`);
    ctx.fillStyle = damageGlow;
    ctx.fillRect(0, 0, cw, ch);
  }

  if (state.warpFlash.timer > 0 && state.warpFlash.duration > 0) {
    const alpha = state.warpFlash.timer / state.warpFlash.duration;
    const warpGlow = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.08, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
    warpGlow.addColorStop(0, rgba(state.warpFlash.secondaryTint, 0.08 * alpha));
    warpGlow.addColorStop(0.48, rgba(state.warpFlash.tint, 0.18 * alpha));
    warpGlow.addColorStop(1, rgba(state.warpFlash.tint, 0));
    ctx.fillStyle = warpGlow;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = rgba(state.warpFlash.tint, 0.75);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, Math.max(cw, ch) * (0.18 + (1 - alpha) * 0.42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

let lastIdleFrame = 0;

function loop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;

  update(dt);
  const isActiveFrame = state.running && !state.paused && !state.gameOver;
  if (isActiveFrame || timestamp - lastIdleFrame >= tuning.idleFrameInterval) {
    draw();
    lastIdleFrame = timestamp;
  }
  requestAnimationFrame(loop);
}

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

function updateGestureVisual() {
  if (!gesturePad) {
    return;
  }

  const thumbRange = isCompactLandscapeMode() ? 30 : 36;
  gesturePad.style.setProperty("--gesture-x", `${gestureMovement.dx * thumbRange}px`);
  gesturePad.style.setProperty("--gesture-y", `${gestureMovement.dy * thumbRange}px`);
  gesturePad.classList.toggle("is-active", gestureMovement.active);
}

function setGestureMovement(event) {
  const maxDistance = isCompactLandscapeMode() ? 30 : 48;
  const deadZone = isCompactLandscapeMode() ? 4 : 7;
  const screenX = event.clientX - gestureMovement.startX;
  const screenY = event.clientY - gestureMovement.startY;
  const rawX = isForceLandscapeMode() ? screenY : screenX;
  const rawY = isForceLandscapeMode() ? -screenX : screenY;
  const distance = Math.hypot(rawX, rawY);

  if (distance < deadZone) {
    gestureMovement.dx = 0;
    gestureMovement.dy = 0;
    updateGestureVisual();
    return;
  }

  const scale = Math.min(1, distance / maxDistance);
  gestureMovement.dx = (rawX / distance) * scale;
  gestureMovement.dy = (rawY / distance) * scale;
  updateGestureVisual();
}

function clearGestureMovement() {
  gestureMovement.active = false;
  gestureMovement.pointerId = null;
  gestureMovement.dx = 0;
  gestureMovement.dy = 0;
  updateGestureVisual();
}

async function requestLandscapeMode() {
  if (document.body.classList.contains("force-landscape")) {
    document.body.classList.remove("force-landscape");
    if (screen.orientation?.unlock) {
      screen.orientation.unlock();
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore exit failures; the layout can still return to portrait.
      }
    }
    refreshCanvasSoon();
    return;
  }

  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some mobile browsers only allow manual rotation.
    }
  }

  if (screen.orientation?.lock) {
    try {
      await screen.orientation.lock("landscape");
    } catch {
      // iOS Safari and some Android browsers do not expose orientation lock.
    }
  }

  window.setTimeout(() => {
    if (mobileViewportQuery.matches && isPortraitViewport()) {
      document.body.classList.add("force-landscape");
    }
    refreshCanvasSoon();
  }, 320);
}

function setTouchButtonActive(button, active) {
  button.classList.toggle("is-active", active);
}

function releaseTouchControl(button) {
  const key = button.dataset.touchKey;
  const action = button.dataset.touchAction;

  if (key) {
    keys.delete(key);
  }
  if (action === "fire") {
    fireHeld = false;
  }
  setTouchButtonActive(button, false);
}

function pressTouchControl(button) {
  const key = button.dataset.touchKey;
  const action = button.dataset.touchAction;

  if (key && !state.paused) {
    keys.add(key);
  }
  if (action === "fire") {
    fireHeld = true;
    fireLaser();
  }
  if (action === "pause") {
    togglePause();
  }
  setTouchButtonActive(button, true);
}

for (const button of touchControls) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pressTouchControl(button);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    releaseTouchControl(button);
  });
  button.addEventListener("pointercancel", () => releaseTouchControl(button));
  button.addEventListener("lostpointercapture", () => releaseTouchControl(button));
}

if (gesturePad) {
  gesturePad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    gestureMovement.active = true;
    gestureMovement.pointerId = event.pointerId;
    gestureMovement.startX = event.clientX;
    gestureMovement.startY = event.clientY;
    gesturePad.setPointerCapture(event.pointerId);
    setGestureMovement(event);
  });

  gesturePad.addEventListener("pointermove", (event) => {
    if (!gestureMovement.active || gestureMovement.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setGestureMovement(event);
  });

  gesturePad.addEventListener("pointerup", (event) => {
    if (gestureMovement.pointerId === event.pointerId) {
      event.preventDefault();
      clearGestureMovement();
    }
  });

  gesturePad.addEventListener("pointercancel", clearGestureMovement);
  gesturePad.addEventListener("lostpointercapture", clearGestureMovement);
}

if (orientationButton) {
  orientationButton.addEventListener("click", requestLandscapeMode);
}

if (settingsButton) {
  settingsButton.addEventListener("click", openSettings);
}

if (settingsCloseButton) {
  settingsCloseButton.addEventListener("click", closeSettings);
}

if (musicBtn) {
  musicBtn.addEventListener("click", toggleMusic);
}

if (sfxBtn) {
  sfxBtn.addEventListener("click", toggleSfx);
}

for (const button of skinCards) {
  button.addEventListener("click", () => selectSkin(button.dataset.skin));
}

for (const button of colorSwatches) {
  button.addEventListener("click", () => selectColor(button.dataset.color));
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (event.code === "Space") {
    event.preventDefault();
    if (!state.running || state.gameOver) {
      startGame();
      return;
    }
  }

  if (key === "p" || key === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (fireKeys.has(event.key)) {
    event.preventDefault();
    fireHeld = true;
    fireLaser();
    return;
  }

  if (!state.paused) {
    keys.add(key);
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
  if (fireKeys.has(event.key)) {
    fireHeld = false;
  }
});

window.addEventListener("blur", () => {
  keys.clear();
  fireHeld = false;
  clearGestureMovement();
  if (state.running && !state.paused && !state.gameOver) {
    pauseGame();
  }
});

function refreshViewportMeta() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  // Re-assigning the viewport meta forces Mobile Safari / some Android browsers to
  // recompute the layout viewport to the new orientation width, otherwise the page
  // stays pinned at the portrait width and the right side renders as a black strip.
  meta.setAttribute("content", meta.getAttribute("content"));
}

startButton.addEventListener("click", handleOverlayAction);
window.addEventListener("resize", () => {
  refreshViewportMeta();
  if (!isPortraitViewport()) {
    document.body.classList.remove("force-landscape");
  }
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
showOverlay("start", ui.startTitle, ui.startText, ui.startButton);
state.stars = Array.from({ length: tuning.starCount }, () => makeStar(true));
draw();
requestAnimationFrame(loop);
