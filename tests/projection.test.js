const test = require("node:test");
const assert = require("node:assert/strict");

const projection = require("../projection.js");

const baseCamera = () => projection.createCamera({
  player: { x: 0, y: 0, z: 0 },
  width: 960,
  height: 600,
  fovDegrees: 55,
  cameraDistance: 520,
  cameraHeight: 150,
  cameraPitch: 0
});

test("nearer objects project larger than distant ones", () => {
  const camera = baseCamera();
  const near = projection.projectPoint({ x: 0, y: 0, z: 700 }, camera);
  const far = projection.projectPoint({ x: 0, y: 0, z: 1400 }, camera);

  assert.ok(near.visible && far.visible);
  assert.ok(near.scale > far.scale, "near scale should exceed far scale");
  assert.ok(near.scale > 0 && far.scale > 0);
});

test("points behind the camera are culled", () => {
  const camera = baseCamera();
  // Camera sits at z = -520, so anything at or behind that is culled.
  const behind = projection.projectPoint({ x: 0, y: 0, z: -520 }, camera);
  assert.equal(behind.visible, false);
  assert.equal(behind.scale, 0);

  const justInFront = projection.projectPoint({ x: 0, y: 0, z: -400 }, camera);
  assert.equal(justInFront.visible, true);
});

test("horizontal offset moves screen x away from center, sign preserved", () => {
  const camera = baseCamera();
  const center = projection.projectPoint({ x: 0, y: 0, z: 900 }, camera);
  const right = projection.projectPoint({ x: 120, y: 0, z: 900 }, camera);
  const left = projection.projectPoint({ x: -120, y: 0, z: 900 }, camera);

  assert.ok(Math.abs(center.x - camera.centerX) < 1e-6);
  assert.ok(right.x > center.x);
  assert.ok(left.x < center.x);
});

test("vertical offset moves screen y upward for positive y", () => {
  const camera = baseCamera();
  const center = projection.projectPoint({ x: 0, y: 0, z: 900 }, camera);
  const up = projection.projectPoint({ x: 0, y: 120, z: 900 }, camera);

  assert.ok(up.y < center.y, "positive world y should render higher on screen");
});

test("projection is linear in depth for scale (focal / depth)", () => {
  const camera = baseCamera();
  // Depth is measured from the camera at z = -520.
  const a = projection.projectPoint({ x: 0, y: 0, z: 380 }, camera);
  const b = projection.projectPoint({ x: 0, y: 0, z: 1280 }, camera);
  assert.ok(Math.abs(a.scale / b.scale - 2) < 0.02, "doubling depth halves scale");
});

test("distanceFade is 1 before fog start and 0 past the fog range", () => {
  assert.equal(projection.distanceFade(100, 780, 1500), 1);
  assert.equal(projection.distanceFade(780, 780, 1500), 1);
  assert.equal(projection.distanceFade(2280, 780, 1500), 0);
  const mid = projection.distanceFade(1530, 780, 1500);
  assert.ok(mid > 0 && mid < 1);
});

test("ship sits below the vanishing point inside the frame", () => {
  const camera = projection.createCamera({
    player: { x: 0, y: 0, z: 0 },
    width: 960,
    height: 600,
    fovDegrees: 55,
    cameraDistance: 560,
    cameraHeight: 320,
    cameraPitch: 0.3
  });

  const ship = projection.projectPoint({ x: 0, y: 0, z: 0 }, camera);
  const far = projection.projectPoint({ x: 0, y: 0, z: 1500 }, camera);

  assert.ok(ship.visible && far.visible);
  assert.ok(ship.y > far.y, "ship renders lower on screen than the distant lane");
  assert.ok(ship.y > 300 && ship.y < 600, "ship stays inside the lower half of the frame");
  assert.ok(far.y > 0 && far.y < 300, "vanishing point stays in the upper half");
});

test("lane walls stay inside the viewport at the player's end", () => {
  const camera = projection.createCamera({
    player: { x: 0, y: 0, z: 0 },
    width: 960,
    height: 600,
    fovDegrees: 55,
    cameraDistance: 560,
    cameraHeight: 320,
    cameraPitch: 0.3
  });

  const nearLeft = projection.projectPoint({ x: -340, y: -220, z: 0 }, camera);
  const nearRight = projection.projectPoint({ x: 340, y: -220, z: 0 }, camera);
  assert.ok(nearLeft.x > 0 && nearRight.x < 960, "lane is wider than the frame at the near end");
  assert.ok(nearLeft.y < 600, "near lane edge does not fall off the bottom");
});