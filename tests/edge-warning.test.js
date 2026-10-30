const test = require("node:test");
const assert = require("node:assert/strict");

const { selectEdgeWarnings } = require("../edge-warning.js");
const projection = require("../projection.js");

function camera() {
  return projection.createCamera({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, width: 400, height: 240, fovDegrees: 62 });
}

const defaults = { camera: camera(), width: 400, height: 240, inset: 24, nearDistance: 700, dangerDistance: 180, maxWarnings: 2, player: { x: 0, y: 0, z: 0 } };

test("selects an off-screen approaching asteroid and preserves its edge direction", () => {
  const [warning] = selectEdgeWarnings({
    ...defaults,
    asteroids: [{ id: "left", x: 500, y: 0, z: 300, vx: -100, vy: 0, vz: -20, radius: 30 }]
  });

  assert.equal(warning.id, "left");
  assert.equal(warning.x, 24);
  assert.ok(warning.y > 24 && warning.y < 216);
  assert.ok(warning.direction.x < 0, "indicator direction points toward threat");
});

test("does not warn for visible or distant asteroids", () => {
  assert.deepEqual(selectEdgeWarnings({
    ...defaults,
    asteroids: [
      { id: "visible", x: 0, y: 0, z: 400, vx: 0, vy: 0, vz: 0, radius: 30 },
      { id: "distant", x: 900, y: 0, z: 900, vx: -1, vy: 0, vz: -1, radius: 30 }
    ]
  }), []);
});

test("clamps an off-screen warning to the safe viewport inset", () => {
  const [warning] = selectEdgeWarnings({
    ...defaults,
    asteroids: [{ id: "high", x: 0, y: 600, z: 300, vx: 0, vy: -100, vz: 0, radius: 30 }]
  });

  assert.equal(warning.x, 200);
  assert.equal(warning.y, 24);
});

test("caps warnings in nearest then highest-threat deterministic order", () => {
  const warnings = selectEdgeWarnings({
    ...defaults,
    maxWarnings: 2,
    asteroids: [
      { id: "far-elite", x: -500, y: 0, z: 500, vx: 0, vy: 0, vz: 0, radius: 30, elite: true },
      { id: "near", x: 500, y: 0, z: 250, vx: -10, vy: 0, vz: -10, radius: 30 },
      { id: "tie", x: 500, y: 0, z: 250, vx: -10, vy: 0, vz: -10, radius: 30 }
    ]
  });

  assert.deepEqual(warnings.map(({ id }) => id), ["near", "tie"]);
});
