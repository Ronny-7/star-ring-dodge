import * as THREE from "three";
import { createShipMaterials } from "./ship-materials.js";

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
  group.userData = { materials, hullRoot, parts, flames, navLights, ownTextures: [hullTexture] };

  // Clone the tessellation, then reflect the mesh, preserving every diagonal.
  const wingGeometry = panelGeometry([
    [0, 48], [86, -12], [86, -20], [65, -28], [55, -20],
    [36, -38], [25, -29], [12, -40], [0, -31]
  ], 5.5, 0.8);
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const wing = add(hullRoot, wingGeometry.clone(), hull, [0, 0, 0], `${prefix}-flying-wing`);
    wing.scale.x = side;
    parts[`${prefix}Wing`] = wing;

    const tail = add(hullRoot, panelGeometry([
      [15, -30], [25, -23], [35, -32], [35, -36], [25, -27], [15, -36]
    ], 0.45, 0.18), edge, [0, 3.45, 0], `${prefix}-trailing-elevon`);
    tail.scale.x = side;
    parts[`${prefix}Tail`] = tail;

    const skin = add(hullRoot, panelGeometry([
      [9, 32], [76, -12], [66, -17], [45, -4], [18, 17]
    ], 0.18, 0.12), edge, [0, 3.65, 0], `${prefix}-leading-edge-skin`);
    skin.scale.x = side;
    const marking = add(hullRoot, panelGeometry([
      [46, -8], [48, -9.4], [54, -13.3], [52, -12]
    ], 0.1, 0.05), lowVis, [0, 3.15, 0], `${prefix}-low-vis-marking`);
    marking.scale.x = side;

    // Exhaust bays are recessed trenches in the wing surface, not slabs on top:
    // a thin dark infill sits below the hull skin, framed by a raised edge rail.
    add(hullRoot, panelGeometry([
      [6, 12], [18, 5], [21, -26], [5, -26]
    ], 0.5, 0.12), duct, [0, 2.45, 0], `${prefix}-recessed-exhaust-bay`).scale.x = side;
    add(hullRoot, panelGeometry([
      [7.4, 10.5], [16.6, 4.4], [19.4, -25], [6.4, -25], [6.4, -23.8], [18.2, -23.8], [15.6, 4], [8.2, 9.4]
    ], 0.9, 0.16), edge, [0, 2.9, 0], `${prefix}-exhaust-bay-rail`).scale.x = side;
    const rim = add(hullRoot, new THREE.TorusGeometry(3.7, 0.6, 8, 24), edge,
      [side * 13, 3.6, -27], `${prefix}-nozzle-rim`);
    rim.scale.y = 0.53;
    const recess = add(hullRoot, new THREE.CircleGeometry(3.5, 24), duct,
      [side * 13, 3.6, -26.8], `${prefix}-nozzle-recess`);
    recess.rotation.y = Math.PI;
    recess.scale.y = 0.53;
    const core = add(hullRoot, new THREE.CircleGeometry(2.4, 24), engine,
      [side * 13, 3.6, -26.95], `${prefix}-engine-core`);
    core.rotation.y = Math.PI;
    core.scale.y = 0.42;
    parts[`${prefix}Engine`] = core;
    for (const [radius, length] of [[3.1, 29], [1.5, 18]]) {
      const flame = flameBuilder(group, side * 13, 3.6, -27.6, radius, length);
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
  ], 2.6, 1.05), hull, [0, 4.4, 0], "dorsal-fairing");
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
  }
  parts.cockpit = add(hullRoot, new THREE.SphereGeometry(1, 32, 20), canopy,
    [0, 6.1, 25], "blended-low-canopy");
  parts.cockpit.scale.set(6.2, 1.9, 10.5);
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
