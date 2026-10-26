import * as THREE from "three";

// Port of the approved v4 study fighter. The study faces -Z with the exhaust
// at +Z; the game's ship faces +Z, so the whole hull is rotated once below.
const FIGHTER_SCALE = 5.6;
const WHITE = new THREE.Color(0xffffff);

function add(parent, geometry, material, position = [0, 0, 0], part = "") {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  if (part) object.userData.part = part;
  parent.add(object);
  return object;
}

function addAsymmetricPanel(parent, outline, depth, material, y, name, bevel = 0.12) {
  const count = outline.length;
  // Tessellate one canonical half-space outline and reuse its diagonals so
  // the mirrored wing is an exact reflection, not a re-triangulation.
  const faces = THREE.ShapeUtils.triangulateShape(
    outline.map(([x, z]) => new THREE.Vector2(Math.abs(x), z)),
    []
  );
  const vertices = [];
  for (const faceY of [-depth / 2, depth / 2]) {
    for (const [x, z] of outline) vertices.push(x, faceY, z);
  }
  const indices = [];
  const ccw = outline.reduce((sum, [x, z], i) => {
    const [nx, nz] = outline[(i + 1) % count];
    return sum + x * nz - nx * z;
  }, 0) > 0;
  const pushFace = (a, b, c, expected) => {
    const v = (i) => new THREE.Vector3(...vertices.slice(i * 3, i * 3 + 3));
    const origin = v(a);
    const normal = v(b).sub(origin).cross(v(c).sub(origin));
    if (normal.dot(expected) > 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  for (const [a, b, c] of faces) {
    pushFace(a, b, c, new THREE.Vector3(0, -1, 0));
    pushFace(count + a, count + b, count + c, new THREE.Vector3(0, 1, 0));
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const a = i;
    const b = j;
    const c = count + j;
    const d = count + i;
    const outward = new THREE.Vector3(
      outline[j][1] - outline[i][1],
      0,
      outline[i][0] - outline[j][0]
    ).multiplyScalar(ccw ? 1 : -1);
    pushFace(a, b, c, outward);
    pushFace(a, c, d, outward);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const panel = new THREE.Mesh(geometry, material);
  panel.position.y = y;
  panel.castShadow = true;
  panel.receiveShadow = true;
  panel.userData.part = name;
  parent.add(panel);
  return panel;
}

function addVerticalFin(parent, outline, thickness, material, side, name, bevel = 0.1) {
  const points = outline.map(([z, y]) => [-z, y]);
  const area = points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0);
  if (area < 0) points.reverse();
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateY(Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + side * (position.getY(i) - 1.1) * 0.3);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return add(parent, geometry, material, [side * 2.05, 0, 0], name);
}

function plate(parent, outline, depth, material, y, name, bevel = 0.12) {
  const points = outline.map(([x, z]) => [x, z]);
  const area = points.reduce((sum, [x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    return sum + x * nz - nx * z;
  }, 0);
  if (area < 0) points.reverse();
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  return add(parent, geometry, material, [0, y + depth / 2, 0], name);
}

function fuselage(parent, sections, material, name = "fuselage") {
  const vertices = [];
  const uvs = [];
  const indices = [];
  sections.forEach(([z, w, top, bottom, bevel = 0.72], i) => {
    vertices.push(
      -w * bevel, bottom, z,
      w * bevel, bottom, z,
      w, bottom * 0.42 + top * 0.58, z,
      w * bevel, top, z,
      -w * bevel, top, z,
      -w, bottom * 0.42 + top * 0.58, z
    );
    for (let j = 0; j < 6; j++) uvs.push(j / 6, i / (sections.length - 1));
  });
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < 6; j++) {
      const a = i * 6 + j;
      const b = i * 6 + ((j + 1) % 6);
      indices.push(a, b, b + 6, a, b + 6, a + 6);
    }
  }
  const end = (sections.length - 1) * 6;
  indices.push(
    0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4,
    end, end + 1, end + 2, end, end + 2, end + 3, end, end + 3, end + 4, end, end + 4, end + 5
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return add(parent, geometry, material, [0, 0, 0], name);
}

function createHullMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d");
  let seed = 95137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const baseGrad = g.createLinearGradient(0, 0, 1024, 1024);
  baseGrad.addColorStop(0, "#bec5c7");
  baseGrad.addColorStop(0.5, "#aab3b8");
  baseGrad.addColorStop(1, "#c6c9c4");
  g.fillStyle = baseGrad;
  g.fillRect(0, 0, 1024, 1024);

  for (let y = 0; y < 1024; y += 128) {
    for (let x = 0; x < 1024; x += 256) {
      const shade = 150 + Math.floor(rand() * 20);
      g.fillStyle = `rgb(${shade},${shade + 5},${shade + 8})`;
      g.fillRect(x + 3, y + 3, 250, 122);
      g.strokeStyle = "rgba(48,57,63,.72)";
      g.lineWidth = 2;
      g.strokeRect(x + 4, y + 4, 248, 120);
      g.strokeStyle = "rgba(225,230,230,.46)";
      g.beginPath();
      g.moveTo(x + 9, y + 8);
      g.lineTo(x + 246, y + 8);
      g.stroke();
      g.fillStyle = "#4c565c";
      for (const dx of [12, 244]) {
        for (const dy of [12, 116]) {
          g.beginPath();
          g.arc(x + dx, y + dy, 2.1, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  for (let i = 0; i < 1800; i++) {
    const tone = rand() > 0.5 ? "50,58,62" : "235,236,228";
    g.fillStyle = `rgba(${tone},${0.018 + rand() * 0.075})`;
    g.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 8, 1 + rand() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createStudioEnvironment(renderer) {
  // 256-tall equirectangular studio gradient (2:1), same palette as the study.
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const envGrad = g.createLinearGradient(0, 0, 0, 256);
  envGrad.addColorStop(0, "#c1c9cb");
  envGrad.addColorStop(0.38, "#586a76");
  envGrad.addColorStop(1, "#171d22");
  g.fillStyle = envGrad;
  g.fillRect(0, 0, 512, 256);
  const panel = g.createLinearGradient(52, 20, 190, 245);
  panel.addColorStop(0, "#f1ead5");
  panel.addColorStop(0.42, "#bdc7c8");
  panel.addColorStop(1, "#6b7880");
  g.fillStyle = panel;
  g.beginPath();
  g.moveTo(62, 16);
  g.lineTo(114, 18);
  g.lineTo(206, 237);
  g.lineTo(156, 236);
  g.closePath();
  g.fill();
  g.fillStyle = "#b7c4cc";
  g.fillRect(340, 38, 24, 185);
  g.fillRect(411, 48, 52, 72);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(source).texture;
  source.dispose();
  pmrem.dispose();
  return environment;
}

function addFlame(parent, x, y, z, radius, length) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 12, 1, true), material);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(x, y, z - length / 2);
  parent.add(flame);
  return flame;
}

function fighterIndices(side) {
  return side < 0 ? "left" : "right";
}

export function createFighterModel({ environment, color }) {
  const hullMap = createHullMap();
  const base = new THREE.Color(color);

  const hull = new THREE.MeshStandardMaterial({
    color: 0xd7d9d2,
    map: hullMap,
    metalness: 0.36,
    roughness: 0.64,
    envMap: environment,
    envMapIntensity: 0.48
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x343d42,
    metalness: 0.47,
    roughness: 0.53,
    envMap: environment,
    envMapIntensity: 0.46
  });
  const edge = new THREE.MeshStandardMaterial({
    color: 0x778187,
    metalness: 0.68,
    roughness: 0.48,
    envMap: environment,
    envMapIntensity: 0.58
  });
  const lowVis = new THREE.MeshStandardMaterial({
    color: 0x66614e,
    metalness: 0.19,
    roughness: 0.73,
    envMap: environment
  });
  const canopy = new THREE.MeshPhysicalMaterial({
    color: 0x111d26,
    metalness: 0.32,
    roughness: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
    envMap: environment,
    envMapIntensity: 1.15
  });
  const navRed = new THREE.MeshStandardMaterial({
    color: 0xff4d5e,
    emissive: 0xff4d5e,
    emissiveIntensity: 2.4,
    metalness: 0,
    roughness: 0.4
  });
  const navGreen = new THREE.MeshStandardMaterial({
    color: 0x4dff9e,
    emissive: 0x4dff9e,
    emissiveIntensity: 2.4,
    metalness: 0,
    roughness: 0.4
  });
  const livery = new THREE.MeshStandardMaterial({
    color: base.clone(),
    emissive: base.clone(),
    emissiveIntensity: 0.65,
    metalness: 0.3,
    roughness: 0.35,
    envMap: environment,
    envMapIntensity: 0.6
  });
  const engine = new THREE.MeshBasicMaterial({ color: base.clone().lerp(WHITE, 0.25) });
  const duct = new THREE.MeshStandardMaterial({ color: 0x182027, metalness: 0.35, roughness: 0.7 });

  const materials = { hull, dark, edge, lowVis, canopy, navRed, navGreen, livery, engine, duct };
  const native = new THREE.Group();
  native.userData.parts = {};
  const part = (name, mesh) => {
    native.userData.parts[name] = mesh;
    return mesh;
  };

  fuselage(native, [
    [-18.2, 0.12, 0.0, -0.12, 0.45], [-14.4, 0.68, 0.9, -0.53, 0.68], [-9.5, 1.16, 1.35, -0.82, 0.7],
    [-3.6, 1.72, 1.57, -1.05, 0.76], [2.6, 2.14, 1.53, -1.22, 0.8], [8.4, 2.28, 1.27, -1.2, 0.8],
    [11.2, 1.87, 0.9, -0.91, 0.72], [12.5, 1.65, 0.46, -0.45, 0.56]
  ], hull);

  part("cockpit", add(native, new THREE.SphereGeometry(1, 40, 28), canopy, [0, 1.55, -4.0], "cockpit-canopy"))
    .scale.set(1.42, 0.48, 2.7);
  add(native, new THREE.BoxGeometry(2.9, 0.12, 5.35), dark, [0, 1.28, -4.15], "canopy-sill");
  for (const side of [-1, 1]) {
    add(
      native,
      new THREE.CylinderGeometry(0.045, 0.06, 5.15, 10),
      edge,
      [side * 1.43, 1.42, -4.0],
      side < 0 ? "left-canopy-rail" : "right-canopy-rail"
    ).rotation.x = Math.PI / 2;
  }

  const wingOutline = [[1.53, -6.0], [2.72, -2.7], [13.5, 8.2], [14.55, 10.0], [12.9, 10.65], [10.2, 10.05], [5.0, 5.85], [2.5, 0.2]];
  for (const side of [-1, 1]) {
    const prefix = fighterIndices(side);
    const mirrored = wingOutline.map(([x, z]) => [side * x, z]);
    const wing = addAsymmetricPanel(native, mirrored, 0.82, hull, -0.34, `${prefix}-main-wing`, 0.19);
    part(`${prefix}Wing`, wing);
    plate(native, [[side * 2.05, -4.9], [side * 3.13, -2.2], [side * 11.2, 6.1], [side * 13.0, 8.9], [side * 11.1, 9.1], [side * 5.3, 4.7]], 0.15, edge, 0.29, `${prefix}-wing-skin`, 0.075);
    plate(native, [[side * 5.05, 3.9], [side * 9.15, 7.1], [side * 11.25, 8.6], [side * 10.35, 9.02], [side * 5.15, 4.7]], 0.13, edge, 0.31, `${prefix}-outboard-control-surface`, 0.055);
    plate(native, [[side * 2.2, -8.2], [side * 3.55, -5.0], [side * 2.42, -2.0], [side * 1.62, -2.85]], 0.18, hull, 0.32, `${prefix}-chine`, 0.05);

    // Dorsal canted tail surfaces are independent thick panels on the back.
    const tail = addVerticalFin(native, [[4.8, 1.05], [8.15, 5.3], [10.0, 5.1], [12.0, 1.05]], 0.22, hull, side, `${prefix}-dorsal-tail`, 0.07);
    part(`${prefix}Tail`, tail);
    const rudder = addVerticalFin(native, [[9.4, 4.85], [9.88, 4.85], [11.55, 1.25], [10.75, 1.25]], 0.035, edge, side, `${prefix}-tail-rudder`, 0.015);
    rudder.position.x += side * 0.155;

    const stabilator = plate(native, [[side * 1.7, 8.2], [side * 4.3, 9.35], [side * 7.8, 11.65], [side * 7.15, 12.7], [side * 4.05, 11.25], [side * 1.65, 9.8]], 0.48, hull, -0.15, `${prefix}-horizontal-tailplane`, 0.1);
    part(`${prefix}Tailplane`, stabilator);
    plate(native, [[side * 5.6, 10.1], [side * 6.85, 10.75], [side * 6.45, 11.65], [side * 5.3, 11.0]], 0.04, livery, 0.34, `${prefix}-tail-livery`, 0.015);

    // Side intake: dark recessed mouth under a stealth lip, with a visible duct.
    const inlet = new THREE.Group();
    const mouth = plate(inlet, [[-1.05, -2.8], [0.95, -2.8], [0.73, 1.8], [-0.86, 1.8]], 0.46, dark, 0, `${prefix}-intake-mouth`, 0.055);
    const inner = plate(inlet, [[-0.66, -2.2], [0.55, -2.2], [0.43, 0.95], [-0.55, 0.95]], 0.12, lowVis, -0.18, `${prefix}-intake-recess`, 0.025);
    const ductMesh = add(inlet, new THREE.CylinderGeometry(0.35, 0.55, 1.15, 20), duct, [0, -0.05, 0.65], `${prefix}-intake-duct`);
    ductMesh.rotation.x = Math.PI / 2;
    inlet.position.set(side * 2.47, 0.25, 4.25);
    inlet.rotation.y = side * 0.09;
    native.add(inlet);
    inlet.userData = { mouth, inner, duct: ductMesh, part: `${prefix}-side-intake` };

    plate(native, [[side * 1.3, -11.7], [side * 2.45, -7.5], [side * 2.12, -3.3], [side * 1.35, -4.2]], 0.17, edge, 0.93, `${prefix}-upper-strake`, 0.035);
    const enginePod = add(native, new THREE.CylinderGeometry(0.94, 1.22, 8.9, 20, 1, false), dark, [side * 1.42, -0.56, 7.45], `${prefix}-engine-pod`);
    enginePod.rotation.x = Math.PI / 2;
    enginePod.rotation.z = side * -0.035;
    const nozzle = add(native, new THREE.CylinderGeometry(0.82, 1.0, 1.55, 24, 1, true), edge, [side * 1.42, -0.56, 12.45], `${prefix}-nozzle`);
    nozzle.rotation.x = Math.PI / 2;
    const innerNozzle = add(native, new THREE.CylinderGeometry(0.68, 0.74, 0.18, 24), dark, [side * 1.42, -0.56, 13.26], `${prefix}-nozzle-inner`);
    innerNozzle.rotation.x = Math.PI / 2;
    add(native, new THREE.TorusGeometry(0.82, 0.095, 8, 24), edge, [side * 1.42, -0.56, 13.34], `${prefix}-nozzle-rim`);
    const core = add(native, new THREE.CircleGeometry(0.32, 24), engine, [side * 1.42, -0.56, 13.37], `${prefix}-engine-core`);
    part(`${prefix}Engine`, core);
    // Aft-facing navigation lights: red to port, green to starboard once the
    // hull is rotated to face +Z (native -x becomes the game's +x wing).
    const navigationMaterial = side < 0 ? navGreen : navRed;
    add(native, new THREE.SphereGeometry(0.12, 10, 8), navigationMaterial, [side * 14.03, 0.07, 9.95], `${prefix}-navigation-light`);
    for (let i = 0; i < 4; i++) {
      const seam = add(native, new THREE.CylinderGeometry(0.008, 0.008, 0.75, 6), dark, [side * (2.15 + i * 0.51), 0.17, 1.5 + i * 0.4], `${prefix}-panel-seam-${i}`);
      seam.rotation.z = side * 0.05;
    }
  }
  plate(native, [[-1.05, 7.6], [1.05, 7.6], [1.42, 12.7], [-1.42, 12.7]], 0.3, hull, -1.18, "lower-center-keel", 0.1);
  plate(native, [[-0.5, -14], [0.5, -14], [0.24, -4], [-0.24, -4]], 0.045, lowVis, 1.43, "fuselage-low-vis-mark", 0.018);
  plate(native, [[-0.5, 3.8], [0.5, 3.8], [0.76, 10.8], [-0.76, 10.8]], 0.1, edge, 1.36, "upper-fuselage-spine", 0.035);

  const hullRoot = new THREE.Group();
  hullRoot.rotation.y = Math.PI;
  hullRoot.scale.setScalar(FIGHTER_SCALE);
  hullRoot.add(native);

  const group = new THREE.Group();
  group.add(hullRoot);

  const flameZ = 13.34 * FIGHTER_SCALE;
  const flameY = -0.56 * FIGHTER_SCALE;
  const nozzleX = 1.42 * FIGHTER_SCALE;
  const flames = [];
  for (const side of [-1, 1]) {
    flames.push(addFlame(group, side * nozzleX, flameY, -flameZ, 5.3, 38));
    flames.push(addFlame(group, side * nozzleX, flameY, -flameZ, 2.4, 22));
  }
  const glow = new THREE.PointLight(base.clone(), 120, 420, 2);
  glow.position.set(0, flameY, -flameZ - 8);
  group.add(glow);

  const nativeParts = native.userData.parts;
  // The hull was rotated 180° around Y: native +x ends up at game -x. Public
  // right/left follow the game's +x starboard convention used by gameplay.
  const parts = {
    leftWing: nativeParts.rightWing,
    rightWing: nativeParts.leftWing,
    leftTail: nativeParts.rightTail,
    rightTail: nativeParts.leftTail,
    leftEngine: nativeParts.rightEngine,
    rightEngine: nativeParts.leftEngine,
    cockpit: nativeParts.cockpit
  };

  function applyLivery(nextColor) {
    const tint = new THREE.Color(nextColor);
    engine.color.copy(tint).lerp(WHITE, 0.25);
    for (const flame of flames) {
      flame.material.color.copy(tint).lerp(WHITE, 0.35);
      flame.material.needsUpdate = true;
    }
    glow.color.copy(tint);
    livery.color.copy(tint);
    livery.emissive.copy(tint);
  }
  applyLivery(base);

  group.userData = {
    parts,
    materials,
    flames,
    glow,
    ownTextures: [hullMap],
    hullRoot,
    applyLivery
  };
  return group;
}
