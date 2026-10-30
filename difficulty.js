(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingDifficulty = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function updateSpawnRelief({ asteroidCount, maxAsteroids, spawnInterval, previousRelief, deltaSeconds }) {
    const capacity = Math.max(1, maxAsteroids);
    const interval = Math.max(0, spawnInterval);
    const maxRelief = interval * 0.75;
    const threshold = capacity * 0.8;
    const pressure = Math.max(0, Math.min(1, (asteroidCount - threshold) / (capacity - threshold)));
    const target = maxRelief * pressure;
    const current = Math.max(0, Math.min(maxRelief, previousRelief));
    const seconds = Math.max(0, deltaSeconds);
    const rate = interval * (target > current ? 0.5 : 0.25);

    return target > current
      ? Math.min(target, current + rate * seconds)
      : Math.max(target, current - rate * seconds);
  }

  return { updateSpawnRelief };
});
