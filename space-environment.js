import * as THREE from "three";

const NEBULA_RADIUS = 5800;
const PLANET_DISTANCE = 2600;
const PLANET_DIRECTION = new THREE.Vector3(0.55, 0.32, 0.77).normalize();
const DEFAULT_TINT = "98,228,255";
const WHITE = new THREE.Color(0xffffff);

/* ---------- 程序化贴图 ---------- */

function makeNebulaTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  g.fillStyle = "#03060f";
  g.fillRect(0, 0, width, height);

  // Every gradient is drawn at x - width and x + width too, so the left and
  // right edges agree and the dome has no visible seam.
  const clouds = [
    { x: 0.24, y: 0.38, radius: 0.4, color: "38,92,190", alpha: 0.52 },
    { x: 0.63, y: 0.62, radius: 0.36, color: "186,104,66", alpha: 0.32 },
    { x: 0.5, y: 0.22, radius: 0.46, color: "104,76,180", alpha: 0.3 }
  ];
  for (const cloud of clouds) {
    const cx = cloud.x * width;
    const cy = cloud.y * height;
    const radius = cloud.radius * width;
    for (const offset of [-width, 0, width]) {
      const gradient = g.createRadialGradient(cx + offset, cy, 0, cx + offset, cy, radius);
      gradient.addColorStop(0, `rgba(${cloud.color},${cloud.alpha})`);
      gradient.addColorStop(0.45, `rgba(${cloud.color},${cloud.alpha * 0.36})`);
      gradient.addColorStop(1, `rgba(${cloud.color},0)`);
      g.fillStyle = gradient;
      g.fillRect(0, 0, width, height);
    }
  }

  let seed = 20261026;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 9000; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    g.fillStyle = `rgba(${200 + Math.floor(rand() * 55)},${210 + Math.floor(rand() * 45)},255,${0.015 + rand() * 0.04})`;
    g.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function makePlanetTexture() {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 200;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");

  const halo = g.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.16);
  halo.addColorStop(0, "rgba(110,190,255,0)");
  halo.addColorStop(0.5, "rgba(120,200,255,0.4)");
  halo.addColorStop(1, "rgba(120,200,255,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);

  g.save();
  g.beginPath();
  g.arc(cx, cy, radius, 0, Math.PI * 2);
  g.clip();

  const base = g.createLinearGradient(0, cy - radius, 0, cy + radius);
  base.addColorStop(0, "#2c527e");
  base.addColorStop(0.5, "#4272a4");
  base.addColorStop(1, "#162944");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  const bands = [
    { y: 0.08, height: 0.05, color: "rgba(218,232,246,0.5)" },
    { y: 0.2, height: 0.07, color: "rgba(150,190,228,0.4)" },
    { y: 0.34, height: 0.05, color: "rgba(232,240,250,0.55)" },
    { y: 0.46, height: 0.09, color: "rgba(124,168,208,0.36)" },
    { y: 0.62, height: 0.06, color: "rgba(214,229,244,0.42)" },
    { y: 0.74, height: 0.08, color: "rgba(94,134,176,0.35)" },
    { y: 0.88, height: 0.05, color: "rgba(200,219,240,0.3)" }
  ];
  for (const band of bands) {
    const y = cy - radius + band.y * radius * 2;
    g.fillStyle = band.color;
    g.beginPath();
    g.moveTo(cx - radius, y);
    g.bezierCurveTo(cx - radius * 0.35, y - 10, cx + radius * 0.35, y + 12, cx + radius, y - 3);
    g.lineTo(cx + radius, y + band.height * radius * 2);
    g.bezierCurveTo(cx + radius * 0.35, y + band.height * radius * 2 + 12, cx - radius * 0.35, y + band.height * radius * 2 - 10, cx - radius, y + band.height * radius * 2);
    g.closePath();
    g.fill();
  }

  const rim = g.createRadialGradient(cx - radius * 0.18, cy - radius * 0.28, radius * 0.6, cx, cy, radius);
  rim.addColorStop(0.78, "rgba(170,225,255,0)");
  rim.addColorStop(0.96, "rgba(170,225,255,0.26)");
  rim.addColorStop(1, "rgba(205,240,255,0.55)");
  g.fillStyle = rim;
  g.fillRect(0, 0, size, size);

  const shade = g.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  shade.addColorStop(0, "rgba(2,6,14,0)");
  shade.addColorStop(0.6, "rgba(2,6,14,0.16)");
  shade.addColorStop(1, "rgba(2,6,14,0.82)");
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  g.restore();

  g.strokeStyle = "rgba(130,205,255,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, radius + 1, 0, Math.PI * 2);
  g.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ---------- 环境 ---------- */

function makeDust(half, count, size, opacity, center, glowTexture) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = center.x + (Math.random() * 2 - 1) * half;
    positions[i * 3 + 1] = center.y + (Math.random() * 2 - 1) * half;
    positions[i * 3 + 2] = center.z + (Math.random() * 2 - 1) * half;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: glowTexture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, half };
}

