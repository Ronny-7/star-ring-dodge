(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingProjection = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NEAR_PLANE = 1;
  const MAX_HORIZONTAL_FOV = 78;

  function makeFocal(width, height, fovDegrees) {
    // Constrain both axes: a tall portrait canvas would otherwise squeeze the
    // horizontal view into a sliver.
    const fromHeight = height / 2 / Math.tan((fovDegrees * Math.PI) / 180 / 2);
    const fromWidth = width / 2 / Math.tan((MAX_HORIZONTAL_FOV * Math.PI) / 180 / 2);
    return Math.min(fromHeight, fromWidth);
  }

  // Basis from yaw (turning right is positive) and pitch (nose up positive).
  // right = forward × up, matching three.js: with forward = +z and up = +y,
  // screen-right is -x. Getting this backwards mirrors every strafe and turn.
  function makeBasis(yaw, pitch) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    return {
      forward: { x: -sy * cp, y: sp, z: cy * cp },
      right: { x: -cy, y: 0, z: -sy },
      up: { x: sy * sp, y: cp, z: cy * sp }
    };
  }

  function createCamera({ x, y, z, yaw, pitch, width, height, fovDegrees }) {
    const basis = makeBasis(yaw || 0, pitch || 0);
    return {
      x,
      y,
      z,
      yaw: yaw || 0,
      pitch: pitch || 0,
      forward: basis.forward,
      right: basis.right,
      up: basis.up,
      focal: makeFocal(width, height, fovDegrees),
      centerX: width / 2,
      centerY: height / 2
    };
  }

  // Places the camera behind and above the ship, looking where the ship looks.
  function createChaseCamera({ ship, yaw, pitch, distance, height, width, heightPx, fovDegrees, lookAhead }) {
    const basis = makeBasis(yaw, pitch);
    const back = distance + (lookAhead || 0);
    return {
      x: ship.x - basis.forward.x * back,
      y: ship.y - basis.forward.y * back + height,
      z: ship.z - basis.forward.z * back,
      yaw,
      pitch,
      forward: basis.forward,
      right: basis.right,
      up: basis.up,
      focal: makeFocal(width, heightPx, fovDegrees),
      centerX: width / 2,
      centerY: heightPx / 2
    };
  }

  function projectPoint(point, camera) {
    const rx = point.x - camera.x;
    const ry = point.y - camera.y;
    const rz = point.z - camera.z;
    const { forward, right, up } = camera;

    const depth = rx * forward.x + ry * forward.y + rz * forward.z;
    if (depth <= NEAR_PLANE) {
      return { x: 0, y: 0, scale: 0, depth, visible: false };
    }

    const side = rx * right.x + ry * right.y + rz * right.z;
    const lift = rx * up.x + ry * up.y + rz * up.z;
    const scale = camera.focal / depth;
    return {
      x: camera.centerX + side * scale,
      y: camera.centerY - lift * scale,
      scale,
      depth,
      visible: true
    };
  }

  // 1 = fully visible at the fog start, 0 = swallowed at far distance.
  function distanceFade(depth, fogStart, fogRange) {
    if (depth <= fogStart) return 1;
    return Math.max(0, 1 - (depth - fogStart) / Math.max(1, fogRange));
  }

  return {
    NEAR_PLANE,
    MAX_HORIZONTAL_FOV,
    makeBasis,
    createCamera,
    createChaseCamera,
    projectPoint,
    distanceFade
  };
});