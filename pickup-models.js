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
      metalness: 0.48,
      roughness: 0.58
    }),
    trim: new THREE.MeshStandardMaterial({
      color: TRIM,
      metalness: 0.68,
      roughness: 0.43
    }),
    paint: new THREE.MeshStandardMaterial({
      color: PAINT,
      metalness: 0.5,
      roughness: 0.56
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

function addMesh(parent, geometry, material, position, name) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function buildCore(body, materials) {
  const shell = new THREE.LatheGeometry(
    [[0, -3.4], [1.55, -3.4], [1.95, -3.12], [1.95, -2.72], [1.72, -2.55],
      [1.72, 2.55], [1.95, 2.72], [1.95, 3.12], [1.55, 3.4], [0, 3.4]]
      .map(([radius, height]) => new THREE.Vector2(radius, height)), 12);
  addMesh(body, shell, materials.dark, undefined, "core-shell");
  const collar = new THREE.LatheGeometry(
    [[1.67, -0.22], [2.04, -0.20], [2.22, -0.06], [2.22, 0.06], [2.04, 0.20], [1.67, 0.22], [1.67, -0.22]]
      .map(([radius, height]) => new THREE.Vector2(radius, height)), 12);
  addMesh(body, collar, materials.trim, undefined, "core-collar");
  const terminalSignal = new THREE.CylinderGeometry(1.5, 1.5, 0.08, 12);
  for (const side of [-1, 1]) {
    addMesh(body, terminalSignal, materials.signal, [0, side * 3.42, 0], "core-terminal-signal");
  }
  const railGeometry = new THREE.BoxGeometry(0.26, 4.8, 0.065);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const rail = addMesh(
      body,
      railGeometry,
      materials.signal,
      [Math.sin(angle) * 1.74, 0, Math.cos(angle) * 1.74],
      "core-energy-window"
    );
    rail.rotation.y = angle;
  }
  addMesh(body, new THREE.CylinderGeometry(0.7, 0.9, 0.32, 12), materials.trim,
    [0, 3.49, 0], "core-contact");
}

function buildShield(body, materials) {
  const plate = new THREE.ExtrudeGeometry(hexShape(3.4), {
    depth: 0.7,
    bevelEnabled: true,
    bevelSize: 0.15,
    bevelThickness: 0.12,
    bevelSegments: 2
  });
  plate.center();
  addMesh(body, plate, materials.dark, undefined, "shield-backing");

  const rim = hexShape(4.25);
  rim.holes.push(hexShape(3.05));
  const frame = new THREE.ExtrudeGeometry(rim, {
    depth: 0.75, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.07, bevelSegments: 2
  });
  frame.center();
  addMesh(body, frame, materials.trim, [0, 0, 0.08], "shield-frame");

  const panel = new THREE.ExtrudeGeometry(hexShape(2.15, 2.25), {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.04,
    bevelSegments: 2
  });
  panel.center();
  for (const side of [-1, 1]) {
    addMesh(body, panel, materials.signal, [0, 0, side * 0.47], "shield-inset-panel");
    addMesh(body, new THREE.BoxGeometry(0.17, 1.6, 0.08), materials.signal, [side * 2.8, 0, 0.48]);
  }
}

function buildDouble(body, materials) {
  const cellGeometry = new THREE.LatheGeometry(
    [[0, -3.05], [0.78, -3.05], [1.13, -2.85], [1.13, -2.58], [1, -2.4],
      [1, 2.4], [1.13, 2.58], [1.13, 2.85], [0.78, 3.05], [0, 3.05]]
      .map(([radius, height]) => new THREE.Vector2(radius, height)), 12);
  const signalGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.06, 12);
  const windowGeometry = new THREE.BoxGeometry(0.32, 4.5, 0.06);
  for (const side of [-1, 1]) {
    addMesh(body, cellGeometry, materials.dark, [side * 1.65, 0, 0], "double-cell");
    for (const end of [-1, 1]) {
      addMesh(body, signalGeometry, materials.signal, [side * 1.65, end * 3.06, 0], "double-terminal-signal");
    }
    for (const face of [-1, 1]) {
      addMesh(body, windowGeometry, materials.signal, [side * 1.65, 0, face * 0.985], "double-energy-window");
    }
  }
  const bridgeShape = new THREE.Shape();
  [[-1.92, -0.32], [1.92, -0.32], [2.06, 0], [1.92, 0.32], [-1.92, 0.32], [-2.06, 0]]
    .forEach(([x, y], index) => index ? bridgeShape.lineTo(x, y) : bridgeShape.moveTo(x, y));
  bridgeShape.closePath();
  const bridgeGeometry = new THREE.ExtrudeGeometry(bridgeShape, {
    depth: 0.65, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2
  });
  bridgeGeometry.center();
  const fastenerGeometry = new THREE.CylinderGeometry(0.21, 0.21, 0.07, 6);
  fastenerGeometry.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    addMesh(body, bridgeGeometry, materials.paint, [0, side * 1.1, 0], "double-bridge");
    addMesh(body, fastenerGeometry, materials.trim, [0, side * 1.1, 0.395], "double-bridge-fastener");
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
  const detail = {
    shell: true,
    frame: variant === "shield",
    connectorCount: variant === "double" ? 2 : 0,
    componentCount: body.children.length
  };

  group.userData.pickup = {
    variant,
    body,
    signalColor,
    size: { x: round2(size.x), y: round2(size.y), z: round2(size.z) },
    detail
  };
  return group;
}
