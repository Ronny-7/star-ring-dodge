// WebGL renderer for the 3D room. Loaded as a module so three.js can be
// imported; the rest of the game stays classic scripts on window.
import * as THREE from "three";

const sceneObjects = {
  rocks: new Map(),
  cores: new Map(),
  powerUps: new Map(),
  lasers: new Map(),
  gates: new THREE.Group(),
  ship: null,
  stars: null,
  fence: null
};

let renderer = null;
let scene = null;
let camera = null;
let starField = null;
let roomFence = null;
let shipGroup = null;
let sunLight = null;
let rimLight = null;

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

function makeRockTexture(seed) {
  // Baked craters and mineral speckle: real geometry shelves would cost too
  // much for hundreds of rocks, so detail lives in the albedo map.
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");

  g.fillStyle = "#8a8f9c";
  g.fillRect(0, 0, size, size);

  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  for (let i = 0; i < 900; i += 1) {
    const shade = 90 + rand() * 110;
    g.fillStyle = `rgba(${shade},${shade + 2},${shade + 8},${0.25 + rand() * 0.3})`;
    const r = 1 + rand() * 5;
    g.beginPath();
    g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    g.fill();
  }

  for (let i = 0; i < 26; i += 1) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 6 + rand() * 26;
    const crater = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    crater.addColorStop(0, "rgba(38,42,52,0.8)");
    crater.addColorStop(0.7, "rgba(78,84,98,0.5)");
    crater.addColorStop(1, "rgba(190,196,210,0.18)");
    g.fillStyle = crater;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  return texture;
}

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

/* ---------- 场景搭建 ---------- */

function buildStarField(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    // Stars sit on a large shell so they never parallax out of position.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 2400 + Math.random() * 900;
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

function buildRoomFence(world) {
  const geometry = new THREE.BoxGeometry(world.width, world.depth, world.height);
  const material = new THREE.MeshBasicMaterial({
    color: 0x62e4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.045
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(world.width / 2, world.depth / 2, world.height / 2);
  return mesh;
}

function buildShip(color) {
  const group = new THREE.Group();
  const base = new THREE.Color(color);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(0.75),
    metalness: 0.8,
    roughness: 0.26,
    emissive: base.clone().multiplyScalar(0.28)
  });
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(0.45),
    metalness: 0.9,
    roughness: 0.3,
    emissive: base.clone().multiplyScalar(0.1)
  });

  // Nose cone along +z.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(11, 46, 20), hullMaterial);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 34;
  nose.castShadow = true;
  group.add(nose);

  // Main fuselage, tapered toward the tail.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 54, 20), hullMaterial);
  body.rotation.x = Math.PI / 2;
  body.position.z = -6;
  body.castShadow = true;
  group.add(body);

  // Swept wings: tapered boxes with a dihedral, not flat plates.
  for (const side of [-1, 1]) {
    const wingGeometry = new THREE.BoxGeometry(62, 3.2, 34);
    const position = wingGeometry.attributes.position;
    // Taper the outer edge so the wing narrows toward the tip.
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      if (x * side > 0) position.setZ(i, position.getZ(i) * 0.55);
    }
    position.needsUpdate = true;
    wingGeometry.computeVertexNormals();

    const wing = new THREE.Mesh(wingGeometry, panelMaterial);
    wing.position.set(side * 36, -2, -4);
    wing.rotation.z = side * 0.2;
    wing.rotation.y = side * -0.22;
    wing.castShadow = true;
    group.add(wing);

    // Wingtip running light.
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: side > 0 ? 0x8affd1 : 0xff8ea1 })
    );
    tip.position.set(side * 64, -2 + side * 0.2 * 0, -10);
    group.add(tip);
  }

  // Cockpit canopy.
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(8.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x0a1626,
      metalness: 1,
      roughness: 0.05,
      emissive: base.clone().multiplyScalar(0.2)
    })
  );
  glass.position.set(0, 6.5, 16);
  glass.scale.set(0.85, 0.8, 1.7);
  group.add(glass);

  // Twin engines with visible glow cores.
  const engineCore = new THREE.MeshBasicMaterial({
    color: base.clone().lerp(new THREE.Color(0xffffff), 0.55)
  });
  for (const x of [-13, 13]) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 20, 14), panelMaterial);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(x, 0, -36);
    housing.castShadow = true;
    group.add(housing);

    const core = new THREE.Mesh(new THREE.SphereGeometry(4.6, 12, 12), engineCore);
    core.position.set(x, 0, -45);
    group.add(core);
  }

  const glow = new THREE.PointLight(base, 110, 340, 2);
  glow.position.set(0, 0, -40);
  group.add(glow);
  group.userData.glow = glow;

  return group;
}

