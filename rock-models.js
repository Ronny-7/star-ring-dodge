// Procedural asteroid forms. Ported from the approved asset study, scaled to
// 256px maps so the whole set stays cheap to build while keeping the same
// strata and crater scale.

import * as THREE from "three";

const TEXTURE_SIZE = 256;
const TEXTURE_SCALE = TEXTURE_SIZE / 512;

function createRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

function hash3(x, y, z) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let u = x - ix;
  let v = y - iy;
  let w = z - iz;
  u *= u * (3 - 2 * u);
  v *= v * (3 - 2 * v);
  w *= w * (3 - 2 * w);
  const a = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u);
  const b = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u);
  const c = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u);
  const d = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}

function fbm3(x, y, z) {
  let total = 0;
  let weight = 0.5;
  for (let i = 0; i < 5; i += 1) {
    total += (noise3(x, y, z) * 2 - 1) * weight;
    x = x * 2.03 + 13.1;
    y = y * 2.03 + 7.7;
    z = z * 2.03 - 4.3;
    weight *= 0.5;
  }
  return total;
}

function makeRockTexture(seedOffset, palette, anisotropy) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const image = g.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const broad = fbm3(u * 7 + seedOffset, v * 6 - seedOffset, seedOffset * 0.17);
      const strata = Math.sin((v * 7 + broad * 0.7 + Math.sin(u * 4 + seedOffset) * 0.08) * Math.PI * 2);
      const grain = fbm3(u * 62 + seedOffset, v * 57 + seedOffset * 2, seedOffset * 0.3);
      const mineral = fbm3(u * 19, v * 23, seedOffset);
      const value = 0.5 + broad * 0.2 + strata * 0.075 + grain * 0.095 + mineral * 0.055;
      const p = (y * size + x) * 4;
      image.data[p] = Math.max(15, Math.min(255, palette[0] * value));
      image.data[p + 1] = Math.max(15, Math.min(255, palette[1] * value));
      image.data[p + 2] = Math.max(15, Math.min(255, palette[2] * value));
      image.data[p + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  const rand = createRandom(Math.round(seedOffset * 1000003));
  for (let i = 0; i < 42; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = (4 + rand() * 25) * TEXTURE_SCALE;
    const grad = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.08, x, y, r);
    grad.addColorStop(0, "rgba(35,36,35,.8)");
    grad.addColorStop(0.65, "rgba(75,74,68,.36)");
    grad.addColorStop(1, "rgba(205,198,178,.18)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.55 + rand() * 0.65), rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, anisotropy));
  return texture;
}

function makeRockBump(seedOffset, anisotropy) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const image = g.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm3((x / 38) * TEXTURE_SCALE + seedOffset, (y / 42) * TEXTURE_SCALE - seedOffset, seedOffset * 0.3);
      const grain = fbm3((x / 7) * TEXTURE_SCALE, (y / 8) * TEXTURE_SCALE, seedOffset * 2);
      const band = Math.sin(((y / 48) * TEXTURE_SCALE + n * 3 + Math.sin((x / 73) * TEXTURE_SCALE) * 0.18) * Math.PI * 2) * 0.5;
      const pits = Math.pow(
        Math.max(0, noise3((x / 21) * TEXTURE_SCALE + seedOffset, (y / 23) * TEXTURE_SCALE, seedOffset) - 0.73),
        1.6
      ) * -0.65;
      const value = Math.max(0, Math.min(255, 132 + n * 72 + grain * 35 + band * 25 + pits * 180));
      const p = (y * size + x) * 4;
      image.data[p] = value;
      image.data[p + 1] = value;
      image.data[p + 2] = value;
      image.data[p + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, anisotropy));
  return texture;
}

