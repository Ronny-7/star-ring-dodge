// Procedural asteroid forms ported from the approved asset study.
// Shared 256px spherical maps keep strata and relief aligned without a UV seam.

import * as THREE from "three";

const TEXTURE_SIZE = 256;

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

function makeRockMaps(definition, anisotropy) {
  const size = TEXTURE_SIZE;
  const canvases = [document.createElement("canvas"), document.createElement("canvas")];
  canvases.forEach((canvas) => { canvas.width = size; canvas.height = size; });
  const [colorContext, reliefContext] = canvases.map((canvas) => canvas.getContext("2d"));
  const colorData = colorContext.createImageData(size, size), relief = reliefContext.createImageData(size, size);
  const seed = definition.seed;
  const mineralTint = [12, 9, 5];
  const dents = definition.dents.map((dent) => ({ ...dent, direction: new THREE.Vector3(...dent.direction).normalize() }));
  for (let y = 0; y < size; y += 1) {
    const latitude = y * Math.PI / (size - 1), ring = Math.sin(latitude), py = Math.cos(latitude);
    for (let x = 0; x < size; x += 1) {
      const longitude = x * Math.PI * 2 / (size - 1);
      const px = ring * Math.cos(longitude), pz = -ring * Math.sin(longitude);
      const broad = fbm3(px * 3.5 + seed, py * 3.5, pz * 3.5 - seed);
      const grain = fbm3(px * 54 + seed, py * 51 - seed, pz * 57);
      const mineral = fbm3(px * 15 - seed, py * 17, pz * 14 + seed);
      const strata = Math.sin((py * 8 + px * 0.65 + broad * 0.65) * Math.PI);
      const crack = Math.max(0, 1 - Math.abs(noise3(px * 12 + seed, py * 12, pz * 12 - seed) - 0.5) * 60);
      let height = 0.5 + broad * 0.22 + strata * 0.045 + grain * 0.065 - crack * 0.075;
      let value = 0.57 + broad * 0.19 + strata * 0.055 + grain * 0.08 - crack * 0.095;
      for (const dent of dents) {
        const angular = 1 - (px * dent.direction.x + py * dent.direction.y + pz * dent.direction.z);
        const pit = Math.exp(-angular * angular / (dent.width * dent.width));
        const rim = Math.exp(-(((angular - dent.width * 1.9) / (dent.width * 0.55)) ** 2));
        height += (-pit + rim * 0.23) * dent.depth * 0.55;
        value += (-pit * 0.12 + rim * 0.04) * dent.depth;
      }
      const p = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        colorData.data[p + channel] = THREE.MathUtils.clamp(definition.palette[channel] * value + mineral * mineralTint[channel], 15, 255);
      }
      const roughness = THREE.MathUtils.clamp(0.9 + grain * 0.09 + crack * 0.035 - Math.abs(mineral) * 0.08, 0.72, 0.98);
      // Three reads bump height from R and roughness from G; no third map is needed.
      relief.data[p] = relief.data[p + 2] = THREE.MathUtils.clamp(height * 255, 0, 255);
      relief.data[p + 1] = roughness * 255;
      colorData.data[p + 3] = relief.data[p + 3] = 255;
    }
  }
  colorContext.putImageData(colorData, 0, 0); reliefContext.putImageData(relief, 0, 0);
  const colorMap = new THREE.CanvasTexture(canvases[0]), bumpMap = new THREE.CanvasTexture(canvases[1]);
  colorMap.colorSpace = THREE.SRGBColorSpace; bumpMap.colorSpace = THREE.NoColorSpace;
  for (const texture of [colorMap, bumpMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, Math.max(1, anisotropy));
  }
  return { colorMap, bumpMap };
}

function makeRockGeometry(id, stretch, seedOffset, dents) {
  const geometry = new THREE.IcosahedronGeometry(1, 12);
  const position = geometry.attributes.position;
  const planes = [[1, 0.2, 0.3, 0.85], [-0.7, 0.4, 0.1, 0.91], [0.2, -0.8, 0.5, 0.9], [0.2, 0.2, -1, 0.86]]
    .map(([x, y, z, offset]) => ({ normal: new THREE.Vector3(x, y, z).normalize(), offset }));
  const preparedDents = dents.map((dent) => ({ ...dent, direction: new THREE.Vector3(...dent.direction).normalize() }));
  const fractureNormal = new THREE.Vector3(0.35, 0.1, 1).normalize();
  for (let i = 0; i < position.count; i += 1) {
    const original = new THREE.Vector3().fromBufferAttribute(position, i).normalize();
    const macro = fbm3(original.x * 3.5 + seedOffset, original.y * 3.5, original.z * 3.5 - seedOffset);
    const mid = fbm3(original.x * 11 - seedOffset, original.y * 12 + seedOffset, original.z * 11);
    const fine = fbm3(original.x * 35 + seedOffset, original.y * 33, original.z * 37);
    let radius = 1 + macro * 0.27 + mid * 0.055 + fine * 0.012;
    if (id === "angular") {
      for (const plane of planes) {
        const dot = original.dot(plane.normal);
        if (dot > 0) radius = Math.min(radius, plane.offset / dot);
      }
    }
    for (const dent of preparedDents) {
      const angular = 1 - original.dot(dent.direction);
      const pit = Math.exp(-angular * angular / (dent.width * dent.width));
      const rim = Math.exp(-((angular - dent.width * 1.9) ** 2) / (dent.width * 0.55) ** 2);
      radius -= pit * dent.depth;
      radius += rim * dent.depth * 0.23;
    }
    const ridge = Math.sin((original.x * 2.5 + original.y * 1.2 + original.z * 3.1 + seedOffset) * 5.4 + macro * 1.8);
    radius += Math.pow(Math.max(0, ridge), 5) * 0.023;
    if (id === "fractured") {
      const dot = original.dot(fractureNormal);
      if (dot > 0) radius = Math.min(radius, (0.38 + mid * 0.01) / dot);
    }
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
    stretch: [1.2, 0.82, 0.85],
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
    const { colorMap, bumpMap } = makeRockMaps(definition, anisotropy);
    const material = new THREE.MeshStandardMaterial({
      color: 0xe6e3db,
      map: colorMap,
      bumpMap,
      bumpScale: 0.045,
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
