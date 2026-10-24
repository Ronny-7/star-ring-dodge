(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingProjection = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NEAR_PLANE = 1;
  const MAX_HORIZONTAL_FOV = 78;

  function createCamera({ player, width, height, fovDegrees, cameraDistance, cameraHeight, cameraPitch }) {
    // Constrain both axes: a tall portrait canvas would otherwise squeeze the
    // horizontal view into a sliver, since focal derived from height alone
    // grows with the aspect ratio.
    const focalFromHeight = height / 2 / Math.tan((fovDegrees * Math.PI) / 180 / 2);
    const focalFromWidth = width / 2 / Math.tan((MAX_HORIZONTAL_FOV * Math.PI) / 180 / 2);
    return {
      x: player.x,
      y: player.y + cameraHeight,
      z: player.z - cameraDistance,
      pitch: cameraPitch,
      focal: Math.min(focalFromHeight, focalFromWidth),
      centerX: width / 2,
      centerY: height / 2
    };
  }

  function projectPoint(point, camera) {
    const rx = point.x - camera.x;
    const ry = point.y - camera.y;
    const rz = point.z - camera.z;
    const sinPitch = Math.sin(camera.pitch);
    const cosPitch = Math.cos(camera.pitch);

    // Camera looks along +z, tilted down by `pitch`.
    const depth = rz * cosPitch - ry * sinPitch;
    if (depth <= NEAR_PLANE) {
      return { x: 0, y: 0, scale: 0, depth, visible: false };
    }

    const right = rx;
    const up = ry * cosPitch + rz * sinPitch;
    const scale = camera.focal / depth;
    return {
      x: camera.centerX + right * scale,
      y: camera.centerY - up * scale,
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

  return { NEAR_PLANE, createCamera, projectPoint, distanceFade };
});