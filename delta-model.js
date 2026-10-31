import * as THREE from "three";
import { createShipMaterials } from "./ship-materials.js?v=4.7.2";

function add(parent, geometry, material, position, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function panelGeometry(outline, depth, bevel = 0.6) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 1, steps: 1
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(Math.PI / 2);
  // World-unit extrusion UVs otherwise repeat the whole panel atlas per unit.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 90, uv.getY(i) / 90);
  return geometry;
}

const SPAN = [[0, -31], [12, -40], [25, -29], [36, -38], [55, -20], [65, -28], [86, -20]];

function wingSection(x) {
  const span = THREE.MathUtils.clamp(Math.abs(x), 0, 86);
  const index = SPAN.findIndex(([next]) => next >= span);
  const [ax, az] = SPAN[Math.max(0, index - 1)];
  const [bx, bz] = SPAN[index];
  return { front: 48 - span * 60 / 86, back: THREE.MathUtils.lerp(az, bz, (span - ax) / (bx - ax || 1)) };
}

function wingSurface(x, z) {
  const { front, back } = wingSection(x);
  const chord = THREE.MathUtils.clamp((front - z) / (front - back), 0, 1);
  const camber = Math.sin(chord * Math.PI) * (1 - Math.abs(x) * 0.8 / 86);
  return { top: 0.35 + 3.2 * camber, bottom: -0.35 - 2.3 * camber };
}

function flyingWingGeometry() {
  const spans = [0, 6, 12, 18.5, 25, 30.5, 36, 45.5, 55, 60, 65, 75.5, 86];
  const chords = [0, 0.08, 0.25, 0.48, 0.72, 0.94, 1];
  const vertices = [], uvs = [], indices = [];
  for (const face of ["top", "bottom"]) {
    for (const x of spans) {
      const { front, back } = wingSection(x);
      for (const chord of chords) {
        const z = THREE.MathUtils.lerp(front, back, chord);
        vertices.push(x, wingSurface(x, z)[face], z);
        uvs.push(x / 90, (48 - z) / 90);
      }
    }
  }
  const row = chords.length, half = spans.length * row;
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let span = 0; span < spans.length - 1; span++) {
    for (let chord = 0; chord < row - 1; chord++) {
      const a = span * row + chord, b = a + row;
      quad(a, b, b + 1, a + 1);
      quad(a + half, a + 1 + half, b + 1 + half, b + half);
    }
    const a = span * row, b = a + row;
    quad(a, a + half, b + half, b);
    quad(a + row - 1, b + row - 1, b + row - 1 + half, a + row - 1 + half);
  }
  for (let chord = 0; chord < row - 1; chord++) {
    quad(chord, chord + 1, chord + 1 + half, chord + half);
    const a = half - row + chord;
    quad(a, a + half, a + 1 + half, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addFlame(group, x, y, z, radius, length) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 10, 1, true), material);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(x, y, z - length / 2);
  group.add(flame);
  group.userData.flames.push(flame);
  return flame;
}

