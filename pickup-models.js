// Shared pickup models. World pickups and the model gallery both build their
// rewards from here, so the silhouettes cannot drift apart.
//
// Models are modelled in study units and scaled by radius / 4 so the visual
// size stays close to the collision radius.

import * as THREE from "three";

export const PICKUP_COLORS = {
  core: 0x63d9ad,
  shield: 0x649fee,
  double: 0xe9b161
};

const DARK = 0x1a2228;
const TRIM = 0x3a454d;
const PAINT = 0x252d32;

function makeMaterials(signalColor) {
  return {
    dark: new THREE.MeshStandardMaterial({
      color: DARK,
      metalness: 0.6,
      roughness: 0.45,
      flatShading: true
    }),
    trim: new THREE.MeshStandardMaterial({
      color: TRIM,
      metalness: 0.75,
      roughness: 0.38,
      flatShading: true
    }),
    paint: new THREE.MeshStandardMaterial({
      color: PAINT,
      metalness: 0.5,
      roughness: 0.5,
      flatShading: true
    }),
    signal: new THREE.MeshBasicMaterial({ color: signalColor, toneMapped: false })
  };
}

function hexShape(radiusX, radiusY = radiusX) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function addMesh(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function buildCore(body, materials) {
  addMesh(body, new THREE.CylinderGeometry(1.7, 1.7, 5.6, 6), materials.dark);
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.CylinderGeometry(2, 2, 0.65, 6), materials.trim, [0, side * 3, 0]);
    addMesh(body, new THREE.CylinderGeometry(1.76, 1.76, 0.15, 6), materials.signal, [0, side * 3.4, 0]);
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const rail = addMesh(
      body,
      new THREE.BoxGeometry(0.21, 4.8, 0.18),
      materials.signal,
      [Math.sin(angle) * 1.75, 0, Math.cos(angle) * 1.75]
    );
    rail.rotation.y = angle;
  }
  addMesh(body, new THREE.OctahedronGeometry(0.7, 0), materials.signal, [0, 3.9, 0]);
}

function buildShield(body, materials) {
  const plate = new THREE.ExtrudeGeometry(hexShape(3.4), {
    depth: 0.65,
    bevelEnabled: true,
    bevelSize: 0.2,
    bevelThickness: 0.17,
    bevelSegments: 1
  });
  plate.center();
  addMesh(body, plate, materials.dark);

  const panel = new THREE.ExtrudeGeometry(hexShape(1.6, 1.7), {
    depth: 0.18,
    bevelEnabled: true,
    bevelSize: 0.12,
    bevelThickness: 0.1,
    bevelSegments: 1
  });
  panel.center();
  addMesh(body, panel, materials.signal, [0, 0, 0.65]);

  addMesh(body, new THREE.TorusGeometry(4, 0.12, 4, 6), materials.trim);
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.BoxGeometry(0.17, 1.6, 0.12), materials.signal, [side * 2.8, 0, 0.55]);
  }
}

function buildDouble(body, materials) {
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.CylinderGeometry(1, 1, 5.1, 8), materials.dark, [side * 1.65, 0, 0]);
    for (const end of [-1, 1]) {
      addMesh(body, new THREE.CylinderGeometry(1.15, 1.15, 0.5, 8), materials.trim, [
        side * 1.65,
        end * 2.7,
        0
      ]);
    }
  }
  addMesh(body, new THREE.BoxGeometry(0.5, 3.5, 0.2), materials.signal, [0, 0, 1]);
  addMesh(body, new THREE.CylinderGeometry(0.85, 0.85, 0.12, 8), materials.signal, [0, 3, 0]);
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.BoxGeometry(3.4, 0.6, 1), materials.paint, [0, side * 1.1, 0]);
  }
}

export function createPickupModel({ kind, type, radius = 14 }) {
  const variant = kind === "core" ? "core" : type === "shield" ? "shield" : "double";
  const signalColor = PICKUP_COLORS[variant];
  const materials = makeMaterials(signalColor);

  const body = new THREE.Group();
  if (variant === "core") buildCore(body, materials);
  else if (variant === "shield") buildShield(body, materials);
  else buildDouble(body, materials);
  body.scale.setScalar(radius / 4);

  const group = new THREE.Group();
  group.add(body);
  body.updateWorldMatrix(true, true);
  const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  const round2 = (value) => Math.round(value * 100) / 100;

  group.userData.pickup = {
    variant,
    body,
    signalColor,
    size: { x: round2(size.x), y: round2(size.y), z: round2(size.z) }
  };
  return group;
}
