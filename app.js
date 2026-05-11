const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const { bestKey, tuning, uiText } = window.starRingConfig;

const particlePool = [];
function acquireParticle(x, y, vx, vy, life, size, color) {
  const p = particlePool.pop() || {};
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.size = size; p.color = color;
  return p;
}
function releaseParticle(p) { particlePool.push(p); }

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

function scaleEntity(entity, scaleX, scaleY) {
  entity.x *= scaleX;
  entity.y *= scaleY;
}

function getGameplayScale() {
  const shortSide = Math.min(canvas.width || 960, canvas.height || 600);
  return Math.max(0.72, Math.min(1, shortSide / 560));
}

function getPlayerRadius() {
  return 22 * getGameplayScale();
}

function isPortraitViewport() {
  return window.innerHeight >= window.innerWidth;
}

function syncLandscapeUi() {
  const forced = document.body.classList.contains("force-landscape");
  const compactLandscape = mobileViewportQuery.matches && (forced || !isPortraitViewport());
  document.body.classList.toggle("landscape-layout", compactLandscape);
  if (orientationButton) {
    orientationButton.textContent = forced ? "退出" : "横屏";
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

function resizeCanvas() {
  const { width, height } = getDisplaySize();
  if (canvas.width === width && canvas.height === height) {
    return;
  }

  const previousWidth = canvas.width || width;
  const previousHeight = canvas.height || height;
  canvas.width = width;
  canvas.height = height;

  const scaleX = width / previousWidth;
  const scaleY = height / previousHeight;
  scaleEntity(state.player, scaleX, scaleY);
  for (const collection of [state.asteroids, state.cores, state.powerUps, state.stars, state.lasers, state.particles, state.messages]) {
    for (const entity of collection) {
      scaleEntity(entity, scaleX, scaleY);
    }
  }
  state.player.radius = getPlayerRadius();
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

function renderOverlayStats(stats, isRecord) {
  overlayStatGrid.innerHTML = stats
    .map(
      ({ label, value }) => `
        <article class="overlay-stat-card">
          <span class="overlay-stat-label">${label}</span>
          <strong class="overlay-stat-value">${value}</strong>
        </article>
      `
    )
    .join("");

  overlayStats.classList.remove("hidden");
  overlayRecord.classList.toggle("hidden", !isRecord);
}

function hideOverlayStats() {
  overlayStats.classList.add("hidden");
  overlayRecord.classList.add("hidden");
  overlayStatGrid.innerHTML = "";
}

let bestScore = readBestScore();
let overlayMode = "start";
bestEl.textContent = String(bestScore);

const state = {
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
  stats: {
    survivalTime: 0,
    destroyedAsteroids: 0,
    collectedCores: 0,
    shotsFired: 0,
    shotsHit: 0,
    newBest: false
  },
  player: {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 22,
    speed: 340,
    angle: -Math.PI / 2
  },
  asteroids: [],
  cores: [],
  powerUps: [],
  stars: [],
  lasers: [],
  messages: [],
  particles: []
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
  state.stats.survivalTime = 0;
  state.stats.destroyedAsteroids = 0;
  state.stats.collectedCores = 0;
  state.stats.shotsFired = 0;
  state.stats.shotsHit = 0;
  state.stats.newBest = false;
  state.player.radius = getPlayerRadius();
  state.player.x = canvas.width / 2;
  state.player.y = canvas.height / 2;
  state.player.angle = -Math.PI / 2;
  state.asteroids = [];
  state.cores = [];
  state.powerUps = [];
  state.lasers = [];
  state.messages = [];
  state.particles = [];
  state.stars = Array.from({ length: 90 }, () => makeStar(true));
  syncHud();
  hideOverlay();
}

function syncHud() {
  scoreEl.textContent = String(Math.floor(state.score));
  healthEl.textContent = `${"♥".repeat(state.health)}${"♡".repeat(3 - state.health)}`;
  bestEl.textContent = String(Math.max(bestScore, Math.floor(state.score)));
}

function hideOverlay() {
  overlay.classList.add("hidden");
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
    x: Math.random() * canvas.width,
    y: randomY ? Math.random() * canvas.height : -20,
    radius: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 36 + 12,
    alpha: Math.random() * 0.6 + 0.18,
    depth: Math.random() * 0.8 + 0.4
  };
}

function makeAsteroidShape(radius) {
  const points = [];
  const count = 11;
  for (let i = 0; i < count; i += 1) {
    points.push({
      angle: (Math.PI * 2 * i) / count,
      distance: radius * (0.72 + Math.random() * 0.34)
    });
  }

  const craters = Array.from({ length: 3 }, () => ({
    x: (Math.random() - 0.5) * radius * 0.9,
    y: (Math.random() - 0.5) * radius * 0.9,
    r: radius * (0.12 + Math.random() * 0.18)
  }));

  const cracks = Array.from({ length: 3 }, () => ({
    angle: Math.random() * Math.PI * 2,
    length: radius * (0.34 + Math.random() * 0.28)
  }));

  return { points, craters, cracks };
}

function sampleAsteroidSpawn(radius) {
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    return { x: -radius, y: Math.random() * canvas.height };
  }

  if (edge === 1) {
    return { x: canvas.width + radius, y: Math.random() * canvas.height };
  }

  if (edge === 2) {
    return { x: Math.random() * canvas.width, y: -radius };
  }

  return { x: Math.random() * canvas.width, y: canvas.height + radius };
}

function triggerScreenShake(duration, strength) {
  state.screenShakeTimer = Math.max(state.screenShakeTimer, duration);
  state.screenShakeStrength = Math.max(state.screenShakeStrength, strength);
}

function spawnAsteroid() {
  const scale = getGameplayScale();
  const radius = (Math.random() * 22 + 20) * scale;
  const minDistance = tuning.safeSpawnDistance + radius + state.player.radius;
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

  if (bestDistance < minDistance) return;

  const angle = Math.atan2(state.player.y - spawn.y, state.player.x - spawn.x);
  const speed = (Math.random() * 70 + 110) * state.speedScale;
  const shape = makeAsteroidShape(radius);

  state.asteroids.push({
    x: spawn.x,
    y: spawn.y,
    radius,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: (Math.random() - 0.5) * 0.03,
    rotation: Math.random() * Math.PI * 2,
    points: shape.points,
    craters: shape.craters,
    cracks: shape.cracks,
    hp: radius > 34 * scale ? 2 : 1,
    hitFlash: 0
  });
}

function samplePickupPosition(margin) {
  return {
    x: Math.random() * Math.max(1, canvas.width - margin * 2) + margin,
    y: Math.random() * Math.max(1, canvas.height - margin * 2) + margin
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
  showOverlay("pause", uiText.pauseTitle, uiText.pauseText, uiText.pauseButton);
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
  updateMessages(dt);

  if (!state.running || state.paused) {
    return;
  }

  state.score += dt * 7;
  state.stats.survivalTime += dt;
  state.flashTimer = Math.max(0, state.flashTimer - dt);
  state.invulnerabilityTimer = Math.max(0, state.invulnerabilityTimer - dt);
  state.screenShakeTimer = Math.max(0, state.screenShakeTimer - dt);
  state.screenShakeStrength = state.screenShakeTimer > 0 ? Math.max(0, state.screenShakeStrength - dt * tuning.screenShakeDecay) : 0;
  state.shootCooldown = Math.max(0, state.shootCooldown - dt);
  state.doubleShotTimer = Math.max(0, state.doubleShotTimer - dt);
  if (fireHeld) {
    fireLaser();
  }
  state.spawnTimer += dt;
  state.coreTimer += dt;
  state.powerUpTimer += dt;
  state.difficultyTimer += dt;

  if (state.difficultyTimer >= tuning.difficultyStep) {
    state.difficultyTimer = 0;
    state.speedScale = Math.min(tuning.maxSpeedScale, state.speedScale + tuning.asteroidSpeedStep);
    state.spawnInterval = Math.max(tuning.minSpawnInterval, state.spawnInterval - tuning.spawnIntervalStep);
  }

  if (state.spawnTimer >= state.spawnInterval) {
    state.spawnTimer = 0;
    spawnAsteroid();
  }

  if (state.coreTimer >= 2.5 && state.cores.length < 2) {
    state.coreTimer = 0;
    spawnCore();
  }

  if (state.powerUpTimer >= tuning.powerUpSpawnInterval && state.powerUps.length < 1) {
    state.powerUpTimer = 0;
    spawnPowerUp();
  }

  movePlayer(dt);
  moveAsteroids(dt);
  moveLasers(dt);
  updateCores(dt);
  updatePowerUps(dt);
  handleCollisions();
  syncHud();
}

function updateStars(dt) {
  if (state.stars.length < 90) {
    state.stars.push(makeStar());
  }

  for (const star of state.stars) {
    star.y += star.speed * star.depth * dt;
    if (star.y > canvas.height + 20) {
      star.x = Math.random() * canvas.width;
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
      p.vx *= 0.988;
      p.vy *= 0.988;
      state.particles[alive++] = p;
    } else {
      releaseParticle(p);
    }
  }
  state.particles.length = alive;
}

function updateMessages(dt) {
  state.messages = state.messages.filter((message) => {
    message.life -= dt;
    message.y += message.vy * dt;
    return message.life > 0;
  });
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

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    state.player.x += nx * state.player.speed * dt;
    state.player.y += ny * state.player.speed * dt;
    state.player.angle = Math.atan2(ny, nx) + Math.PI / 2;
  }

  state.player.x = Math.max(state.player.radius, Math.min(canvas.width - state.player.radius, state.player.x));
  state.player.y = Math.max(state.player.radius, Math.min(canvas.height - state.player.radius, state.player.y));
}

function moveAsteroids(dt) {
  state.asteroids = state.asteroids.filter((asteroid) => {
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.rotation += asteroid.spin;
    asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 4);

    return asteroid.x > -120 && asteroid.x < canvas.width + 120 && asteroid.y > -120 && asteroid.y < canvas.height + 120;
  });
}

