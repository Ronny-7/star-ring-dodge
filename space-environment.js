import * as THREE from "three";

const NEBULA_RADIUS = 5800;
const PLANET_DISTANCE = 2600;
const PLANET_DIRECTION = new THREE.Vector3(0.42, 0.2, 0.885).normalize();
const DEFAULT_TINT = "98,228,255";
const WHITE = new THREE.Color(0xffffff);

/* ---------- 程序化贴图 ---------- */

function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = (v) => v * v * (3 - 2 * v);
  const u = smooth(x - ix), v = smooth(y - iy), w = smooth(z - iz);
  const hash = (a, b, c) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const lerp = THREE.MathUtils.lerp;
  return lerp(
    lerp(lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    lerp(lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w
  );
}

function makeSphericalTexture(fillPixel) {
  const width = 512, height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  const image = g.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const latitude = y * Math.PI / (height - 1);
    const ring = y === 0 || y === height - 1 ? 0 : Math.sin(latitude);
    for (let x = 0; x < width; x++) {
      // Sample a closed sphere, not UV noise: poles and the repeated seam agree.
      const longitude = x === width - 1 ? 0 : x * Math.PI * 2 / (width - 1);
      const offset = (y * width + x) * 4;
      fillPixel(image.data, offset, ring * Math.cos(longitude), Math.cos(latitude), ring * Math.sin(longitude));
      image.data[offset + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function makeNebulaTexture() {
  return makeSphericalTexture((data, offset, x, y, z) => {
    const broad = noise3(x * 4 + 18, y * 5, z * 4);
    const detail = noise3(x * 13, y * 15 + 9, z * 13);
    const wisps = noise3(x * 38, y * 38, z * 38 + 4);
    const belt = Math.exp(-(((y + x * 0.32 - Math.sin(z * 3) * 0.17) / 0.28) ** 2));
    const cloud = belt * Math.max(0, broad * 0.65 + detail * 0.25 + wisps * 0.1 - 0.28) ** 1.5 * 4.5;
    const warm = noise3(x * 2 - 5, y * 2, z * 2);
    data[offset] = 3 + cloud * (24 + warm * 35);
    data[offset + 1] = 5 + cloud * (34 + warm * 8);
    data[offset + 2] = 11 + cloud * (85 - warm * 40);
  });
}

function makePlanetTexture() {
  return makeSphericalTexture((data, offset, x, y, z) => {
    const broad = noise3(x * 6 + 5, y * 6, z * 6);
    const detail = noise3(x * 38, y * 45, z * 38);
    const jets = noise3(x * 18 + y * 9, y * 4, z * 18);
    const dx = x - 0.25, dy = (y + 0.23) * 2.4, dz = z - 0.94;
    const distance = dx * dx + dy * dy + dz * dz;
    const swirl = Math.atan2(dy, dx) + distance * 32;
    const storm = Math.exp(-distance * 22);
    const flow = y * 34 + (broad - 0.5) * 2 + (jets - 0.5) * 1.7 + Math.sin(swirl) * storm * 2;
    const bands = THREE.MathUtils.clamp(0.5 + Math.sin(flow) * 0.29 + Math.sin(flow * 2.2 + broad) * 0.12 + (jets - 0.5) * 0.22, 0, 1);
    const spot = storm * (0.42 + Math.sin(swirl * 2) * 0.12);
    const grain = (detail - 0.5) * 16;
    data[offset] = THREE.MathUtils.lerp(110 + bands * 85, 155, spot) + grain;
    data[offset + 1] = THREE.MathUtils.lerp(91 + bands * 91, 90, spot) + grain;
    data[offset + 2] = THREE.MathUtils.lerp(73 + bands * 90, 54, spot) + grain;
  });
}

const PLANET_VERTEX = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/* ---------- 环境 ---------- */

function makeDust(half, count, size, opacity, center, glowTexture) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = center.x + (Math.random() * 2 - 1) * half;
    positions[i * 3 + 1] = center.y + (Math.random() * 2 - 1) * half;
    positions[i * 3 + 2] = center.z + (Math.random() * 2 - 1) * half;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: glowTexture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, half };
}

function wrapDust(dust, player) {
  const attribute = dust.points.geometry.attributes.position;
  const values = attribute.array;
  const span = dust.half * 2;
  const centers = [player.x, player.y, player.z];
  let changed = false;
  for (let i = 0; i < values.length; i += 1) {
    const min = centers[i % 3] - dust.half;
    if (values[i] < min || values[i] >= min + span) {
      values[i] -= Math.floor((values[i] - min) / span) * span;
      changed = true;
    }
  }
  if (changed) attribute.needsUpdate = true;
}

export function createSpaceEnvironment({ glowTexture, center }) {
  const nebulaTexture = makeNebulaTexture();
  const planetTexture = makePlanetTexture();

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(NEBULA_RADIUS, 32, 16),
    new THREE.MeshBasicMaterial({
      map: nebulaTexture,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  skyDome.renderOrder = -20;
  skyDome.frustumCulled = false;

  const sunDirection = { value: new THREE.Vector3(-600, 1030, -830).normalize() };
  const planetMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: planetTexture },
      tint: { value: new THREE.Color() },
      sunDirection
    },
    vertexShader: PLANET_VERTEX,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 tint;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        float day = max(dot(normalize(vWorldNormal), sunDirection), 0.0);
        vec3 surface = texture2D(map, vUv).rgb * tint;
        gl_FragColor = vec4(surface * (0.012 + pow(day, 0.85) * 1.25), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), planetMaterial);
  planet.name = "background-planet";
  planet.rotation.set(0, 0.35, 0.09);
  planet.renderOrder = -10;

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, sunDirection },
    vertexShader: PLANET_VERTEX,
    fragmentShader: `
      uniform vec3 tint;
      uniform vec3 sunDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normal, viewDirection)), 2.8);
        float lit = smoothstep(-0.12, 0.45, dot(normal, sunDirection));
        gl_FragColor = vec4(tint, rim * lit * 0.45);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), atmosphereMaterial);
  atmosphere.name = "planet-atmosphere";
  atmosphere.scale.setScalar(1.025);
  atmosphere.renderOrder = 1;

  const dustInner = makeDust(700, 160, 3, 0.35, center, glowTexture);
  const dustOuter = makeDust(1600, 320, 2, 0.22, center, glowTexture);

  const group = new THREE.Group();
  group.add(skyDome, planet, atmosphere, dustInner.points, dustOuter.points);

  let currentTint = DEFAULT_TINT;

  function setTint(rgb) {
    const tint = new THREE.Color(`rgb(${rgb})`);
    skyDome.material.color.copy(tint.clone().lerp(WHITE, 0.55));
    dustInner.points.material.color.copy(tint.clone().lerp(WHITE, 0.35));
    dustOuter.points.material.color.copy(tint.clone().lerp(WHITE, 0.35));
    planetMaterial.uniforms.tint.value.copy(tint).lerp(WHITE, 0.86);
    atmosphereMaterial.uniforms.tint.value.copy(tint).lerp(new THREE.Color(0x78b2e2), 0.75);
    currentTint = rgb;
  }

  function update(camera, player, dt = 0, lightDirection) {
    skyDome.position.copy(camera.position);
    planet.position.copy(camera.position).addScaledVector(PLANET_DIRECTION, PLANET_DISTANCE);
    const strength = lightDirection?.lengthSq();
    if (Number.isFinite(strength) && strength > 0) sunDirection.value.copy(lightDirection).normalize();
    if (Number.isFinite(dt) && dt > 0) planet.rotation.y += dt * 0.025;
    atmosphere.position.copy(planet.position);
    atmosphere.rotation.copy(planet.rotation);
    wrapDust(dustInner, player);
    wrapDust(dustOuter, player);
  }

  function getDebugReport() {
    return {
      nebula: skyDome.isMesh,
      planet: planet.isMesh,
      planetRotation: planet.rotation.y,
      sunDirection: sunDirection.value.toArray(),
      dustLayers: 2,
      fence: false,
      tint: currentTint,
      nebulaRadius: NEBULA_RADIUS,
      planetDistance: PLANET_DISTANCE
    };
  }

  function dispose() {
    // Geometry and materials belong to the scene and are released by
    // world3d's disposeObject(scene). The shared glow texture stays alive.
    nebulaTexture.dispose();
    planetTexture.dispose();
  }

  setTint(DEFAULT_TINT);

  return { group, update, setTint, getDebugReport, dispose };
}