function syncRock(entry) {
  let mesh = sceneObjects.rocks.get(entry.asteroid);
  if (!mesh) {
    const texture = makeRockTexture(Math.floor(Math.random() * 1e9));
    // Mineral tint is a hint, not the base colour: blend it toward neutral
    // rock so the field reads as stone instead of coloured marbles.
    const tint = new THREE.Color(`rgb(${entry.asteroid.mineralTint})`).lerp(new THREE.Color(0xa8adba), 0.72);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: 0.8,
      color: tint,
      metalness: 0.12,
      roughness: 0.88
    });
    mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    sceneObjects.rocks.set(entry.asteroid, mesh);
  }

  const a = entry.asteroid;
  mesh.position.set(a.x, a.y, a.z);
  mesh.scale.setScalar(a.radius);
  mesh.rotation.y = a.rotation;
  mesh.material.emissiveIntensity = a.hitFlash > 0 ? a.hitFlash * 0.8 : (a.elite ? 0.18 : 0);

  return mesh;
}

export function createWorld({ world, tuning }) {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("game"), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tuning.dprCap || 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060f, 0.00032);

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

  scene.add(new THREE.AmbientLight(0x3a4a70, 2.4));

  starField = buildStarField(2600);
  scene.add(starField);

  roomFence = buildRoomFence(world);
  scene.add(roomFence);

  shipGroup = buildShip(0x8fe6ff);
  shipGroup.scale.setScalar(1.6);
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
      const c = new THREE.Color(color);
      shipGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material.emissive) {
          child.material.emissive.copy(c).multiplyScalar(0.14);
          if (child.material.color) child.material.color.copy(c).multiplyScalar(0.5);
        }
      });
      if (shipGroup.userData.glow) shipGroup.userData.glow.color.copy(c);
    },
    setRegionTint(rgb) {
      const color = new THREE.Color(`rgb(${rgb})`);
      rimLight.color.copy(color);
      roomFence.material.color.copy(color);
      scene.fog.color.copy(color).multiplyScalar(0.06);
    },
    render(state, cameraState, dt) {
      // Ship pose: the model faces +z, matching our yaw convention.
      shipGroup.position.set(state.player.x, state.player.y, state.player.z);
      shipGroup.rotation.set(-state.player.pitch, state.player.yaw, -state.player.roll, "YXZ");
      if (shipGroup.userData.glow) {
        shipGroup.userData.glow.intensity = 60 + state.player.thrust * 140;
      }

      // Chase camera: further back so the ship reads as a craft, not a splinter.
      const basis = shipBasis(cameraState.yaw, cameraState.pitch);
      const back = 430;
      const lift = 130;
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

      starField.position.copy(camera.position);
      sunLight.position.set(camera.position.x - 600, camera.position.y + 900, camera.position.z - 400);
      sunLight.target.position.set(state.player.x, state.player.y, state.player.z);
      sunLight.target.updateMatrixWorld();

      syncDynamic(state);

      renderer.render(scene, camera);
    },
    dispose() {
      disposeObject(scene);
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
    forward: { x: sy * cp, y: sp, z: cy * cp },
    up: { x: -sy * sp, y: cp, z: -cy * sp }
  };
}

function syncDynamic(state) {
  const seenRocks = new Set();
  for (const asteroid of state.asteroids) {
    seenRocks.add(asteroid);
    syncRock({ asteroid });
  }
  for (const [asteroid, mesh] of sceneObjects.rocks) {
    if (seenRocks.has(asteroid)) continue;
    scene.remove(mesh);
    disposeObject(mesh);
    sceneObjects.rocks.delete(asteroid);
  }

  syncPickups(state.cores, sceneObjects.cores, 0x8affd1, 12);
  syncPickups(state.powerUps, sceneObjects.powerUps, 0xffb59e, 14);
  syncLasers(state.lasers);
  syncGates(state.routeChoice.gates);
}

function syncPickups(items, cache, color, size) {
  const seen = new Set();
  for (const item of items) {
    seen.add(item);
    let mesh = cache.get(item);
    if (!mesh) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 2.2,
        metalness: 0.2,
        roughness: 0.3
      });
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), material);
      scene.add(mesh);
      cache.set(item, mesh);
    }
    mesh.position.set(item.x, item.y, item.z);
    mesh.rotation.y = item.pulse;
    mesh.rotation.x = item.pulse * 0.6;
  }
  for (const [item, mesh] of cache) {
    if (seen.has(item)) continue;
    scene.remove(mesh);
    disposeObject(mesh);
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

function syncGates(gates) {
  while (sceneObjects.gates.children.length > gates.length) {
    const child = sceneObjects.gates.children.pop();
    disposeObject(child);
  }
  gates.forEach((gate, index) => {
    let ring = sceneObjects.gates.children[index];
    if (!ring) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(`rgb(${gate.tint})`),
        emissive: new THREE.Color(`rgb(${gate.tint})`),
        emissiveIntensity: 1.6,
        metalness: 0.4,
        roughness: 0.3
      });
      ring = new THREE.Mesh(new THREE.TorusGeometry(52, 5, 12, 42), material);
      sceneObjects.gates.add(ring);
    }
    ring.position.set(gate.x, gate.y, gate.z);
    ring.rotation.y = gate.age || 0;
  });
}