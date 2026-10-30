(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./projection.js"));
  } else {
    root.starRingEdgeWarning = factory(root.starRingProjection);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (projection) {
  function selectEdgeWarnings({ asteroids, player, camera, width, height, inset, nearDistance, dangerDistance, maxWarnings }) {
    const centerX = width / 2;
    const centerY = height / 2;
    const edgeX = centerX - inset;
    const edgeY = centerY - inset;

    return asteroids.map((asteroid, index) => {
      const dx = asteroid.x - player.x;
      const dy = asteroid.y - player.y;
      const dz = asteroid.z - player.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > nearDistance) return null;

      const relativeVx = (asteroid.vx || 0) - (player.vx || 0);
      const relativeVy = (asteroid.vy || 0) - (player.vy || 0);
      const relativeVz = (asteroid.vz || 0) - (player.vz || 0);
      const closingSpeed = -(dx * relativeVx + dy * relativeVy + dz * relativeVz) / Math.max(1, distance);
      if (closingSpeed <= 0 && distance > dangerDistance && !asteroid.elite) return null;

      const point = projection.projectPoint(asteroid, camera);
      if (point.visible && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) return null;

      let screenDx = point.x - centerX;
      let screenDy = point.y - centerY;
      if (!point.visible) {
        screenDx = dx * camera.right.x + dy * camera.right.y + dz * camera.right.z;
        screenDy = -(dx * camera.up.x + dy * camera.up.y + dz * camera.up.z);
        if (Math.abs(screenDx) + Math.abs(screenDy) < 0.001) screenDy = edgeY;
      }
      const scale = Math.min(edgeX / Math.max(0.001, Math.abs(screenDx)), edgeY / Math.max(0.001, Math.abs(screenDy)));
      const length = Math.hypot(screenDx, screenDy) || 1;

      return {
        id: asteroid.id,
        elite: Boolean(asteroid.elite),
        x: centerX + screenDx * scale,
        y: centerY + screenDy * scale,
        direction: { x: screenDx / length, y: screenDy / length },
        distance,
        closingSpeed,
        index
      };
    }).filter(Boolean).sort((a, b) =>
      a.distance - b.distance
      || b.closingSpeed - a.closingSpeed
      || Number(b.elite) - Number(a.elite)
      || a.index - b.index
    ).slice(0, maxWarnings);
  }

  return { selectEdgeWarnings };
});