function makeRockGeometry(id, stretch, seedOffset, dents) {
  const geometry = new THREE.IcosahedronGeometry(1, 16);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const original = new THREE.Vector3().fromBufferAttribute(position, i).normalize();
    const macro = fbm3(original.x * 3.5 + seedOffset, original.y * 3.5, original.z * 3.5 - seedOffset);
    const mid = fbm3(original.x * 11 - seedOffset, original.y * 12 + seedOffset, original.z * 11);
    const fine = fbm3(original.x * 35 + seedOffset, original.y * 33, original.z * 37);
    let radius = 1 + macro * 0.27 + mid * 0.055 + fine * 0.012;
    if (id === "angular") {
      for (const [x, y, z, offset] of [[1, 0.2, 0.3, 0.85], [-0.7, 0.4, 0.1, 0.91], [0.2, -0.8, 0.5, 0.9], [0.2, 0.2, -1, 0.86]]) {
        const normal = new THREE.Vector3(x, y, z).normalize();
        const dot = original.dot(normal);
        if (dot > 0) radius = Math.min(radius, offset / dot);
      }
    }
    for (const dent of dents) {
      const direction = new THREE.Vector3(...dent.direction).normalize();
      const angular = 1 - original.dot(direction);
      const pit = Math.exp(-angular * angular / (dent.width * dent.width));
      const rim = Math.exp(-((angular - dent.width * 1.9) ** 2) / (dent.width * 0.55) ** 2);
      radius -= pit * dent.depth;
      radius += rim * dent.depth * 0.23;
    }
    const ridge = Math.sin((original.x * 2.5 + original.y * 1.2 + original.z * 3.1 + seedOffset) * 5.4 + macro * 1.8);
    radius += Math.pow(Math.max(0, ridge), 5) * 0.023;
    position.setXYZ(i, original.x * radius * stretch[0], original.y * radius * stretch[1], original.z * radius * stretch[2]);
  }

  // IcosahedronGeometry duplicates triangle corners; average coincident
  // normals so the heavy detail does not read as faceted.
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  const sums = new Map();
  const keys = [];
  for (let i = 0; i < position.count; i += 1) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => Math.round(v * 1e5)).join(":");
    keys.push(key);
    const sum = sums.get(key) || new THREE.Vector3();
    sum.add(new THREE.Vector3().fromBufferAttribute(normals, i));
    sums.set(key, sum);
  }
  for (const value of sums.values()) value.normalize();
  for (let i = 0; i < position.count; i += 1) {
    const n = sums.get(keys[i]);
    normals.setXYZ(i, n.x, n.y, n.z);
  }

  // Fit the whole form inside the unit sphere so mesh.scale = asteroid.radius
  // makes the visual radius equal the collision radius.
  let maxRadius = 0;
  for (let i = 0; i < position.count; i += 1) {
    maxRadius = Math.max(maxRadius, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  }
  const fit = 1 / maxRadius;
  for (let i = 0; i < position.count; i += 1) {
    position.setXYZ(i, position.getX(i) * fit, position.getY(i) * fit, position.getZ(i) * fit);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());

  geometry.userData.maxRadius = 1;
  geometry.userData.maxHalfExtent = Math.max(size.x, size.y, size.z) / 2;
  return geometry;
}

const rockDefinitions = [
  {
    id: "angular",
    stretch: [1.25, 0.95, 1.05],
    seed: 2.1,
    palette: [155, 148, 135],
    dents: [
      { direction: [0.45, 0.65, 0.62], width: 0.24, depth: 0.14 },
      { direction: [-0.72, 0.08, 0.35], width: 0.17, depth: 0.1 },
      { direction: [0.05, -0.76, -0.4], width: 0.2, depth: 0.09 }
    ]
  },
  {
    id: "elongated",
    stretch: [1.62, 0.77, 0.72],
    seed: 7.3,
    palette: [146, 139, 127],
    dents: [
      { direction: [0.1, 0.9, 0.2], width: 0.19, depth: 0.1 },
      { direction: [-0.68, -0.25, 0.4], width: 0.23, depth: 0.13 },
      { direction: [0.73, 0.05, -0.5], width: 0.16, depth: 0.08 }
    ]
  },
  {
    id: "fractured",
    stretch: [1.2, 0.82, 0.75],
    seed: 12.7,
    palette: [137, 132, 124],
    dents: [
      { direction: [0.2, 0.2, 1], width: 0.32, depth: 0.32 },
      { direction: [-0.64, 0.42, 0.1], width: 0.16, depth: 0.1 },
      { direction: [0.42, -0.7, -0.25], width: 0.22, depth: 0.18 },
      { direction: [-0.25, 0.15, -0.9], width: 0.13, depth: 0.08 }
    ]
  }
];

export function createRockSet({ anisotropy = 1 } = {}) {
  const forms = rockDefinitions.map((definition) => {
    const colorMap = makeRockTexture(definition.seed, definition.palette, anisotropy);
    const bumpMap = makeRockBump(definition.seed, anisotropy);
    const material = new THREE.MeshStandardMaterial({
      color: 0xe6e3db,
      map: colorMap,
      bumpMap,
      bumpScale: 0.065,
      roughnessMap: bumpMap,
      roughness: 1,
      metalness: 0,
      flatShading: false,
      envMapIntensity: 0.12
    });
    const geometry = makeRockGeometry(definition.id, definition.stretch, definition.seed, definition.dents);
    return { id: definition.id, geometry, material, colorMap, bumpMap };
  });

  return {
    forms,
    dispose() {
      for (const form of forms) {
        form.geometry.dispose();
        form.material.dispose();
        form.colorMap.dispose();
        form.bumpMap.dispose();
      }
    }
  };
}
