// WebGL renderer for the 3D room. Loaded as a module so three.js can be
// imported; the rest of the game stays classic scripts on window.
import * as THREE from "three";
import { createFighterModel, createStudioEnvironment } from "./fighter-model.js";
import { createPickupModel } from "./pickup-models.js";
import { createRockSet } from "./rock-models.js";
import { createSpaceEnvironment } from "./space-environment.js";

const sceneObjects = {
  rocks: new Map(),
  cores: new Map(),
  powerUps: new Map(),
  lasers: new Map(),
  gates: new THREE.Group(),
  ship: null,
  stars: null
};

let renderer = null;
let scene = null;
let camera = null;
let starField = null;
let worldSize = null;
let shipGroup = null;
let sunLight = null;
let rimLight = null;
let currentShipColor = 0x8fe6ff;
let currentSkin = "default";
let fighterEnvironment = null;
let pickupGlowTexture = null;
let rockSet = null;
let spaceEnvironment = null;
let lastGates = [];
const gateLabelCache = new Map();
const fxPool = { debris: [], flashes: [], rings: [], sparks: [] };
const fxKinds = ["debris", "flashes", "rings", "sparks"];
const fxStats = { createdMaterials: 0, disposedMaterials: 0, createdGeometries: 0, disposedGeometries: 0, disposedRingGeometries: 0, sharedGeometryDisposals: 0 };
// Observe Three's actual dispose events, not removal from our live pools.
const onFxMaterialDispose = () => { fxStats.disposedMaterials += 1; };
const onFxGeometryDispose = () => { fxStats.disposedGeometries += 1; };
const onFxRingDispose = () => { fxStats.disposedRingGeometries += 1; };
const onSharedGeometryDispose = () => { fxStats.sharedGeometryDisposals += 1; };
let fxState = null;
let fxTuning = null;
let fxSource = null;
let fxRingGeometry = null;

function releaseFx(effect) {
  for (const mesh of effect.objects) {
    scene.remove(mesh);
    mesh.material.dispose();
    if (mesh.isPoints) mesh.geometry.dispose();
  }
}

function clearFx() {
  for (const pool of Object.values(fxPool)) {
    pool.forEach(releaseFx);
    pool.length = 0;
  }
}