function wrapDust(dust, player) {
  const attribute = dust.points.geometry.attributes.position;
  const values = attribute.array;
  const span = dust.half * 2;
  const centers = [player.x, player.y, player.z];
  let changed = false;
  for (let i = 0; i < values.length; i += 1) {
    const min = centers[i % 3] - dust.half;
    if (values[i] < min || values[i] >= min + span) {
      values[i] -= Math.floor((values[i] - min) / span) * span;
      changed = true;
    }
  }
  if (changed) attribute.needsUpdate = true;
}

export function createSpaceEnvironment({ glowTexture, center }) {
  const nebulaTexture = makeNebulaTexture();
  const planetTexture = makePlanetTexture();

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(NEBULA_RADIUS, 32, 16),
    new THREE.MeshBasicMaterial({
      map: nebulaTexture,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  skyDome.renderOrder = -20;
  skyDome.frustumCulled = false;

  const planetMaterial = new THREE.SpriteMaterial({
    map: planetTexture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false
  });
  const planet = new THREE.Sprite(planetMaterial);
  planet.scale.setScalar(700);
  planet.renderOrder = 1;

  const planetGlowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const planetGlow = new THREE.Sprite(planetGlowMaterial);
  planetGlow.scale.setScalar(1050);
  planetGlow.renderOrder = 0;

  const dustInner = makeDust(700, 160, 3, 0.35, center, glowTexture);
  const dustOuter = makeDust(1600, 320, 2, 0.22, center, glowTexture);

  const group = new THREE.Group();
  group.add(skyDome, planetGlow, planet, dustInner.points, dustOuter.points);

  let currentTint = DEFAULT_TINT;

  function setTint(rgb) {
    const tint = new THREE.Color(`rgb(${rgb})`);
    skyDome.material.color.copy(tint.clone().lerp(WHITE, 0.55));
    dustInner.points.material.color.copy(tint.clone().lerp(WHITE, 0.35));
    dustOuter.points.material.color.copy(tint.clone().lerp(WHITE, 0.35));
    planetMaterial.color.copy(tint.clone().lerp(WHITE, 0.8));
    planetGlowMaterial.color.copy(tint.clone().lerp(WHITE, 0.8));
    currentTint = rgb;
  }

  function update(camera, player) {
    skyDome.position.copy(camera.position);
    planet.position.copy(camera.position).addScaledVector(PLANET_DIRECTION, PLANET_DISTANCE);
    planetGlow.position.copy(planet.position);
    wrapDust(dustInner, player);
    wrapDust(dustOuter, player);
  }

  function getDebugReport() {
    return {
      nebula: true,
      planet: true,
      dustLayers: 2,
      fence: false,
      tint: currentTint,
      nebulaRadius: NEBULA_RADIUS,
      planetDistance: PLANET_DISTANCE
    };
  }

  function dispose() {
    // Geometry and materials belong to the scene and are released by
    // world3d's disposeObject(scene). The shared glow texture stays alive.
    nebulaTexture.dispose();
    planetTexture.dispose();
  }

  setTint(DEFAULT_TINT);

  return { group, update, setTint, getDebugReport, dispose };
}
