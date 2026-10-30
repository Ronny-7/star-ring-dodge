import * as THREE from "three";
import { createShipMaterials } from "./ship-materials.js?v=4.7.0";

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

  // A shallow ventral body gives the wing a real centre mass instead of a
  // paper-thin silhouette when the landing model rotates.
  const ventralFuselage = add(hullRoot, new THREE.CapsuleGeometry(5.2, 30, 4, 12), dark,
    [0, -1.8, 2], "ventral-fuselage");
  ventralFuselage.rotation.x = Math.PI / 2;
  ventralFuselage.scale.z = 1.08;

  // Clone the tessellation, then reflect the mesh, preserving every diagonal.
  const wingGeometry = panelGeometry([
    [0, 48], [86, -12], [86, -20], [65, -28], [55, -20],
    [36, -38], [25, -29], [12, -40], [0, -31]
  ], 5.5, 0.8);
  // Measured upper surface of the wing extrusion: depth 5.5 plus 0.8 bevel on
  // both faces. Everything sitting on the wing is positioned from this constant
  // so details cannot float or sink when the outline changes.
  const SKIN_Y = 3.55;
  const DETAIL_Y = SKIN_Y + 0.46;
  const NOZZLE_Y = DETAIL_Y + 0.1;
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const wing = add(hullRoot, wingGeometry.clone(), hull, [0, 0, 0], `${prefix}-flying-wing`);
    wing.scale.x = side;
    parts[`${prefix}Wing`] = wing;

    const leadingEdge = add(hullRoot, panelGeometry([
      [0, 48], [86, -12], [82, -12], [0, 43]
    ], 1.2, 0.35), edge, [0, SKIN_Y + 1.05, 0], `${prefix}-leading-edge-cap`);
    leadingEdge.scale.x = side;

    const tail = add(hullRoot, panelGeometry([
      [15, -30], [25, -23], [35, -32], [35, -36], [25, -27], [15, -36]
    ], 0.45, 0.18), edge, [0, DETAIL_Y, 0], `${prefix}-trailing-elevon`);
    tail.scale.x = side;
    parts[`${prefix}Tail`] = tail;

    const marking = add(hullRoot, panelGeometry([
      [46, -8], [48, -9.4], [54, -13.3], [52, -12]
    ], 0.1, 0.05), lowVis, [0, DETAIL_Y, 0], `${prefix}-low-vis-marking`);
    marking.scale.x = side;

    // Access hatches sit flat on the skin. Earlier thin diagonal "seam strips"
    // read as loose debris rather than panel lines, so the plate detail comes
    // from the hatches and the grid panel below instead.
    add(hullRoot, panelGeometry([
      [12, 26], [22, 20], [21.2, 18.4], [11.2, 24.4]
    ], 0.06, 0.02), dark, [0, DETAIL_Y, 0], `${prefix}-access-hatch`).scale.x = side;
    add(hullRoot, panelGeometry([
      [52, -18], [64, -24], [63.2, -25.4], [51.2, -19.4]
    ], 0.05, 0.02), dark, [0, DETAIL_Y, 0], `${prefix}-outboard-hatch`).scale.x = side;
    detail.panelAccentCount += 2;
    for (const [sx, sz] of [[26, 14], [38, 2], [50, -10]]) {
      add(hullRoot, panelGeometry([
        [sx, sz], [sx + 3.4, sz - 1.9], [sx + 3.2, sz - 2.4], [sx - 0.2, sz + 0.3]
      ], 0.05, 0.018), edge, [0, DETAIL_Y, 0], `${prefix}-service-panel`).scale.x = side;
      detail.panelAccentCount += 1;
    }

    // The wing is a solid extrusion, so a bay cannot be cut into it. Instead the
    // dark panel is the outermost surface at that footprint, and the rails stand
    // proud around it; the rail shadow is what reads as depth.
    const bayOutline = [
      [6, 12], [18, 5], [21, -26], [5, -26]
    ];
    add(hullRoot, panelGeometry(bayOutline, 0.12, 0.05), duct,
      [0, DETAIL_Y + 0.03, 0], `${prefix}-recessed-exhaust-bay`).scale.x = side;
    const bayInner = [[7.2, 10], [16.8, 4.3], [19.7, -24.7], [6.3, -24.7]];
    const rails = new THREE.Group();
    rails.name = `${prefix}-exhaust-bay-rail`;
    rails.scale.x = side;
    hullRoot.add(rails);
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      add(rails, panelGeometry([bayOutline[i], bayOutline[next], bayInner[next], bayInner[i]],
        0.16, 0.04), edge, [0, DETAIL_Y + 0.06, 0], `${prefix}-exhaust-bay-rail-${i}`);
    }
    const rim = add(hullRoot, new THREE.TorusGeometry(3.7, 0.6, 8, 24), edge,
      [side * 13, NOZZLE_Y, -27], `${prefix}-nozzle-rim`);
    rim.scale.y = 0.53;
    const recess = add(hullRoot, new THREE.CircleGeometry(3.5, 24), duct,
      [side * 13, NOZZLE_Y, -26.8], `${prefix}-nozzle-recess`);
    recess.rotation.y = Math.PI;
    recess.scale.y = 0.53;
    const core = add(hullRoot, new THREE.CircleGeometry(2.4, 24), engine,
      [side * 13, NOZZLE_Y, -26.95], `${prefix}-engine-core`);
    core.rotation.y = Math.PI;
    core.scale.y = 0.42;
    parts[`${prefix}Engine`] = core;
    const nozzleLip = add(hullRoot, new THREE.TorusGeometry(2.8, 0.22, 8, 20), edge,
      [side * 13, NOZZLE_Y, -27.1], `${prefix}-nozzle-lip`);
    nozzleLip.scale.y = 0.48;
    const nozzleBaffle = add(hullRoot, new THREE.BoxGeometry(0.5, 2.5, 0.18), lowVis,
      [side * 13, NOZZLE_Y, -27.18], `${prefix}-nozzle-baffle`);
    nozzleBaffle.rotation.z = side * 0.3;
    detail.nozzleCoreCount += 1;
    for (const [radius, length] of [[3.1, 29], [1.5, 18]]) {
      const flame = flameBuilder(group, side * 13, NOZZLE_Y, -27.6, radius, length);
      flame.scale.x = 1.2;
      flame.castShadow = true;
      flame.receiveShadow = true;
    }
    const navMaterial = side > 0 ? navRed : navGreen;
    add(hullRoot, new THREE.SphereGeometry(1.05, 12, 8), navMaterial,
      [side * 84.5, 3.9, -15.5], `${prefix}-navigation-light`);
    navLights.push({ color: "#" + navMaterial.color.getHexString(), x: side * 84.5 });
  }
  wingGeometry.dispose();

  // Dorsal fairing: a low hull-coloured spine with dark intake recesses, so it
  // reads as structure blended into the wing rather than a slab bolted on top.
  add(hullRoot, panelGeometry([
    [0, 34], [7.4, 20], [8.6, -8], [6.4, -21], [-6.4, -21], [-8.6, -8], [-7.4, 20]
  ], 1.8, 0.55), hull, [0, 5.15, 0], "dorsal-fairing");
  add(hullRoot, panelGeometry([
    [-5.2, 15], [5.2, 15], [5.8, 6], [-5.8, 6]
  ], 0.5, 0.18), duct, [0, 6.3, 0], "dorsal-intake-recess");
  add(hullRoot, panelGeometry([
    [-5.4, 6], [5.4, 6], [5.0, 2.6], [-5.0, 2.6]
  ], 0.35, 0.14), dark, [0, 6.15, 0], "dorsal-intake-throat");
  for (const side of [-1, 1]) {
    add(hullRoot, panelGeometry([
      [3.4, 30], [7.2, 19], [7.8, -6], [6.2, -17], [5.6, -17], [7.0, -6], [6.4, 19], [3.0, 29]
    ], 0.22, 0.08), edge, [0, 5.75, 0], `${side < 0 ? "left" : "right"}-fairing-shoulder`)
      .scale.x = side;
  }
  for (let z = 7.5; z < 14.5; z += 1.9) {
    add(hullRoot, panelGeometry([[-5.0, z], [5.0, z], [5.0, z + 0.3], [-5.0, z + 0.3]],
      0.14, 0.04), edge, [0, 6.55, 0], "intake-louver");
    detail.intakeLouverCount += 1;
  }
  parts.cockpit = add(hullRoot, new THREE.SphereGeometry(1, 32, 20), canopy,
    [0, 6.1, 25], "blended-low-canopy");
  parts.cockpit.scale.set(6.2, 1.9, 10.5);
  const canopyFrame = add(hullRoot, new THREE.TorusGeometry(1, 0.16, 8, 24), edge,
    [0, 6.25, 25], "canopy-frame");
  canopyFrame.scale.set(6.25, 1.95, 1);
  detail.canopyFrame = true;
  add(hullRoot, panelGeometry([[-1, 18], [1, 18], [1, 21], [-1, 21]],
    0.1, 0.05), livery, [0, 7.3, 0], "low-vis-livery");

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
