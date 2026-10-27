import * as THREE from "three";
import { createFighterModel, createStudioEnvironment } from "./fighter-model.js";
import { createRockSet } from "./rock-models.js";
import { createPickupModel } from "./pickup-models.js";

const canvas = document.getElementById("showcase-canvas");
const stage = document.getElementById("stage");

function initialize() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    stage.querySelector(".stage-fallback").hidden = false;
    window.starRingShowcase = {
      getDebugReport: () => ({
        ready: false,
        view: "all",
        models: { ship: 0, rewards: 0, rocks: 0 },
        pickupVariants: [],
        rockForms: [],
        canvas: { width: 0, height: 0 },
        error: String(error)
      }),
      selectView: () => false
    };
    window.starRingShowcaseReady = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
  let view = "all";
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xc6d2dc, 0x171a1d, 1.0));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.0);
  key.position.set(-1, 1.6, 1);
  const fill = new THREE.DirectionalLight(0xc6d2dc, 0.5);
  fill.position.set(1.2, 0.2, -0.8);
  const rim = new THREE.DirectionalLight(0x8fcaff, 1.2);
  rim.position.set(0.4, -0.7, 1);
  scene.add(key, fill, rim);

  const shipRoot = new THREE.Group();
  shipRoot.position.set(0, 30, -140);
  const ship = createFighterModel({ environment, color: 0x62e4ff });
  shipRoot.add(ship);
  scene.add(shipRoot);

  const rewardsRoot = new THREE.Group();
  rewardsRoot.position.set(-150, -60, 120);
  const rewardSpecs = [
    { kind: "core", type: undefined, radius: 16, variant: "core" },
    { kind: "powerUp", type: "shield", radius: 18, variant: "shield" },
    { kind: "powerUp", type: "double", radius: 18, variant: "double" }
  ];
  rewardSpecs.forEach((spec, index) => {
    const pickup = createPickupModel({ kind: spec.kind, type: spec.type, radius: spec.radius });
    pickup.position.set((index - 1) * 80, 0, 0);
    pickup.userData.phase = index * 1.7;
    rewardsRoot.add(pickup);
  });
  scene.add(rewardsRoot);

  const rockSet = createRockSet({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const rocksRoot = new THREE.Group();
  rocksRoot.position.set(150, -60, 120);
  rockSet.forms.forEach((form, index) => {
    const mesh = new THREE.Mesh(form.geometry, form.material);
    mesh.position.set((index - 1) * 100, 0, 0);
    mesh.scale.setScalar(46);
    mesh.rotation.set(0.35, index * 1.7, 0.15);
    rocksRoot.add(mesh);
  });
  scene.add(rocksRoot);

  const VIEWS = {
    all: { position: [0, 110, 640], target: [0, -10, 40], width: 620 },
    ship: { position: [230, 110, 120], target: [0, 30, -140], width: 220 },
    rewards: { position: [-150, 10, 470], target: [-150, -60, 120], width: 230 },
    rocks: { position: [150, 10, 510], target: [150, -60, 120], width: 320 }
  };

  function frameView(name) {
    const view = VIEWS[name];
    const target = new THREE.Vector3(...view.target);
    const offset = new THREE.Vector3(...view.position).sub(target);
    const distance = offset.length();
    const fitWidth = 2 * distance * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    offset.multiplyScalar(Math.max(1, view.width / Math.max(1, fitWidth)));
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  function selectView(next) {
    if (!Object.hasOwn(VIEWS, next)) return false;
    view = next;
    shipRoot.visible = view === "all" || view === "ship";
    rewardsRoot.visible = view === "all" || view === "rewards";
    rocksRoot.visible = view === "all" || view === "rocks";
    frameView(view);
    stage.querySelectorAll("button[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    renderer.render(scene, camera);
    return true;
  }
  stage.querySelectorAll("button[data-view]").forEach((button) => {
    button.addEventListener("click", () => selectView(button.dataset.view));
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    if (VIEWS[view]) frameView(view);
    if (reducedMotion) renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener("resize", resize);

  const startedAt = performance.now();
  function animate(now) {
    const elapsed = (now - startedAt) / 1000;
    ship.rotation.y = elapsed * 0.12;
    rewardsRoot.children.forEach((pickup, index) => {
      const { body, variant } = pickup.userData.pickup;
      body.rotation.y = variant === "shield"
        ? Math.sin(elapsed * 0.33 + index) * 0.22
        : elapsed * (variant === "core" ? 0.4 : 0.3) + index;
      pickup.position.y = Math.sin(elapsed * 0.9 + index) * 4;
    });
    rocksRoot.children.forEach((rock, index) => {
      rock.rotation.y = elapsed * 0.12 + index * 1.7;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function getDebugReport() {
    return {
      ready: Boolean(window.starRingShowcaseReady),
      view,
      models: {
        ship: shipRoot.children.length,
        rewards: rewardsRoot.children.length,
        rocks: rocksRoot.children.length
      },
      pickupVariants: rewardsRoot.children.map((pickup) => pickup.userData.pickup.variant),
      rockForms: rockSet.forms.map((form) => form.id),
      canvas: { width: renderer.domElement.width, height: renderer.domElement.height }
    };
  }

  resize();
  selectView("all");
  window.starRingShowcase = { getDebugReport, selectView };
  window.starRingShowcaseReady = true;
  if (!reducedMotion) requestAnimationFrame(animate);
}

initialize();
