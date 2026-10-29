import * as THREE from "three";
import { createShipMaterials } from "./ship-materials.js";

export function createSaucerModel({ color, environment, hullTexture }) {
  const group = new THREE.Group();
  const hullRoot = new THREE.Group();
  group.add(hullRoot);
  const materials = createShipMaterials({ color, environment, hullTexture });
  const { hull, dark, edge, canopy, engine, navRed, navGreen } = materials;
  hull.color.set(0x87919b);
  hull.emissive.set(0x000000);
  dark.color.set(0x202833);
  dark.emissive.set(0x000000);
  edge.color.set(0x52606b);
  edge.emissiveIntensity = 0;
  canopy.color.set(0x132733);
  canopy.emissive.set(0x000000);
  for (const material of [hull, dark, edge, canopy]) material.envMap = environment;

  const parts = {};
  const navLights = [];
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const ring = (radius, thickness, y, material) => {
    const mesh = add(hullRoot, new THREE.TorusGeometry(radius, thickness, 6, 80), material, 0, y);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };

  // Reuse one tessellation, rotated by pi, for exactly mirrored half shells.
  for (const side of [-1, 1]) {
    const upper = new THREE.CylinderGeometry(34, 54, 8, 40, 1, false, 0, Math.PI);
    upper.translate(-27, 0, 0);
    const wing = add(hullRoot, upper, hull, side * 27, 6);
    if (side < 0) wing.rotation.y = Math.PI;
    parts[side < 0 ? "leftWing" : "rightWing"] = wing;
    const lower = add(hullRoot, new THREE.CylinderGeometry(50, 30, 6, 40, 1, false, 0, Math.PI), dark, 0, -5);
    if (side < 0) lower.rotation.y = Math.PI;
  }
  ring(28, 0.45, 10.3, dark);
  ring(44, 0.5, 6.5, edge);
  ring(51, 1.1, 0, dark);
  // Outer armour band: ties the eight nacelle collars into one continuous rim.
  ring(55.5, 1.6, 1.2, hull);
  ring(55.5, 0.3, 4.6, edge);

  // Nacelles sit in the rim rather than on spokes: each is short, mostly buried
  // in the hull, with a blister collar blending it into the disc face. All eight
  // are identical, so one set of geometries is built and reused eight times.
  const collarGeometry = new THREE.CylinderGeometry(8.6, 10.4, 5.5, 14, 1, false);
  const nacelleGeometry = new THREE.CylinderGeometry(5.4, 6.4, 12.5, 12, 1, true);
  const nacelleDuctGeometry = new THREE.CylinderGeometry(4.4, 4.4, 11.6, 12);
  const nacelleLipGeometry = new THREE.TorusGeometry(5.0, 0.75, 6, 12);
  const nacelleCoreGeometry = new THREE.CylinderGeometry(3.4, 3.4, 0.5, 12);
  const nacelleGrilleGeometry = new THREE.BoxGeometry(0.6, 0.8, 6);
  const jointGeometry = new THREE.BoxGeometry(0.45, 0.3, 17);
  const panelGeometry = new THREE.BoxGeometry(7, 0.6, 5);
  const panelGrooveGeometry = new THREE.BoxGeometry(0.5, 0.3, 4);
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.PI / 8 + i * Math.PI / 4;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    const collar = add(hullRoot, collarGeometry, hull, x * 51, 0.6, z * 51);
    collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z));
    const nacelle = add(hullRoot, nacelleGeometry, hull, x * 51.5, -0.5, z * 51.5);
    nacelle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z));
    add(nacelle, nacelleDuctGeometry, dark);
    const lip = add(nacelle, nacelleLipGeometry, edge, 0, 6.2);
    lip.rotation.x = Math.PI / 2;
    add(nacelle, nacelleCoreGeometry, engine, 0, 5.6);
    for (const offset of [-2.2, 0, 2.2]) {
      add(nacelle, nacelleGrilleGeometry, dark, offset, 6.4);
    }
    if (i === 2) parts.rightEngine = nacelle;
    if (i === 5) parts.leftEngine = nacelle;
    if (i === 3) parts.rightTail = nacelle;
    if (i === 4) parts.leftTail = nacelle;

    // Narrow radial joints and inset inspection panels break up the armour face.
    const joint = add(hullRoot, jointGeometry, dark, x * 43, 6.5, z * 43);
    joint.rotation.set(0.38, angle, 0, "YXZ");
    const panel = add(hullRoot, panelGeometry, dark, x * 27, 10.3, z * 27);
    panel.rotation.y = angle;
    for (const offset of [-2, 0, 2]) {
      add(panel, panelGrooveGeometry, edge, offset, 0.4);
    }
  }

  parts.cockpit = add(hullRoot, new THREE.SphereGeometry(19, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), canopy, 0, 10);
  parts.cockpit.scale.y = 0.6;
  ring(19.4, 1.1, 10, dark);
  ring(19.5, 0.35, 11, engine);
  const gearGeometry = new THREE.BoxGeometry(4, 3, 11);
  for (let i = 0; i < 3; i += 1) {
    const angle = i * Math.PI * 2 / 3;
    const gear = add(hullRoot, gearGeometry, edge, Math.sin(angle) * 26, -9, Math.cos(angle) * 26);
    gear.rotation.y = angle;
  }
  const navGeometry = new THREE.SphereGeometry(1.6, 12, 8);
  for (const side of [-1, 1]) {
    const material = side > 0 ? navRed : navGreen;
    add(hullRoot, navGeometry, material, side * 54, 3, 7);
    navLights.push({ color: "#" + material.color.getHexString(), x: side * 54 });
  }

  group.userData = {
    hullRoot, parts, materials, navLights, flames: [], ownTextures: [hullTexture],
    bounds: new THREE.Box3().setFromObject(hullRoot).getSize(new THREE.Vector3()),
    applyLivery(nextColor) {
      engine.color.set(nextColor).lerp(new THREE.Color(0xffffff), 0.25);
      for (const flame of group.userData.flames) {
        flame.material.color.set(nextColor).lerp(new THREE.Color(0xffffff), 0.35);
      }
    }
  };
  group.userData.applyLivery(color);
  return group;
}
