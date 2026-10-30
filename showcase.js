import * as THREE from "three";
import { createFighterModel, createStudioEnvironment } from "./fighter-model.js?v=4.7.0";
import { createDeltaModel } from "./delta-model.js?v=4.7.0";
import { createSaucerModel } from "./saucer-model.js?v=4.7.0";
import { createRockSet } from "./rock-models.js?v=4.7.0";
import { createPickupModel } from "./pickup-models.js?v=4.7.0";

const canvas = document.getElementById("showcase-canvas");
const stage = document.getElementById("stage");
const stageFullscreenButton = document.getElementById("stage-fullscreen");
const stageHint = stage.querySelector(".stage-hint");

function fullscreenApi() {
  const doc = stage.ownerDocument;
  if (typeof stage.requestFullscreen === "function" && doc.fullscreenEnabled !== false) {
    return { request: stage.requestFullscreen, exit: doc.exitFullscreen,
      element: doc.fullscreenElement, event: "fullscreenchange", flag: doc.fullscreenEnabled };
  }
  if (typeof stage.webkitRequestFullscreen === "function" && doc.webkitFullscreenEnabled !== false) {
    return { request: stage.webkitRequestFullscreen, exit: doc.webkitExitFullscreen,
      element: doc.webkitFullscreenElement, event: "webkitfullscreenchange", flag: doc.webkitFullscreenEnabled };
  }
  return null;
}

async function toggleFullscreen() {
  const doc = stage.ownerDocument;
  const api = fullscreenApi();
  if (!api) return false;
  try {
    if (api.element === stage) await api.exit.call(doc);
    else await api.request.call(stage);
  } catch {
    // Policy denial is not recoverable from script; do not leave a dead control.
    if (stageFullscreenButton) stageFullscreenButton.hidden = true;
    return fullscreenApi()?.element === stage;
  }
  return fullscreenApi()?.element === stage;
}

function syncFullscreenButton() {
  if (!stageFullscreenButton) return;
  const active = fullscreenApi()?.element === stage;
  stageFullscreenButton.setAttribute("aria-pressed", String(active));
  stageFullscreenButton.textContent = active ? "退出全屏" : "全屏";
}

