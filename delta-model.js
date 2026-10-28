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

    // Shallow trapezoidal ducts blend into the wing; no external engine pods.
    const fairing = add(hullRoot, panelGeometry([
      [6, 12], [18, 5], [21, -26], [5, -26]
    ], 4, 1.1), dark, [0, 4, 0], `${prefix}-recessed-exhaust-bay`);
    fairing.scale.x = side;
    const rim = add(hullRoot, new THREE.TorusGeometry(3.7, 0.6, 8, 24), edge,
      [side * 13, 5.1, -27], `${prefix}-nozzle-rim`);
    rim.scale.y = 0.53;
    const recess = add(hullRoot, new THREE.CircleGeometry(3.5, 24), duct,
      [side * 13, 5.1, -26.8], `${prefix}-nozzle-recess`);
    recess.rotation.y = Math.PI;
    recess.scale.y = 0.53;
    const core = add(hullRoot, new THREE.CircleGeometry(2.4, 24), engine,
      [side * 13, 5.1, -26.95], `${prefix}-engine-core`);
    core.rotation.y = Math.PI;
    core.scale.y = 0.42;
    parts[`${prefix}Engine`] = core;
    for (const [radius, length] of [[3.1, 29], [1.5, 18]]) {
      const flame = flameBuilder(group, side * 13, 5.1, -27.6, radius, length);
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

  add(hullRoot, panelGeometry([
    [0, 32], [8, 17], [10, -14], [6, -22], [-6, -22], [-10, -14], [-8, 17]
  ], 5, 1.4), dark, [0, 4.5, 0], "dorsal-intake-weapons-bay");
  add(hullRoot, panelGeometry([
    [-5, 14], [5, 14], [6, 5], [-6, 5]
  ], 0.25, 0.2), duct, [0, 8.5, 0], "dorsal-intake-recess");
  for (let z = 6; z < 14; z += 2) {
    add(hullRoot, panelGeometry([[-5, z], [5, z], [5, z + 0.35], [-5, z + 0.35]],
      0.15, 0.05), edge, [0, 8.8, 0], "intake-louver");
  }
  parts.cockpit = add(hullRoot, new THREE.SphereGeometry(1, 32, 20), canopy,
    [0, 5, 27], "blended-low-canopy");
  parts.cockpit.scale.set(6.8, 2.15, 11.5);
  add(hullRoot, panelGeometry([[-1, 18], [1, 18], [1, 21], [-1, 21]],
    0.1, 0.05), livery, [0, 7.1, 0], "low-vis-livery");

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