function buildFx(kind, event) {
  const reduced = Math.min(window.innerWidth, window.innerHeight) < 480 || navigator.maxTouchPoints > 0;
  const effect = { born: event.born, objects: [], life: 0, radius: event.radius };
  const origin = new THREE.Vector3(event.x, event.y, event.z);
  const velocity = () => new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 100);
  const color = event.elite ? 0xffbd65 : 0xffffff;
  if (kind === "debris") {
    const form = rockFormFor(event);
    const count = reduced ? fxTuning.fxShardCountMobile : event.elite ? 6 : fxTuning.fxShardCount;
    effect.life = 0.45 + Math.random() * 0.25;
    for (let i = 0; i < count; i += 1) {
      const material = form.material.clone();
      material.transparent = true;
      material.color.set(`rgb(${event.mineralTint})`).lerp(WHITE, 0.85);
      const shard = new THREE.Mesh(form.geometry, material);
      shard.scale.setScalar(event.radius * (0.16 + Math.random() * 0.14));
      shard.userData.velocity = velocity();
      shard.userData.origin = origin.clone().addScaledVector(shard.userData.velocity.clone().normalize(), event.radius * 0.35);
      shard.userData.spin = new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 7);
      effect.objects.push(shard);
    }
  } else if (kind === "flashes") {
    effect.life = 0.1;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupGlowTexture, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.scale.setScalar(event.radius * 4);
    effect.objects.push(flash);
  } else if (kind === "rings") {
    effect.life = 0.35;
    effect.radius *= event.elite ? 1.4 : 1;
    effect.objects.push(new THREE.Mesh(fxRingGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  } else {
    effect.life = 0.25 + Math.random() * 0.15;
    const count = event.hit ? 3 + Math.floor(Math.random() * 3) : 20 * (event.elite ? 2 : 1);
    const positions = new Float32Array((reduced ? Math.ceil(count / 2) : count) * 3);
    const velocities = new Float32Array(positions.length);
    for (let i = 0; i < velocities.length; i += 3) velocity().multiplyScalar(2.5).toArray(velocities, i);
    const geometry = new THREE.BufferGeometry();
    fxStats.createdGeometries += 1;
    geometry.addEventListener("dispose", onFxGeometryDispose);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color: event.elite ? 0xffbd65 : 0xb5efff, size: 4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.userData.velocities = velocities;
    // Positions expand after creation, so the initial zero-size bound is stale.
    sparks.frustumCulled = false;
    effect.objects.push(sparks);
  }
  for (const object of effect.objects) {
    fxStats.createdMaterials += 1;
    object.material.addEventListener("dispose", onFxMaterialDispose);
    object.userData.origin ||= origin;
    object.position.copy(object.userData.origin);
    scene.add(object);
  }
  return effect;
}

function syncFx(state) {
  if (fxSource !== state.fx) {
    clearFx();
    fxSource = state.fx;
  }
  for (const kind of fxKinds) {
    const pool = fxPool[kind];
    const queue = state.fx[kind];
    if (queue.length) {
      for (const event of queue) {
        if (pool.length >= fxTuning.fxMaxDebrisGroups) releaseFx(pool.shift());
        pool.push(buildFx(kind, event));
      }
      queue.length = 0;
    }
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      const effect = pool[i];
      // Simulation time keeps manual ticks and rendering from double-aging FX.
      const age = state.pulseTime - effect.born;
      if (age >= effect.life) {
        releaseFx(effect);
        pool.splice(i, 1);
        continue;
      }
      const progress = Math.max(0, age / effect.life);
      for (const object of effect.objects) {
        object.material.opacity = (kind === "flashes" ? 0.9 : 1) * (1 - progress);
        if (kind === "debris") {
          object.position.copy(object.userData.origin).addScaledVector(object.userData.velocity, age);
          const spin = object.userData.spin;
          object.rotation.set(spin.x * age, spin.y * age, spin.z * age);
        } else if (kind === "rings") {
          object.quaternion.copy(camera.quaternion);
          object.scale.setScalar(effect.radius * (1 + 0.6 * progress));
        } else if (kind === "sparks") {
          const position = object.geometry.attributes.position;
          for (let j = 0; j < position.array.length; j += 1) position.array[j] = object.userData.velocities[j] * age;
          position.needsUpdate = true;
        }
      }
    }
  }
}

const MAX_ANISOTROPY_CACHE = new Map();

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

