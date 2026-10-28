import * as THREE from "three";

const WHITE = new THREE.Color(0xffffff);

// Legacy skins keep their existing lighting; environment is reserved for the model rebuilds.
export function createShipMaterials({ color, environment, hullTexture }) {
  const base = new THREE.Color(color);
  const hull = new THREE.MeshStandardMaterial({
    map: hullTexture,
    color: base.clone().multiplyScalar(0.46),
    metalness: 0.8,
    roughness: 0.32,
    emissive: base.clone().multiplyScalar(0.16)
  });
  const dark = new THREE.MeshStandardMaterial({
    map: hullTexture,
    color: base.clone().multiplyScalar(0.2),
    metalness: 0.88,
    roughness: 0.4,
    emissive: base.clone().multiplyScalar(0.05)
  });
  const livery = new THREE.MeshStandardMaterial({
    color: base.clone().lerp(WHITE, 0.05),
    emissive: base.clone(),
    emissiveIntensity: 0.6,
    metalness: 0.35,
    roughness: 0.26
  });
  const engine = new THREE.MeshBasicMaterial({ color: base.clone().lerp(WHITE, 0.25) });
  const canopy = new THREE.MeshStandardMaterial({
    color: 0x07111f,
    metalness: 1,
    roughness: 0.06,
    emissive: base.clone().multiplyScalar(0.2)
  });
  const navRed = new THREE.MeshBasicMaterial({ color: 0xff4d5e });
  const navGreen = new THREE.MeshBasicMaterial({ color: 0x4dff9e });
  return {
    hull, dark, edge: livery, lowVis: dark, canopy, navRed, navGreen, livery, engine, duct: dark,
    // Keep the inline builders' names until their geometry is replaced.
    panel: dark, accent: livery, glass: canopy
  };
}