if (stageFullscreenButton) {
  const api = fullscreenApi();
  if (!api) {
    stageFullscreenButton.hidden = true;
  } else {
    stageFullscreenButton.addEventListener("click", () => { void toggleFullscreen(); });
    stage.ownerDocument.addEventListener(api.event, syncFullscreenButton);
    syncFullscreenButton();
  }
}

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
        shipVariants: [],
        shipBounds: [],
        pickupVariants: [],
        rockForms: [],
        camera: { yaw: 0, pitch: 0, factor: 1, distance: 0 },
        focus: null,
        pickable: [],
        canvas: { width: 0, height: 0 },
        error: String(error)
      }),
      selectView: () => false,
      orbitBy: () => false,
      zoomBy: () => false,
      selectModel: () => false,
      clearFocus: () => false,
      toggleFullscreen
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
  const color = 0x62e4ff;
  const fighter = createFighterModel({ environment, color });
  const hullTexture = fighter.userData.ownTextures[0];
  const ships = [fighter, createDeltaModel({ environment, color, hullTexture }),
    createSaucerModel({ environment, color, hullTexture })];
  const shipVariants = ["fighter", "delta", "saucer"];
  const shipBounds = ships.map((ship) => {
    ship.userData.applyLivery(color);
    const bounds = new THREE.Box3().setFromObject(ship.userData.hullRoot).getSize(new THREE.Vector3());
    ship.rotation.x = 0.6;
    shipRoot.add(ship);
    return { x: bounds.x, y: bounds.y, z: bounds.z };
  });
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

  const groups = { ship: shipRoot, rewards: rewardsRoot, rocks: rocksRoot };
  // Every inspectable model, so a tap can isolate one of them.
  const inspectables = [
    ...ships.map((ship, index) => ({ object: ship, root: shipRoot, group: "ship", id: shipVariants[index] })),
    ...rewardsRoot.children.map((pickup) => ({
      object: pickup, root: rewardsRoot, group: "rewards", id: pickup.userData.pickup.variant
    })),
    ...rocksRoot.children.map((mesh, index) => ({
      object: mesh, root: rocksRoot, group: "rocks", id: rockSet.forms[index].id
    }))
  ];
  let focus = null;

  const VIEWS = {
    all: { position: [0, 110, 640], width: 620 },
    ship: { position: [0, 110, 500], width: 620 },
    rewards: { position: [-150, 10, 470], width: 230 },
    rocks: { position: [150, 10, 510], width: 320 }
  };

  // Camera orbit. The studio lights stay fixed, so dragging rotates the view
  // around the models instead of dragging the light rig across them.
  const MAX_TILT = THREE.MathUtils.degToRad(65);
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 2.2;
  const ORBIT_SPEED = 0.006;
  const ZOOM_SPEED = 0.0012;
  const orbit = { yaw: 0, pitch: 0, factor: 1 };
  let framing = null;
  let interacted = false;

  function layoutShips() {
    const stacked = stage.clientWidth < 640;
    // Models move with the layout, so cached hit spheres must be rebuilt.
    inspectables.forEach((item) => { item.sphere = null; });
    const sizes = ships.map((ship) => {
      ship.position.set(0, 0, 0);
      return new THREE.Box3().setFromObject(ship).getSize(new THREE.Vector3());
    });
    const axis = stacked ? "y" : "x";
    const centers = [0];
    sizes.slice(1).forEach((size, index) => {
      centers.push(centers[index] + (sizes[index][axis] + size[axis]) / 2 * 1.6);
    });
    const center = (centers.at(-1) + sizes.at(-1)[axis] / 2 - sizes[0][axis] / 2) / 2;
    ships.forEach((ship, index) => { ship.position[axis] = (centers[index] - center) * (stacked ? -1 : 1); });
    shipRoot.position.set(0, stacked ? 130 : 70, -140);
    rewardsRoot.position.set(stacked ? 0 : -170, stacked ? -200 : -100, 120);
    rocksRoot.position.set(stacked ? 0 : 170, stacked ? -340 : -100, 120);
    VIEWS.ship.width = stacked ? Math.max(...sizes.map((size) => size.x)) * 1.2
      : centers.at(-1) + (sizes[0].x + sizes.at(-1).x) / 2;
  }

  function applyCamera() {
    if (!framing) return;
    const spherical = new THREE.Spherical().setFromVector3(framing.dir);
    spherical.theta += orbit.yaw;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi - orbit.pitch,
      Math.max(0.12, framing.basePhi - MAX_TILT),
      Math.min(Math.PI - 0.12, framing.basePhi + MAX_TILT)
    );
    const offset = new THREE.Vector3().setFromSpherical(spherical)
      .multiplyScalar(framing.distance * Math.max(orbit.factor, framing.minFactor));
    camera.position.copy(framing.target).add(offset);
    camera.lookAt(framing.target);
  }

  function applyVisibility() {
    Object.entries(groups).forEach(([name, root]) => {
      root.visible = focus ? focus.group === name : (view === "all" || view === name);
    });
    // Hidden group roots still raycast, so hide their models explicitly.
    inspectables.forEach((item) => { item.object.visible = !focus || item === focus; });
  }

  function syncHint() {
    if (!stageHint) return;
    stageHint.textContent = focus
      ? "拖动旋转 · 点空白处返回分组"
      : "拖动旋转 · 滚轮或双指缩放 · 点模型单独查看";
  }

  function frameBounds(bounds, viewName, width = VIEWS[viewName].width, keepCameraOutside = false) {
    const preset = VIEWS[viewName];
    const target = bounds.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3(...preset.position).sub(target);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    const inverseRotation = camera.quaternion.clone().invert();
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    let distance = (stage.clientWidth < 640 ? 0 : width) / (2 * tanH);
    // Fit every box corner in camera space, including depth and room below the tabs.
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(target).applyQuaternion(inverseRotation);
          distance = Math.max(distance, corner.z + Math.abs(corner.x) * 1.25 / tanH,
            corner.z + Math.abs(corner.y) * 1.35 / tanV);
        }
      }
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const safeDistance = keepCameraOutside ? sphere.radius * 1.12 : 0;
    const minFactor = Math.max(MIN_ZOOM, safeDistance / Math.max(distance, 0.001));
    const dir = offset.normalize();
    framing = {
      target,
      dir,
      distance,
      radius: sphere.radius,
      safeDistance,
      minFactor,
      basePhi: new THREE.Spherical().setFromVector3(dir).phi
    };
    applyCamera();
  }

  function frameView(name) {
    const roots = name === "all" ? [shipRoot, rewardsRoot, rocksRoot]
      : [name === "ship" ? shipRoot : name === "rewards" ? rewardsRoot : rocksRoot];
    const bounds = new THREE.Box3();
    roots.forEach((root) => bounds.union(new THREE.Box3().setFromObject(root)));
    frameBounds(bounds, name);
  }

  function render() {
    // A hidden stage measures 0x0; skip it so returning restores a real frame.
    if (stage.clientWidth < 1 || stage.clientHeight < 1) return;
    renderer.render(scene, camera);
  }

  function cameraReport() {
    return {
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      factor: Math.max(orbit.factor, framing?.minFactor ?? MIN_ZOOM),
      distance: camera.position.distanceTo(framing.target),
      focusRadius: framing?.radius ?? 0,
      safeDistance: framing?.safeDistance ?? 0
    };
  }

  function orbitBy(dx, dy) {
    orbit.yaw -= dx * ORBIT_SPEED;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * ORBIT_SPEED, -MAX_TILT, MAX_TILT);
    interacted = true;
    applyCamera();
    render();
    return true;
  }

  function zoomBy(delta) {
    const minFactor = framing?.minFactor ?? MIN_ZOOM;
    const next = THREE.MathUtils.clamp(orbit.factor * Math.exp(delta * ZOOM_SPEED), minFactor, MAX_ZOOM);
    if (next === orbit.factor) return false;
    orbit.factor = next;
    interacted = true;
    applyCamera();
    render();
    return true;
  }

  function resetOrbit() {
    orbit.yaw = 0;
    orbit.pitch = 0;
    orbit.factor = 1;
  }

  function focusModel(item) {
    focus = item;
    // Hold still: a spinning model is hard to inspect.
    interacted = true;
    resetOrbit();
    applyVisibility();
    frameBounds(new THREE.Box3().setFromObject(item.object), view, 0, true);
    syncHint();
    render();
    return true;
  }

  function clearFocus() {
    if (!focus) return false;
    focus = null;
    resetOrbit();
    applyVisibility();
    frameView(view);
    syncHint();
    render();
    return true;
  }

  function selectModel(id) {
    // While isolated, any model of the focused group is reachable by name.
    const pool = focus
      ? inspectables.filter((item) => item.group === focus.group)
      : inspectables.filter((item) => item.root.visible);
    const item = pool.find((entry) => entry.id === id);
    return item ? focusModel(item) : false;
  }

  function selectView(next) {
    if (!Object.hasOwn(VIEWS, next)) return false;
    // Re-selecting the active tab is the reset gesture for orbit and zoom.
    if (next === view) interacted = false;
    view = next;
    focus = null;
    resetOrbit();
    applyVisibility();
    frameView(view);
    syncHint();
    stage.querySelectorAll("button[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    render();
    return true;
  }
  stage.querySelectorAll("button[data-view]").forEach((button) => {
    button.addEventListener("click", () => selectView(button.dataset.view));
  });

  // Drag to orbit (mouse, pen, one finger), pinch or wheel to zoom, and a tap
  // without movement isolates the model under the pointer.
  const pointers = new Map();
  const raycaster = new THREE.Raycaster();
  let pinchDistance = 0;
  let press = null;

  function distanceBetweenPointers() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // A ray-vs-sphere hit is more forgiving than a mesh hit: the pickups are only
  // a few pixels wide at the default framing, and models like the saucer have
  // gaps a mesh hit would fall through.
  function sphereFor(item) {
    if (!item.sphere) {
      item.sphere = new THREE.Box3().setFromObject(item.object).getBoundingSphere(new THREE.Sphere());
    }
    return item.sphere;
  }

  function pickableItems() {
    // Hidden siblings keep their bounding spheres; never pick what is not drawn.
    return inspectables.filter((item) => item.root.visible && item.object.visible);
  }

  function modelUnderPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const ray = raycaster.ray;
    let best = null;
    let bestDistance = Infinity;
    for (const item of pickableItems()) {
      const sphere = sphereFor(item);
      const reach = sphere.radius + camera.position.distanceTo(sphere.center) * 0.05;
      const hitPoint = ray.intersectSphere(new THREE.Sphere(sphere.center, reach), new THREE.Vector3());
      if (!hitPoint) continue;
      const distance = hitPoint.distanceTo(ray.origin);
      if (distance < bestDistance) { best = item; bestDistance = distance; }
    }
    return best;
  }

  function handleTap(event) {
    const hit = modelUnderPointer(event);
    if (!hit) return clearFocus();
    if (focus === hit) return clearFocus();
    return focusModel(hit);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture?.(event.pointerId);
    if (pointers.size === 2) {
      pinchDistance = distanceBetweenPointers();
      if (press) press.moved = true;
    } else {
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (press && press.id === event.pointerId &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press.moved = true;
    if (pointers.size > 1) {
      const next = distanceBetweenPointers();
      if (pinchDistance > 0 && next > 0) zoomBy((pinchDistance - next) * 2.4);
      pinchDistance = next;
      return;
    }
    orbitBy(event.clientX - previous.x, event.clientY - previous.y);
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    pinchDistance = 0;
    if (press && press.id === event.pointerId) {
      if (!press.moved && event.type === "pointerup") handleTap(event);
      press = null;
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);

  canvas.addEventListener("wheel", (event) => {
    const unit = event.deltaMode === 1 ? 16 : 1;
    // At the zoom limit the wheel falls through so the page can still scroll.
    if (zoomBy(event.deltaY * unit)) event.preventDefault();
  }, { passive: false });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    layoutShips();
    if (focus) frameBounds(new THREE.Box3().setFromObject(focus.object), view, 0, true);
    else if (VIEWS[view]) frameView(view);
    if (reducedMotion) render();
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener("resize", resize);

  const startedAt = performance.now();
  function animate(now) {
    const elapsed = (now - startedAt) / 1000;
    if (!interacted) {
      ships.forEach((ship) => { ship.rotation.y = Math.sin(elapsed * 0.12) * 0.12; });
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
    }
    // The game view hides the stage; render() skips the 0x0 frame.
    render();
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
      shipVariants,
      shipBounds,
      pickupVariants: rewardsRoot.children.map((pickup) => pickup.userData.pickup.variant),
      rockForms: rockSet.forms.map((form) => form.id),
      camera: cameraReport(),
      focus: focus ? focus.id : null,
      pickable: pickableItems().map((item) => item.id),
      canvas: { width: renderer.domElement.width, height: renderer.domElement.height }
    };
  }

  resize();
  selectView("all");
  window.starRingShowcase = { getDebugReport, selectView, selectModel, clearFocus, orbitBy, zoomBy, toggleFullscreen };
  window.starRingShowcaseReady = true;
  if (!reducedMotion) requestAnimationFrame(animate);
}

initialize();