function moveLasers(dt) {
  state.lasers = state.lasers.filter((laser) => {
    laser.x += laser.vx * dt;
    laser.y += laser.vy * dt;
    laser.life -= dt;
    return laser.life > 0 && laser.x > -40 && laser.x < canvas.width + 40 && laser.y > -40 && laser.y < canvas.height + 40;
  });
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
  const speed = 720;
  state.lasers.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: 0.9
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

  state.shootCooldown = 0.18;
  const angle = state.player.angle - Math.PI / 2;
  const offset = state.player.radius + 18;
  const baseX = state.player.x + Math.cos(angle) * offset;
  const baseY = state.player.y + Math.sin(angle) * offset;
  const sideX = Math.cos(state.player.angle);
  const sideY = Math.sin(state.player.angle);

  if (state.doubleShotTimer > 0) {
    state.stats.shotsFired += 2;
    spawnLaser(baseX + sideX * 9, baseY + sideY * 9, angle);
    spawnLaser(baseX - sideX * 9, baseY - sideY * 9, angle);
    return;
  }

  state.stats.shotsFired += 1;
  spawnLaser(baseX, baseY, angle);
}

function handleCollisions() {
  if (state.invulnerabilityTimer <= 0) {
    for (let i = state.asteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = state.asteroids[i];
      const dist = Math.hypot(asteroid.x - state.player.x, asteroid.y - state.player.y);
      if (dist < asteroid.radius + state.player.radius) {
        spawnBurst(asteroid.x, asteroid.y, 20, ["#ff8ea1", "#ffc5cf", "#ffd7a1"]);
        spawnBurst(state.player.x, state.player.y, 16, ["#ff8ea1", "#ffd7a1", "#fff0d6"]);
        state.asteroids.splice(i, 1);

        if (state.shieldCharges > 0) {
          state.shieldCharges -= 1;
          state.invulnerabilityTimer = 0.3;
          state.flashTimer = 0;
          triggerScreenShake(0.2, 12);
          spawnBurst(state.player.x, state.player.y, 18, ["#8affd1", "#d4fff4", "#62e4ff"]);
          spawnMessage("SHIELD -1", state.player.x, state.player.y - 34, "#8affd1");
          break;
        }

        state.health -= 1;
        state.invulnerabilityTimer = tuning.hitInvulnerability;
        state.flashTimer = tuning.hitFlashDuration;
        triggerScreenShake(0.28, 18);
        spawnMessage("HULL -1", state.player.x, state.player.y - 34, "#ff8ea1");
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
      const isLargeAsteroid = asteroid.radius > 34;
      const dist = Math.hypot(asteroid.x - laser.x, asteroid.y - laser.y);
      if (dist < threshold) {
        hit = true;
        state.lasers.splice(i, 1);
        state.stats.shotsHit += 1;
        asteroid.hp -= 1;
        asteroid.hitFlash = 1;
        spawnBurst(laser.x, laser.y, isLargeAsteroid ? 10 : 8, ["#74ecff", "#d2fbff", "#8c9bb7"]);
        triggerScreenShake(0.08, isLargeAsteroid ? 6 : 4);

        if (asteroid.hp <= 0) {
          state.score += 18;
          state.stats.destroyedAsteroids += 1;
          spawnBurst(asteroid.x, asteroid.y, isLargeAsteroid ? 28 : 20, ["#7fe8ff", "#dce7ff", "#95a5bf"]);
          triggerScreenShake(isLargeAsteroid ? 0.18 : 0.12, isLargeAsteroid ? 12 : 7);
          state.asteroids.splice(j, 1);
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
    const dist = Math.hypot(core.x - state.player.x, core.y - state.player.y);
    if (dist < core.radius + state.player.radius + 4) {
      state.cores.splice(i, 1);
      state.score += 25;
      state.stats.collectedCores += 1;
      spawnBurst(core.x, core.y, 14, ["#8affd1", "#f3fffd", "#62e4ff"]);
      spawnMessage("CORE +25", core.x, core.y - 22, "#8affd1");
    }
  }

  for (let i = state.powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = state.powerUps[i];
    const dist = Math.hypot(powerUp.x - state.player.x, powerUp.y - state.player.y);
    if (dist < powerUp.radius + state.player.radius + 4) {
      state.powerUps.splice(i, 1);
      if (powerUp.type === "shield") {
        state.shieldCharges = 1;
        spawnBurst(powerUp.x, powerUp.y, 18, ["#8affd1", "#d9fffb", "#62e4ff"]);
        spawnMessage("SHIELD READY", powerUp.x, powerUp.y - 24, "#8affd1");
      } else {
        state.doubleShotTimer = tuning.doubleShotDuration;
        spawnBurst(powerUp.x, powerUp.y, 18, ["#ffd7a1", "#ffb59e", "#ff8ea1"]);
        spawnMessage("DOUBLE FIRE", powerUp.x, powerUp.y - 24, "#ffb59e");
      }
      triggerScreenShake(0.12, 8);
    }
  }
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

function spawnMessage(text, x, y, color = "#f2f7ff") {
  state.messages.push({
    text,
    x,
    y,
    vy: -36,
    color,
    life: 0.9
  });
}

function endGame() {
  state.running = false;
  state.paused = false;
  state.gameOver = true;
  state.screenShakeTimer = 0;
  state.screenShakeStrength = 0;

  const finalScore = Math.floor(state.score);
  state.stats.newBest = finalScore > bestScore;

  if (state.stats.newBest) {
    bestScore = finalScore;
    writeBestScore(finalScore);
  }

  syncHud();

  renderOverlayStats(
    [
      { label: "最终分数", value: String(finalScore) },
      { label: "存活时间", value: formatDuration(state.stats.survivalTime) },
      { label: "击毁陨石", value: String(state.stats.destroyedAsteroids) },
      { label: "回收核心", value: String(state.stats.collectedCores) },
      { label: "命中率", value: formatRate(state.stats.shotsHit, state.stats.shotsFired) }
    ],
    state.stats.newBest
  );

  showOverlay(
    "gameover",
    state.stats.newBest ? uiText.recordTitle : uiText.gameOverTitle,
    state.stats.newBest ? uiText.newRecord(finalScore) : uiText.gameOver(finalScore),
    uiText.restartButton
  );
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  if (state.screenShakeTimer > 0 && state.screenShakeStrength > 0) {
    const intensity = state.screenShakeStrength * Math.min(1, 0.45 + state.screenShakeTimer * 4);
    ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
  }

  drawBackground();
  drawStars();
  drawRings();
  drawAsteroidWarnings();
  drawCores();
  drawPowerUps();
  drawParticles();
  drawMessages();
  drawLasers();
  drawAsteroids();
  drawPlayer();
  drawHudOverlay();
  drawVignette();
  ctx.restore();
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#08111f");
  bg.addColorStop(0.45, "#07101d");
  bg.addColorStop(1, "#030814");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glowA = ctx.createRadialGradient(180, 120, 40, 180, 120, 320);
  glowA.addColorStop(0, "rgba(98, 228, 255, 0.22)");
  glowA.addColorStop(1, "rgba(98, 228, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glowB = ctx.createRadialGradient(canvas.width - 140, canvas.height - 90, 50, canvas.width - 140, canvas.height - 90, 300);
  glowB.addColorStop(0, "rgba(123, 140, 255, 0.18)");
  glowB.addColorStop(1, "rgba(123, 140, 255, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStars() {
  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#dcecff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRings() {
  const pulse = Math.sin(state.pulseTime * 0.8) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.strokeStyle = `rgba(108, 171, 255, ${0.08 + pulse * 0.06})`;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 160 + i * 90, 92 + i * 50, 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroidWarnings() {
  ctx.save();
  for (const asteroid of state.asteroids) {
    const isInside =
      asteroid.x >= 0 &&
      asteroid.x <= canvas.width &&
      asteroid.y >= 0 &&
      asteroid.y <= canvas.height;

    if (isInside) {
      continue;
    }

    const nearHorizontal =
      asteroid.x > -tuning.asteroidWarningDistance &&
      asteroid.x < canvas.width + tuning.asteroidWarningDistance;
    const nearVertical =
      asteroid.y > -tuning.asteroidWarningDistance &&
      asteroid.y < canvas.height + tuning.asteroidWarningDistance;

    if (!nearHorizontal && !nearVertical) {
      continue;
    }

    const x = Math.max(28, Math.min(canvas.width - 28, asteroid.x));
    const y = Math.max(28, Math.min(canvas.height - 28, asteroid.y));
    const angle = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ff8ea1";
    ctx.fillStyle = "rgba(255, 111, 135, 0.88)";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer() {
  const { x, y, radius, angle } = state.player;
  const pulse = Math.sin(state.pulseTime * 5) * 0.5 + 0.5;
  const invulnerable = state.invulnerabilityTimer > 0;
  const flicker = invulnerable && Math.floor(state.invulnerabilityTimer * 18) % 2 === 0;
  const thruster = state.running && !state.paused && hasActiveMovement();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = flicker ? 0.7 : 1;

  if (thruster) {
    const flame = 16 + pulse * 12;
    const flameGradient = ctx.createLinearGradient(0, radius * 0.6, 0, radius + flame);
    flameGradient.addColorStop(0, "rgba(255, 243, 182, 0.95)");
    flameGradient.addColorStop(0.4, "rgba(98, 228, 255, 0.92)");
    flameGradient.addColorStop(1, "rgba(98, 228, 255, 0)");
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.moveTo(-8, radius * 0.58);
    ctx.quadraticCurveTo(0, radius + flame, 8, radius * 0.58);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = state.flashTimer > 0 ? 36 : invulnerable ? 30 : 24;
  ctx.shadowColor = state.flashTimer > 0 ? "#ff6f87" : invulnerable ? "#9ff3ff" : "#62e4ff";

  ctx.strokeStyle = invulnerable
    ? `rgba(214, 249, 255, ${0.54 + pulse * 0.22})`
    : `rgba(131, 232, 255, ${0.54 + pulse * 0.18})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -radius - 18);
  ctx.lineTo(radius * 0.78, radius * 0.52);
  ctx.lineTo(radius * 0.42, radius * 0.36);
  ctx.lineTo(radius * 0.28, radius + 4);
  ctx.lineTo(0, radius * 0.62);
  ctx.lineTo(-radius * 0.28, radius + 4);
  ctx.lineTo(-radius * 0.42, radius * 0.36);
  ctx.lineTo(-radius * 0.78, radius * 0.52);
  ctx.closePath();
  ctx.stroke();

  const hullGradient = ctx.createLinearGradient(0, -radius - 18, 0, radius + 6);
  hullGradient.addColorStop(0, "#f7fbff");
  hullGradient.addColorStop(0.24, "#a5f0ff");
  hullGradient.addColorStop(0.55, "#65a4ff");
  hullGradient.addColorStop(1, "#11254b");
  ctx.fillStyle = hullGradient;
  ctx.beginPath();
  ctx.moveTo(0, -radius - 18);
  ctx.lineTo(radius * 0.78, radius * 0.52);
  ctx.lineTo(radius * 0.42, radius * 0.36);
  ctx.lineTo(radius * 0.28, radius + 4);
  ctx.lineTo(0, radius * 0.62);
  ctx.lineTo(-radius * 0.28, radius + 4);
  ctx.lineTo(-radius * 0.42, radius * 0.36);
  ctx.lineTo(-radius * 0.78, radius * 0.52);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(8, 16, 31, 0.94)";
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.96);
  ctx.bezierCurveTo(radius * 0.28, -radius * 0.24, radius * 0.24, radius * 0.04, 0, radius * 0.24);
  ctx.bezierCurveTo(-radius * 0.24, radius * 0.04, -radius * 0.28, -radius * 0.24, 0, -radius * 0.96);
  ctx.fill();

  ctx.strokeStyle = "rgba(233, 249, 255, 0.82)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -radius - 14);
  ctx.lineTo(0, radius * 0.54);
  ctx.moveTo(-radius * 0.52, radius * 0.12);
  ctx.lineTo(radius * 0.52, radius * 0.12);
  ctx.stroke();

  ctx.fillStyle = "#d6f9ff";
  ctx.beginPath();
  ctx.moveTo(-radius * 0.96, radius * 0.54);
  ctx.lineTo(-radius * 0.36, radius * 0.18);
  ctx.lineTo(-radius * 0.18, radius * 0.66);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(radius * 0.96, radius * 0.54);
  ctx.lineTo(radius * 0.36, radius * 0.18);
  ctx.lineTo(radius * 0.18, radius * 0.66);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(118, 235, 255, 0.95)";
  ctx.fillRect(-radius * 0.48, -radius * 0.16, radius * 0.18, radius * 0.44);
  ctx.fillRect(radius * 0.3, -radius * 0.16, radius * 0.18, radius * 0.44);

  if (state.shieldCharges > 0) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = `rgba(138, 255, 209, ${0.4 + pulse * 0.25})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 18 + pulse * 2.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (invulnerable) {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = `rgba(127, 241, 255, ${0.32 + pulse * 0.22})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 14 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAsteroids() {
  for (const asteroid of state.asteroids) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rotation);

    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(15, 21, 38, 0.45)";

    const rock = ctx.createRadialGradient(-asteroid.radius * 0.32, -asteroid.radius * 0.34, 4, 0, 0, asteroid.radius + 12);
    rock.addColorStop(0, asteroid.hitFlash > 0 ? "#eaf8ff" : "#b9c3d6");
    rock.addColorStop(0.35, asteroid.hitFlash > 0 ? "#9bdfff" : "#77839a");
    rock.addColorStop(0.7, "#424b5c");
    rock.addColorStop(1, "#232a36");
    ctx.fillStyle = rock;
    ctx.strokeStyle = "rgba(200, 214, 240, 0.24)";
    ctx.lineWidth = 1.4;

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

    ctx.shadowBlur = 0;
    for (const crater of asteroid.craters) {
      const craterGradient = ctx.createRadialGradient(
        crater.x - crater.r * 0.3,
        crater.y - crater.r * 0.3,
        1,
        crater.x,
        crater.y,
        crater.r
      );
      craterGradient.addColorStop(0, "rgba(34, 41, 58, 0.96)");
      craterGradient.addColorStop(1, "rgba(105, 118, 142, 0.28)");
      ctx.fillStyle = craterGradient;
      ctx.beginPath();
      ctx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = asteroid.hitFlash > 0 ? "rgba(111, 232, 255, 0.8)" : "rgba(116, 136, 170, 0.42)";
    ctx.lineWidth = 1.1;
    for (const crack of asteroid.cracks) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(crack.angle) * crack.length * -0.14, Math.sin(crack.angle) * crack.length * -0.14);
      ctx.lineTo(Math.cos(crack.angle) * crack.length, Math.sin(crack.angle) * crack.length);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawCores() {
  for (const core of state.cores) {
    const radius = core.radius + Math.sin(core.pulse) * 2;
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
  for (const laser of state.lasers) {
    ctx.save();
    ctx.translate(laser.x, laser.y);
    ctx.rotate(laser.angle);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#77ebff";
    const beam = ctx.createLinearGradient(-18, 0, 18, 0);
    beam.addColorStop(0, "rgba(119, 235, 255, 0)");
    beam.addColorStop(0.45, "#d8fbff");
    beam.addColorStop(1, "rgba(119, 235, 255, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(-18, -2, 36, 4);
    ctx.restore();
  }
}

function drawHudOverlay() {
  ctx.save();
  ctx.strokeStyle = state.flashTimer > 0 ? "rgba(255, 111, 135, 0.32)" : "rgba(111, 170, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  ctx.fillStyle = "rgba(190, 210, 255, 0.9)";
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText("SECTOR A-17", 28, 38);
  ctx.fillText(`THREAT x${state.asteroids.length}`, canvas.width - 126, 38);
  ctx.fillText(`LASER ${state.shootCooldown > 0 ? "COOLDOWN" : "READY"}`, 28, canvas.height - 26);
  ctx.fillText(`CORE x${state.stats.collectedCores}`, 28, 58);

  if (state.shieldCharges > 0) {
    ctx.fillStyle = "rgba(138, 255, 209, 0.96)";
    ctx.fillText(`SHIELD x${state.shieldCharges}`, canvas.width - 130, canvas.height - 26);
  } else if (state.invulnerabilityTimer > 0) {
    ctx.fillStyle = "rgba(144, 244, 255, 0.95)";
    ctx.fillText("SHIELDING", canvas.width - 116, canvas.height - 26);
  }

  if (state.doubleShotTimer > 0) {
    ctx.fillStyle = "rgba(255, 196, 168, 0.98)";
    ctx.fillText(`DOUBLE x${Math.ceil(state.doubleShotTimer)}s`, canvas.width - 128, 58);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(224, 237, 255, 0.9)";
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText("PAUSED", canvas.width - 88, canvas.height - 24);
  }
  ctx.restore();
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.16,
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.76
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.52)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.flashTimer > 0) {
    const alpha = state.flashTimer / tuning.hitFlashDuration;
    const damageGlow = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.height * 0.18,
      canvas.width / 2,
      canvas.height / 2,
      canvas.height * 0.82
    );
    damageGlow.addColorStop(0, "rgba(255,111,135,0)");
    damageGlow.addColorStop(0.72, `rgba(255,111,135,${0.04 + alpha * 0.08})`);
    damageGlow.addColorStop(1, `rgba(255,111,135,${0.18 + alpha * 0.22})`);
    ctx.fillStyle = damageGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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

startButton.addEventListener("click", handleOverlayAction);
window.addEventListener("resize", () => {
  if (!isPortraitViewport()) {
    document.body.classList.remove("force-landscape");
  }
  refreshCanvasSoon();
});
window.addEventListener("orientationchange", refreshCanvasSoon);
if (mobileViewportQuery.addEventListener) {
  mobileViewportQuery.addEventListener("change", refreshCanvasSoon);
}

syncLandscapeUi();
resizeCanvas();
showOverlay("start", uiText.startTitle, uiText.startText, uiText.startButton);
state.stars = Array.from({ length: 90 }, () => makeStar(true));
draw();
requestAnimationFrame(loop);