/* ---------- 程序化纹理 ---------- */

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeHullTexture() {
  // Grayscale panel layout: the material colour supplies the livery, so one
  // shared texture works for all three hulls and all three colours.
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#b9c2d4";
  g.fillRect(0, 0, size, size);

  g.strokeStyle = "rgba(14,20,32,0.62)";
  g.lineWidth = 2;
  for (let i = 0; i <= size; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(size, i);
    g.stroke();
  }

  let s = 9137;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 220; i += 1) {
    g.fillStyle = `rgba(40,48,64,${0.08 + rand() * 0.18})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 5, 1 + rand() * 3);
  }
  for (let i = 0; i < 7; i += 1) {
    g.strokeStyle = "rgba(28,36,52,0.45)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(rand() * size, rand() * size);
    g.lineTo(rand() * size, rand() * size);
    g.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  return texture;
}

/* ---------- 场景搭建 ---------- */

function buildStarField(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    // Stars sit on a large shell so they never parallax out of position.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 3000 + Math.random() * 1600;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    const warm = Math.random();
    colors[i * 3] = 0.75 + warm * 0.25;
    colors[i * 3 + 1] = 0.8 + warm * 0.18;
    colors[i * 3 + 2] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 9,
    map: makeGlowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  return new THREE.Points(geometry, material);
}

const WHITE = new THREE.Color(0xffffff);

function makeShipMaterials(base, hullTexture) {
  const hull = new THREE.MeshStandardMaterial({
    map: hullTexture,
    color: base.clone().multiplyScalar(0.46),
    metalness: 0.8,
    roughness: 0.32,
    emissive: base.clone().multiplyScalar(0.16)
  });
  const panel = new THREE.MeshStandardMaterial({
    map: hullTexture,
    color: base.clone().multiplyScalar(0.2),
    metalness: 0.88,
    roughness: 0.4,
    emissive: base.clone().multiplyScalar(0.05)
  });
  const accent = new THREE.MeshStandardMaterial({
    color: base.clone().lerp(WHITE, 0.05),
    emissive: base.clone(),
    emissiveIntensity: 0.6,
    metalness: 0.35,
    roughness: 0.26
  });
  const engine = new THREE.MeshBasicMaterial({ color: base.clone().lerp(WHITE, 0.25) });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x07111f,
    metalness: 1,
    roughness: 0.06,
    emissive: base.clone().multiplyScalar(0.2)
  });
  return { hull, panel, accent, engine, glass };
}

function tintShip(group, color) {
  if (group.userData.applyLivery) {
    group.userData.applyLivery(color);
    return;
  }
  const base = new THREE.Color(color);
  const m = group.userData.materials;
  if (!m) return;
  m.hull.color.copy(base).multiplyScalar(0.46);
  m.hull.emissive.copy(base).multiplyScalar(0.16);
  m.panel.color.copy(base).multiplyScalar(0.2);
  m.panel.emissive.copy(base).multiplyScalar(0.05);
  m.accent.color.copy(base).lerp(WHITE, 0.05);
  m.accent.emissive.copy(base);
  m.accent.emissiveIntensity = 0.6;
  m.engine.color.copy(base).lerp(WHITE, 0.25);
  m.glass.emissive.copy(base).multiplyScalar(0.2);
  for (const flame of group.userData.flames) {
    flame.material.color.copy(base).lerp(WHITE, 0.35);
    flame.material.needsUpdate = true;
  }
  if (group.userData.glow) group.userData.glow.color.copy(base);
}

function addFlame(group, x, y, z, radius, length) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 10, 1, true), material);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(x, y, z - length / 2);
  group.add(flame);
  group.userData.flames.push(flame);
  return flame;
}

function addShipGlow(group, x, y, z) {
  const glow = new THREE.PointLight(group.userData.materials.engine.color.clone(), 120, 420, 2);
  glow.position.set(x, y, z);
  group.add(glow);
  group.userData.glow = glow;
}

function addWingtip(group, x, y, z, color) {
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 10, 10),
    new THREE.MeshBasicMaterial({ color })
  );
  tip.position.set(x, y, z);
  group.add(tip);
}

function buildDelta(group) {
  const { hull, panel, accent, glass } = group.userData.materials;

  const shape = new THREE.Shape();
  shape.moveTo(0, 48);
  shape.lineTo(62, -28);
  shape.lineTo(22, -38);
  shape.lineTo(-22, -38);
  shape.lineTo(-62, -28);
  shape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 14,
    bevelEnabled: true,
    bevelThickness: 2,
    bevelSize: 2,
    bevelSegments: 1,
    steps: 1
  });
  wingGeometry.rotateX(Math.PI / 2);
  wingGeometry.translate(0, 7, 0);

  const wing = new THREE.Mesh(wingGeometry, hull);
  wing.castShadow = true;
  group.add(wing);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 48), panel);
  spine.position.set(0, 6, -6);
  spine.castShadow = true;
  group.add(spine);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(8.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    glass
  );
  canopy.position.set(0, 11, 6);
  canopy.scale.set(0.9, 0.8, 2.1);
  group.add(canopy);

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 14, 16), panel);
    fin.position.set(side * 11, 12, -26);
    fin.rotation.z = side * 0.18;
    group.add(fin);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(26, 0.7, 2), accent);
    stripe.position.set(side * 34, 1.2, -8);
    stripe.rotation.y = side * 0.62;
    group.add(stripe);

    const engineHouse = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 22, 14), panel);
    engineHouse.rotation.x = Math.PI / 2;
    engineHouse.position.set(side * 13, 1, -32);
    group.add(engineHouse);

    addFlame(group, side * 13, 1, -43, 6, 44);
    addFlame(group, side * 13, 1, -43, 2.8, 26);
    addWingtip(group, side * 57, -1, -24, side > 0 ? 0x8affd1 : 0xff8ea1);
  }

  const engine = group.userData.materials.engine;
  for (const side of [-1, 1]) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 12), engine);
    core.position.set(side * 13, 1, -41);
    group.add(core);
  }

  addShipGlow(group, 0, 2, -34);
}

function buildSaucer(group) {
  const { hull, panel, accent, glass } = group.userData.materials;

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(64, 58, 10, 32), hull);
  disc.castShadow = true;
  group.add(disc);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    panel
  );
  belly.position.y = -4;
  belly.scale.y = 0.55;
  belly.castShadow = true;
  group.add(belly);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glass
  );
  dome.position.y = 5;
  dome.scale.y = 0.7;
  group.add(dome);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(68, 1.8, 8, 48), accent);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.userData.ring = ring;

  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI * 2 * i) / 4 + Math.PI / 4;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(3, 10, 10),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8affd1 : 0xff8ea1 })
    );
    light.position.set(Math.cos(angle) * 60, -1, Math.sin(angle) * 60);
    group.add(light);
  }

  for (const side of [-1, 1]) {
    const engineHouse = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 16, 14), panel);
    engineHouse.rotation.x = Math.PI / 2;
    engineHouse.position.set(side * 22, -3, -34);
    group.add(engineHouse);

    addFlame(group, side * 22, -3, -42, 5.5, 34);
    addFlame(group, side * 22, -3, -42, 2.4, 20);
  }

  const engine = group.userData.materials.engine;
  const core = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 14), engine);
  core.position.set(0, -9, 0);
  group.add(core);

  const nozzle = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 6, 24), accent);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.y = -8;
  group.add(nozzle);

  addShipGlow(group, 0, -10, 0);
}

function buildShip(color, skin = "default") {
  if (skin !== "delta" && skin !== "saucer") {
    const fighter = createFighterModel({ environment: fighterEnvironment, color });
    fighter.scale.setScalar(1);
    return fighter;
  }

  const base = new THREE.Color(color);
  const hullTexture = makeHullTexture();
  const materials = makeShipMaterials(base, hullTexture);
  const group = new THREE.Group();
  group.userData = {
    materials,
    flames: [],
    ring: null,
    glow: null,
    ownTextures: [hullTexture]
  };

  if (skin === "saucer") buildSaucer(group);
  else buildDelta(group);

  tintShip(group, base);
  group.scale.setScalar(1.6);
  return group;
}

function rockFormFor(asteroid) {
  if (asteroid.form) {
    const requested = rockSet.forms.find((form) => form.id === asteroid.form);
    if (requested) return requested;
  }
  // Position hash: the same spawn point always keeps the same silhouette.
  const noise = Math.sin(asteroid.x * 12.9898 + asteroid.y * 78.233 + asteroid.z * 37.719) * 43758.5453;
  return rockSet.forms[Math.floor((noise - Math.floor(noise)) * rockSet.forms.length) % rockSet.forms.length];
}

function syncRock(entry) {
  let mesh = sceneObjects.rocks.get(entry.asteroid);
  if (!mesh) {
    const form = rockFormFor(entry.asteroid);
    // Mineral tint is a hint, not the base colour: most of the shared stone
    // map stays visible, so the field does not read as coloured marbles.
    const material = form.material.clone();
    material.color.copy(new THREE.Color(`rgb(${entry.asteroid.mineralTint})`)).lerp(WHITE, 0.85);
    material.emissive.setHex(0xff6a3d);
    material.emissiveMap = form.bumpMap;
    material.emissiveIntensity = 0;
    mesh = new THREE.Mesh(form.geometry, material);
    mesh.userData.formId = form.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    sceneObjects.rocks.set(entry.asteroid, mesh);
  }

  const a = entry.asteroid;
  mesh.position.set(a.x, a.y, a.z);
  mesh.scale.setScalar(a.radius);
  mesh.rotation.set(a.rotation * 0.37, a.rotation, a.rotation * 0.61);
  mesh.material.emissiveIntensity = a.hitFlash > 0 ? a.hitFlash * 0.8 : (a.elite ? 0.18 : 0);

  return mesh;
}

function roundVector(vector) {
  return {
    x: Number(vector.x.toFixed(2)),
    y: Number(vector.y.toFixed(2)),
    z: Number(vector.z.toFixed(2))
  };
}

function localCenter(object, group) {
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  return roundVector(group.worldToLocal(center));
}

function localBounds(object, group) {
  object.updateWorldMatrix(true, true);
  group.updateWorldMatrix(true, true);
  const toGroupLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  object.traverse((child) => {
    if (!child.geometry) return;
    child.geometry.computeBoundingBox();
    const childBox = child.geometry.boundingBox
      .clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroupLocal, child.matrixWorld));
    box.union(childBox);
  });
  return roundVector(box.getSize(new THREE.Vector3()));
}

function rockDebugReport() {
  const forms = (rockSet?.forms || []).map((form) => {
    form.geometry.computeBoundingBox();
    const bounds = form.geometry.boundingBox.getSize(new THREE.Vector3());
    const position = form.geometry.attributes.position;
    let vertexRadius = 0;
    for (let i = 0; i < position.count; i += 1) {
      vertexRadius = Math.max(vertexRadius, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
    }
    return {
      id: form.id,
      triangles: (form.geometry.index ? form.geometry.index.count : form.geometry.attributes.position.count) / 3,
      bounds: roundVector(bounds),
      maxRadius: form.geometry.userData.maxRadius,
      maxHalfExtent: form.geometry.userData.maxHalfExtent,
      vertexRadius: Number(vertexRadius.toFixed(4)),
      geometryUUID: form.geometry.uuid
    };
  });

  const geometryIds = new Set();
  const materialIds = new Set();
  const items = [];
  for (const [asteroid, mesh] of sceneObjects.rocks) {
    geometryIds.add(mesh.geometry.uuid);
    materialIds.add(mesh.material.uuid);
    items.push({
      radius: asteroid.radius,
      formId: mesh.userData.formId,
      scale: mesh.scale.x,
      maxRadius: mesh.geometry.userData.maxRadius,
      visualRadius: mesh.scale.x * mesh.geometry.userData.maxRadius
    });
  }

  return {
    forms,
    active: sceneObjects.rocks.size,
    uniqueGeometryIds: [...geometryIds],
    uniqueMaterialCount: materialIds.size,
    items
  };
}

function pickupDebugReport() {
  const items = [];
  const collect = (kind, cache) => {
    for (const [item, group] of cache) {
      const pickup = group.userData.pickup;
      if (!pickup) continue;
      items.push({
        kind,
        variant: pickup.variant,
        size: pickup.size,
        hasGlow: Boolean(group.userData.glow),
        beamOpacity: pickup.beam?.material.opacity ?? 0
      });
    }
  };
  collect("core", sceneObjects.cores);
  collect("powerUp", sceneObjects.powerUps);
  return { active: items.length, items };
}

function getDebugReport() {
  if (fxState) syncFx(fxState);
  const lights = scene.children.filter((child) => child.isLight).length;
  const rocks = rockDebugReport();
  const base = {
    fighter: null,
    lights,
    fx: {
      debrisGroups: fxPool.debris.length,
      shards: fxPool.debris.reduce((n, effect) => n + effect.objects.length, 0),
      sparks: fxPool.sparks.length,
      rings: fxPool.rings.length,
      flashes: fxPool.flashes.length,
      materials: Object.values(fxPool).flat().reduce((n, effect) => n + effect.objects.length, 0),
      stats: { ...fxStats },
      lights
    },
    rocks,
    pickups: pickupDebugReport(),
    world: worldSize ? { ...worldSize } : null,
    fence: false,
    environment: spaceEnvironment?.getDebugReport() ?? null,
    gates: lastGates
  };
  const fighter = shipGroup && currentSkin === "default" ? shipGroup.userData : null;
  if (!fighter || !fighter.hullRoot) return base;

  shipGroup.updateWorldMatrix(true, true);
  const { parts, hullRoot, materials, flames, ownTextures, navLights } = fighter;
  const flamePositions = (flames || []).map((flame) => {
    const position = new THREE.Vector3();
    flame.getWorldPosition(position);
    return roundVector(shipGroup.worldToLocal(position));
  });

  return {
    ...base,
    fighter: {
      bounds: localBounds(hullRoot, shipGroup),
      parts: {
        leftWing: localCenter(parts.leftWing, shipGroup),
        rightWing: localCenter(parts.rightWing, shipGroup),
        leftTail: localCenter(parts.leftTail, shipGroup),
        rightTail: localCenter(parts.rightTail, shipGroup),
        cockpit: localCenter(parts.cockpit, shipGroup),
        leftEngine: localCenter(parts.leftEngine, shipGroup),
        rightEngine: localCenter(parts.rightEngine, shipGroup)
      },
      hullColor: "#" + materials.hull.color.getHexString(),
      engineColor: "#" + materials.engine.color.getHexString(),
      flames: flamePositions,
      navLights: navLights || [],
      textureCount: (ownTextures || []).length
    }
  };
}

export function createWorld({ world, tuning, skin = "default", color = 0x8fe6ff }) {
  fxTuning = tuning;
  fxRingGeometry = new THREE.TorusGeometry(1, 0.08, 8, 32);
  fxRingGeometry.addEventListener("dispose", onFxRingDispose);
  worldSize = { width: world.width, height: world.height, depth: world.depth };
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("game"), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tuning.dprCap || 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;

  fighterEnvironment = createStudioEnvironment(renderer);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060f, tuning.fogDensity3d || 0.00016);

  camera = new THREE.PerspectiveCamera(tuning.fovDegrees || 62, 1, 1, 6000);

  sunLight = new THREE.DirectionalLight(0xfff3e0, 3.1);
  sunLight.position.set(-600, 900, -400);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 100;
  sunLight.shadow.camera.far = 3000;
  const shadowExtent = 900;
  Object.assign(sunLight.shadow.camera, {
    left: -shadowExtent,
    right: shadowExtent,
    top: shadowExtent,
    bottom: -shadowExtent
  });
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);

  rimLight = new THREE.DirectionalLight(0x62e4ff, 1.5);
  rimLight.position.set(700, -200, 600);
  scene.add(rimLight);

  // Fill from the opposite side so shadows never go fully black.
  const fill = new THREE.DirectionalLight(0x8fa6d8, 0.9);
  fill.position.set(500, 400, 800);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0x3a4a70, 1.8));

  rockSet = createRockSet({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  for (const form of rockSet.forms) form.geometry.addEventListener("dispose", onSharedGeometryDispose);
  pickupGlowTexture = makeGlowTexture();

  spaceEnvironment = createSpaceEnvironment({
    glowTexture: pickupGlowTexture,
    center: { x: world.width / 2, y: world.height / 2, z: world.depth / 2 }
  });
  scene.add(spaceEnvironment.group);
  spaceEnvironment.setTint("98,228,255");

  starField = buildStarField(2600);
  scene.add(starField);

  currentShipColor = color;
  currentSkin = skin;
  shipGroup = buildShip(color, skin);
  scene.add(shipGroup);

  scene.add(sceneObjects.gates);

  return {
    resize(width, height) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tuning.dprCap || 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    setShipColor(color) {
      currentShipColor = color;
      if (shipGroup) tintShip(shipGroup, color);
    },
    setShipVariant(name) {
      if (!shipGroup || name === currentSkin) return;
      currentSkin = name;
      scene.remove(shipGroup);
      for (const texture of shipGroup.userData.ownTextures || []) texture.dispose();
      disposeObject(shipGroup);
      shipGroup = buildShip(currentShipColor, name);
      scene.add(shipGroup);
    },
    getDebugReport,
    syncGates,
    setRegionTint(rgb) {
      const color = new THREE.Color(`rgb(${rgb})`);
      rimLight.color.copy(color);
      scene.fog.color.copy(color).multiplyScalar(0.06);
      spaceEnvironment?.setTint(rgb);
    },
    render(state, cameraState, dt) {
      // Ship pose: model faces +z, yaw turns right (matches makeBasis).
      // Positive roll (rotation.z) lifts the port (+x local) wing and dips the
      // starboard (-x local) wing.
      shipGroup.position.set(state.player.x, state.player.y, state.player.z);
      shipGroup.rotation.set(-state.player.pitch, -state.player.yaw, state.player.roll, "YXZ");
      if (shipGroup.userData.glow) {
        shipGroup.userData.glow.intensity = 60 + state.player.thrust * 140;
      }
      for (const flame of shipGroup.userData.flames) {
        const pulse = 0.9 + Math.sin(state.pulseTime * 30) * 0.08;
        flame.scale.y = (0.55 + state.player.thrust * 1.15) * pulse;
        flame.material.opacity = 0.28 + state.player.thrust * 0.5;
      }
      if (shipGroup.userData.ring) {
        shipGroup.userData.ring.rotation.z += dt * 1.4;
      }

      // Chase camera: further back so the ship reads as a craft, not a splinter.
      const basis = shipBasis(cameraState.yaw, cameraState.pitch);
      const back = tuning.cameraDistance || 430;
      const lift = tuning.cameraHeight || 130;
      camera.position.set(
        state.player.x - basis.forward.x * back + basis.up.x * lift,
        state.player.y - basis.forward.y * back + basis.up.y * lift,
        state.player.z - basis.forward.z * back + basis.up.z * lift
      );
      camera.lookAt(
        state.player.x + basis.forward.x * 520,
        state.player.y + basis.forward.y * 520,
        state.player.z + basis.forward.z * 520
      );

      spaceEnvironment?.update(camera, state.player, dt);
      starField.position.copy(camera.position);
      sunLight.position.set(camera.position.x - 600, camera.position.y + 900, camera.position.z - 400);
      sunLight.target.position.set(state.player.x, state.player.y, state.player.z);
      sunLight.target.updateMatrixWorld();

      syncDynamic(state);

      renderer.render(scene, camera);
    },
    dispose() {
      clearFx();
      fxRingGeometry.dispose();
      fxState = null;
      fxSource = null;
      disposeGateLabels();
      disposeObject(scene);
      starField?.material?.map?.dispose();
      spaceEnvironment?.dispose();
      spaceEnvironment = null;
      for (const texture of shipGroup?.userData.ownTextures || []) texture.dispose();
      if (fighterEnvironment) {
        fighterEnvironment.dispose();
        fighterEnvironment = null;
      }
      if (rockSet) {
        rockSet.dispose();
        rockSet = null;
      }
      if (pickupGlowTexture) pickupGlowTexture.dispose();
      renderer.dispose();
    }
  };
}

function shipBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return {
    forward: { x: -sy * cp, y: sp, z: cy * cp },
    up: { x: sy * sp, y: cp, z: cy * sp }
  };
}

function syncDynamic(state) {
  fxState = state;
  syncFx(state);
  const seenRocks = new Set();
  for (const asteroid of state.asteroids) {
    seenRocks.add(asteroid);
    syncRock({ asteroid });
  }
  for (const [asteroid, mesh] of sceneObjects.rocks) {
    if (seenRocks.has(asteroid)) continue;
    scene.remove(mesh);
    // Geometry and maps are shared by the whole set; only the clone is ours.
    mesh.material.dispose();
    sceneObjects.rocks.delete(asteroid);
  }

  syncPickups(state.cores, sceneObjects.cores, "core");
  syncPickups(state.powerUps, sceneObjects.powerUps, "powerUp");
  syncLasers(state.lasers);
  syncGates(state.routeChoice.gates);
}

function buildPickup(item, kind) {
  const radius = item.radius || 14;
  const group = createPickupModel({ kind, type: item.type, radius });
  const { signalColor } = group.userData.pickup;
  const width = Math.max(0.9, radius * 0.075);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(width, width, 190, 6, 1, true),
    new THREE.MeshBasicMaterial({
      color: signalColor,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  group.add(beam);
  group.userData.pickup.beam = beam;
  return group;
}

function syncPickups(items, cache, kind) {
  const seen = new Set();
  for (const item of items) {
    seen.add(item);
    let group = cache.get(item);
    if (!group) {
      group = buildPickup(item, kind);
      scene.add(group);
      cache.set(item, group);
    }
    const bob = Math.sin(item.pulse) * 4;
    const { body, variant } = group.userData.pickup;
    group.position.set(item.x, item.y + bob, item.z);
    if (variant === "shield") {
      body.rotation.y =
        Math.atan2(camera.position.x - item.x, camera.position.z - item.z) +
        Math.sin(item.pulse * 0.7) * 0.16;
    } else {
      body.rotation.y = item.pulse * (variant === "core" ? 0.8 : 0.55);
    }
  }
  for (const [item, group] of cache) {
    if (seen.has(item)) continue;
    scene.remove(group);
    disposeObject(group);
    cache.delete(item);
  }
}

function syncLasers(lasers) {
  const seen = new Set();
  for (const laser of lasers) {
    seen.add(laser);
    let mesh = sceneObjects.lasers.get(laser);
    if (!mesh) {
      const material = new THREE.MeshBasicMaterial({ color: 0xaef4ff });
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 6), material);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(laser.vx, laser.vy, laser.vz).normalize()
      );
      scene.add(mesh);
      sceneObjects.lasers.set(laser, mesh);
    }
    mesh.position.set(laser.x, laser.y, laser.z);
  }
  for (const [laser, mesh] of sceneObjects.lasers) {
    if (seen.has(laser)) continue;
    scene.remove(mesh);
    disposeObject(mesh);
    sceneObjects.lasers.delete(laser);
  }
}

function gateLabelTexture(gate) {
  const text = gate.label || "";
  const cached = gateLabelCache.get(gate.regionId);
  if (cached && cached.text === text && cached.tint === gate.tint) return cached.texture;
  cached?.texture.dispose();

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  let size = 72;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  while (size > 32 && g.measureText(text).width > 960) {
    size -= 4;
    g.font = `600 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  }
  g.fillStyle = `rgb(${gate.tint})`;
  g.shadowColor = "rgba(0,0,0,0.85)";
  g.shadowBlur = 16;
  g.fillText(text, 512, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  gateLabelCache.set(gate.regionId, { texture, text, tint: gate.tint });
  return texture;
}