// The game injects its existing exhaust helper; the default also supports standalone model consumers.
export function createDeltaModel({ color, environment, hullTexture }, flameBuilder = addFlame) {
  const materials = createShipMaterials({ color, environment, hullTexture });
  // The legacy factory aliases edge/livery and lowVis/dark; separate their finishes locally.
  materials.edge = materials.hull.clone();
  materials.lowVis = materials.dark.clone();
  materials.canopy.dispose();
  materials.canopy = new THREE.MeshPhysicalMaterial({
    color: 0x111e26, metalness: 0.32, roughness: 0.13,
    clearcoat: 1, clearcoatRoughness: 0.09, envMap: environment
  });
  const { hull, dark, edge, lowVis, canopy, livery, engine, duct, navRed, navGreen } = materials;
  hull.color.set(0xa5adb0);
  hull.emissive.set(0x000000);
  hull.metalness = 0.38;
  hull.roughness = 0.65;
  dark.color.set(0x30393e);
  dark.emissive.set(0x000000);
  dark.roughness = 0.62;
  edge.color.set(0x68767d);
  edge.emissive.set(0x000000);
  edge.roughness = 0.52;
  lowVis.color.set(0x727364);
  lowVis.emissive.set(0x000000);
  canopy.color.set(0x111e26);
  canopy.emissive.set(0x000000);
  livery.emissiveIntensity = 0.12;
  for (const material of new Set(Object.values(materials))) {
    if (material.isMeshStandardMaterial) {
      material.envMap = environment;
      material.envMapIntensity = material === canopy ? 1.15 : 0.5;
    }
  }

  const group = new THREE.Group();
  const hullRoot = new THREE.Group();
  group.add(hullRoot);
  const parts = {};
  const flames = [];
  const navLights = [];
  const detail = {
    canopyFrame: false,
    intakeLouverCount: 0,
    nozzleCoreCount: 0,
    panelAccentCount: 0
  };
  group.userData = { materials, hullRoot, parts, flames, navLights, detail, ownTextures: [hullTexture] };

  const skinPanel = (outline, depth, material, name, lift = 0.04) => {
    const source = panelGeometry(outline, depth, Math.min(depth / 3, 0.08));
    const positions = [], uvs = [];
    const emit = (a, b, c, level) => {
      const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
      if (level && Math.max(ab, bc, ca) > 10) {
        // Split only the long edge: thin trim does not need four-way tessellation.
        if (bc >= ab && bc >= ca) [a, b, c] = [b, c, a];
        else if (ca >= ab && ca >= bc) [a, b, c] = [c, a, b];
        const middle = a.clone().lerp(b, 0.5);
        emit(a, middle, c, level - 1); emit(middle, b, c, level - 1);
      } else {
        for (const p of [a, b, c]) {
          positions.push(p.x, p.y + wingSurface(p.x, p.z).top + lift, p.z);
          uvs.push(p.x / 90, (48 - p.z) / 90);
        }
      }
    };
    const p = source.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      emit(a, b, c, 4);
    }
    source.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return add(hullRoot, geometry, material, [0, 0, 0], name);
  };

  // A shallow ventral body gives the wing a real centre mass instead of a
  // paper-thin silhouette when the landing model rotates.
  const ventralFuselage = add(hullRoot, new THREE.CapsuleGeometry(5.2, 30, 4, 12), dark,
    [0, -1.8, 2], "ventral-fuselage");
  ventralFuselage.rotation.x = Math.PI / 2;
  ventralFuselage.scale.z = 1.08;

  // Clone the tessellation, then reflect the mesh, preserving every diagonal.
  const wingGeometry = flyingWingGeometry();
  const NOZZLE_Y = 1.25;
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const wing = add(hullRoot, wingGeometry.clone(), hull, [0, 0, 0], `${prefix}-flying-wing`);
    wing.scale.x = side;
    parts[`${prefix}Wing`] = wing;

    const leadingEdge = skinPanel([
      [0, 48], [86, -12], [82, -12], [0, 43]
    ], 0.12, edge, `${prefix}-leading-edge-cap`);
    leadingEdge.scale.x = side;

    const tail = skinPanel([
      [15, -30], [25, -23], [35, -32], [35, -36], [25, -27], [15, -36]
    ], 0.12, edge, `${prefix}-trailing-elevon`);
    tail.scale.x = side;
    parts[`${prefix}Tail`] = tail;

    const marking = skinPanel([
      [46, -8], [48, -9.4], [54, -13.3], [52, -12]
    ], 0.04, lowVis, `${prefix}-low-vis-marking`);
    marking.scale.x = side;

    // Access hatches sit flat on the skin. Earlier thin diagonal "seam strips"
    // read as loose debris rather than panel lines, so the plate detail comes
    // from the hatches and the grid panel below instead.
    skinPanel([
      [12, 26], [22, 20], [21.2, 18.4], [11.2, 24.4]
    ], 0.06, dark, `${prefix}-access-hatch`).scale.x = side;
    skinPanel([
      [52, -18], [64, -24], [63.2, -25.4], [51.2, -19.4]
    ], 0.05, dark, `${prefix}-outboard-hatch`).scale.x = side;
    detail.panelAccentCount += 2;
    for (const [sx, sz] of [[26, 14], [38, 2], [50, -10]]) {
      skinPanel([
        [sx, sz], [sx + 3.4, sz - 1.9], [sx + 3.2, sz - 2.4], [sx - 0.2, sz + 0.3]
      ], 0.05, edge, `${prefix}-service-panel`).scale.x = side;
      detail.panelAccentCount += 1;
    }

    // The slot and its raised lips follow the same skin rather than hovering over it.
    const bayOutline = [
      [8, 9], [16, 4], [18, -33], [7, -33]
    ];
    skinPanel(bayOutline, 0.05, duct, `${prefix}-recessed-exhaust-bay`, 0.1).scale.x = side;
    const bayInner = [[8.5, 8], [15.4, 3.7], [17.4, -32.4], [7.6, -32.4]];
    const rails = new THREE.Group();
    rails.name = `${prefix}-exhaust-bay-rail`;
    rails.scale.x = side;
    hullRoot.add(rails);
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const rail = skinPanel([bayOutline[i], bayOutline[next], bayInner[next], bayInner[i]],
        0.16, edge, `${prefix}-exhaust-bay-rail-${i}`, 0.18);
      rails.add(rail);
    }
    const rim = add(hullRoot, new THREE.TorusGeometry(3.7, 0.6, 8, 24), edge,
      [side * 13, NOZZLE_Y, -36], `${prefix}-nozzle-rim`);
    rim.scale.y = 0.53;
    const recess = add(hullRoot, new THREE.CircleGeometry(3.5, 24), duct,
      [side * 13, NOZZLE_Y, -35.8], `${prefix}-nozzle-recess`);
    recess.rotation.y = Math.PI;
    recess.scale.y = 0.53;
    const core = add(hullRoot, new THREE.CircleGeometry(2.4, 24), engine,
      [side * 13, NOZZLE_Y, -35.95], `${prefix}-engine-core`);
    core.rotation.y = Math.PI;
    core.scale.y = 0.42;
    parts[`${prefix}Engine`] = core;
    const nozzleLip = add(hullRoot, new THREE.TorusGeometry(2.8, 0.22, 8, 20), edge,
      [side * 13, NOZZLE_Y, -36.1], `${prefix}-nozzle-lip`);
    nozzleLip.scale.y = 0.48;
    const nozzleBaffle = add(hullRoot, new THREE.BoxGeometry(0.5, 2.5, 0.18), lowVis,
      [side * 13, NOZZLE_Y, -36.18], `${prefix}-nozzle-baffle`);
    nozzleBaffle.rotation.z = side * 0.3;
    detail.nozzleCoreCount += 1;
    for (const [radius, length] of [[3.1, 29], [1.5, 18]]) {
      const flame = flameBuilder(group, side * 13, NOZZLE_Y, -36.6, radius, length);
      flame.scale.x = 1.2;
      flame.castShadow = true;
      flame.receiveShadow = true;
    }
    const navMaterial = side > 0 ? navRed : navGreen;
    add(hullRoot, new THREE.SphereGeometry(1.05, 12, 8), navMaterial,
      [side * 84.5, 0.55, -15.5], `${prefix}-navigation-light`);
    navLights.push({ color: "#" + navMaterial.color.getHexString(), x: side * 84.5 });
  }
  wingGeometry.dispose();

  const fairing = add(hullRoot, new THREE.CapsuleGeometry(4.3, 44, 6, 20), hull,
    [0, 3, 8], "dorsal-fairing");
  fairing.geometry.rotateX(Math.PI / 2);
  fairing.scale.set(2, 0.75, 1);
  const fairingRoof = (x, z) => {
    const cap = Math.max(0, Math.abs(z - 8) - 22);
    return 3 + 0.75 * Math.sqrt(Math.max(0, 4.3 ** 2 - (x / 2) ** 2 - cap ** 2));
  };
  add(hullRoot, panelGeometry([
    [-5.2, 15], [5.2, 15], [5.8, 6], [-5.8, 6]
  ], 0.5, 0.18), duct, [0, 6.3, 0], "dorsal-intake-recess");
  add(hullRoot, panelGeometry([
    [-5.4, 6], [5.4, 6], [5.0, 2.6], [-5.0, 2.6]
  ], 0.35, 0.14), dark, [0, 6.15, 0], "dorsal-intake-throat");
  for (let z = 7.5; z < 14.5; z += 1.9) {
    add(hullRoot, panelGeometry([[-5.0, z], [5.0, z], [5.0, z + 0.3], [-5.0, z + 0.3]],
      0.14, 0.04), edge, [0, 6.55, 0], "intake-louver");
    detail.intakeLouverCount += 1;
  }
  // Keep each lip's crown offset while seating its edges on the rounded shoulders.
  for (const mesh of hullRoot.children.filter((part) => ["dorsal-intake-recess", "dorsal-intake-throat", "intake-louver"].includes(part.name))) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + fairingRoof(positions.getX(i), positions.getZ(i)) - 6.225);
    }
    mesh.geometry.computeVertexNormals();
  }
  parts.cockpit = add(hullRoot, new THREE.SphereGeometry(1, 32, 20), canopy,
    [0, 5.6, 22], "blended-low-canopy");
  parts.cockpit.scale.set(5.3, 1.7, 8.5);
  const canopyFrame = add(hullRoot, new THREE.TorusGeometry(1, 0.08, 8, 24), edge,
    [0, 0, 22], "canopy-frame");
  canopyFrame.geometry.rotateX(Math.PI / 2);
  canopyFrame.scale.set(5.1, 1, 8.6);
  const framePosition = canopyFrame.geometry.attributes.position;
  for (let i = 0; i < framePosition.count; i++) {
    const x = framePosition.getX(i) * 5.1, z = framePosition.getZ(i) * 8.6 + 22;
    framePosition.setY(i, framePosition.getY(i) + fairingRoof(x, z) + 0.035);
  }
  canopyFrame.geometry.computeVertexNormals();
  detail.canopyFrame = true;
  const markingGeometry = new THREE.PlaneGeometry(2, 3, 2, 4);
  markingGeometry.rotateX(-Math.PI / 2);
  markingGeometry.translate(0, 0, 19.5);
  const marking = add(hullRoot, markingGeometry, livery, [0, 0, 0], "low-vis-livery");
  const markingPosition = marking.geometry.attributes.position;
  for (let i = 0; i < markingPosition.count; i++) {
    const x = markingPosition.getX(i), z = markingPosition.getZ(i);
    const glass = 5.6 + 1.7 * Math.sqrt(Math.max(0, 1 - (x / 5.3) ** 2 - ((z - 22) / 8.5) ** 2));
    markingPosition.setY(i, markingPosition.getY(i) + glass + 0.018);
  }
  marking.geometry.computeVertexNormals();

  group.userData.applyLivery = (nextColor) => {
    const tint = new THREE.Color(nextColor);
    livery.color.copy(tint);
    livery.emissive.copy(tint);
    engine.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.25);
    for (const flame of flames) flame.material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.35);
  };
  group.userData.applyLivery(color);
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(hullRoot).getSize(new THREE.Vector3());
  group.userData.bounds = { x: bounds.x, y: bounds.y, z: bounds.z };
  return group;
}
