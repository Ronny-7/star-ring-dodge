const test = require("node:test");
const assert = require("node:assert/strict");

const projection = require("../projection.js");

const basisCamera = (yaw = 0, pitch = 0) => projection.createCamera({
  x: 0,
  y: 0,
  z: 0,
  yaw,
  pitch,
  width: 960,
  height: 600,
  fovDegrees: 62
});

test("nearer objects project larger than distant ones", () => {
  const camera = basisCamera();
  const near = projection.projectPoint({ x: 0, y: 0, z: 400 }, camera);
  const far = projection.projectPoint({ x: 0, y: 0, z: 800 }, camera);

  assert.ok(near.visible && far.visible);
  assert.ok(near.scale > far.scale, "near scale should exceed far scale");
  assert.ok(near.scale > 0 && far.scale > 0);
});

test("points behind the camera are culled", () => {
  const camera = basisCamera();
  // Camera at the origin facing +z: anything with negative depth is behind it.
  const behind = projection.projectPoint({ x: 0, y: 0, z: -50 }, camera);
  assert.equal(behind.visible, false);
  assert.equal(behind.scale, 0);

  const inFront = projection.projectPoint({ x: 0, y: 0, z: 50 }, camera);
  assert.equal(inFront.visible, true);
});

test("horizontal offset moves screen x away from center, sign preserved", () => {
  const camera = basisCamera();
  const center = projection.projectPoint({ x: 0, y: 0, z: 500 }, camera);
  const right = projection.projectPoint({ x: 100, y: 0, z: 500 }, camera);
  const left = projection.projectPoint({ x: -100, y: 0, z: 500 }, camera);

  assert.ok(Math.abs(center.x - camera.centerX) < 1e-6);
  assert.ok(right.x > center.x);
  assert.ok(left.x < center.x);
});

test("vertical offset moves screen y upward for positive y", () => {
  const camera = basisCamera();
  const center = projection.projectPoint({ x: 0, y: 0, z: 500 }, camera);
  const up = projection.projectPoint({ x: 0, y: 100, z: 500 }, camera);

  assert.ok(up.y < center.y, "positive world y should render higher on screen");
});

test("projection is linear in depth (focal / depth)", () => {
  const camera = basisCamera();
  const a = projection.projectPoint({ x: 0, y: 0, z: 500 }, camera);
  const b = projection.projectPoint({ x: 0, y: 0, z: 1000 }, camera);
  assert.ok(Math.abs(a.scale / b.scale - 2) < 0.02, "doubling depth halves scale");
});

test("distanceFade is 1 before fog start and 0 past the fog range", () => {
  assert.equal(projection.distanceFade(100, 900, 900), 1);
  assert.equal(projection.distanceFade(900, 900, 900), 1);
  assert.equal(projection.distanceFade(1800, 900, 900), 0);
  const mid = projection.distanceFade(1350, 900, 900);
  assert.ok(mid > 0 && mid < 1);
});

test("yawing the camera changes what is in front", () => {
  const facingZ = basisCamera(0, 0);
  const facingX = basisCamera(Math.PI / 2, 0);

  // A point to the +x side is tangent to the default view but central after yaw.
  const towardX = projection.projectPoint({ x: 500, y: 0, z: 0 }, facingZ);
  const afterYaw = projection.projectPoint({ x: 500, y: 0, z: 0 }, facingX);

  assert.equal(towardX.visible, false, "point at +90 degrees is outside a 62 degree frustum");
  assert.ok(afterYaw.visible, "after yawing right the same point is in front");
  assert.ok(Math.abs(afterYaw.x - facingX.centerX) < 1e-6);
});

test("pitching up brings high points into view", () => {
  const level = basisCamera(0, 0);
  const up = basisCamera(0, 0.9);

  const high = { x: 0, y: 800, z: 200 };
  const levelPoint = projection.projectPoint(high, level);
  const upPoint = projection.projectPoint(high, up);

  assert.ok(upPoint.visible, "pitched-up camera sees the point");
  // Level view throws it far above the frame; pitching up pulls it to the centre.
  const levelOff = Math.abs(levelPoint.y - level.centerY);
  const upOff = Math.abs(upPoint.y - up.centerY);
  assert.ok(upOff < levelOff, "pitched camera brings the high point toward the centre");
});

test("a camera placed behind the ship sees the ship", () => {
  const ship = { x: 100, y: 50, z: 200 };
  const camera = projection.createChaseCamera({
    ship,
    yaw: 0,
    pitch: 0,
    distance: 320,
    height: 90,
    width: 960,
    heightPx: 600,
    fovDegrees: 62
  });

  const seen = projection.projectPoint(ship, camera);
  assert.ok(seen.visible, "the ship is in front of its own chase camera");
  assert.ok(seen.x > 0 && seen.x < 960);
  assert.ok(seen.y > 0 && seen.y < 600);
  assert.equal(camera.z < ship.z, true, "camera sits behind the ship along z");
});

test("chase camera stays behind the ship as it turns", () => {
  const ship = { x: 0, y: 0, z: 0 };
  const camera = projection.createChaseCamera({
    ship,
    yaw: Math.PI / 2,
    pitch: 0,
    distance: 300,
    height: 0,
    width: 960,
    heightPx: 600,
    fovDegrees: 62
  });

  assert.ok(camera.x < -250, "facing +x means the camera trails on -x");
  assert.ok(Math.abs(camera.z) < 1e-6);
});