function releaseUnusedGateLabels(gates) {
  const keep = new Set(gates.map((gate) => gate.regionId));
  for (const [id, entry] of gateLabelCache) {
    if (keep.has(id)) continue;
    entry.texture.dispose();
    gateLabelCache.delete(id);
  }
}

function disposeGateLabels() {
  for (const entry of gateLabelCache.values()) entry.texture.dispose();
  gateLabelCache.clear();
  lastGates = [];
}

function disposeGateGroup(group) {
  const ring = group.children[0];
  ring.geometry.dispose();
  ring.material.dispose();
  group.children[1].material.dispose();
  // shortcut: shared Sprite geometry is left alive, dispose it if three.js stops sharing it
}

function syncGates(gates) {
  lastGates = gates.map((gate) => ({
    regionId: gate.regionId,
    label: gate.label,
    hasLabel: Boolean(gate.label)
  }));
  while (sceneObjects.gates.children.length > gates.length) {
    const child = sceneObjects.gates.children.pop();
    disposeGateGroup(child);
  }
  gates.forEach((gate, index) => {
    let group = sceneObjects.gates.children[index];
    if (!group) {
      group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        emissiveIntensity: 1.6,
        metalness: 0.4,
        roughness: 0.3
      });
      group.add(new THREE.Mesh(new THREE.TorusGeometry(52, 5, 12, 42), material));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false
      }));
      sprite.position.y = 90;
      sprite.scale.set(240, 30, 1);
      group.add(sprite);
      sceneObjects.gates.add(group);
    }
    const ring = group.children[0];
    const sprite = group.children[1];
    ring.material.color.set(`rgb(${gate.tint})`);
    ring.material.emissive.set(`rgb(${gate.tint})`);
    const texture = gateLabelTexture(gate);
    if (sprite.material.map !== texture) {
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
    }
    group.position.set(gate.x, gate.y, gate.z);
    ring.rotation.y = gate.age || 0;
  });
  releaseUnusedGateLabels(gates);
}
