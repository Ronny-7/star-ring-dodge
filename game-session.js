(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingGameSession = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createGameSession(defaultRegionId = "drift") {
    const session = {
      running: false,
      paused: false,
      gameOver: false,
      regionId: defaultRegionId,
      regionJunctions: 0,
      eliteSpawned: false,
      language: "zh"
    };

    return {
      start() {
        session.running = true;
        session.paused = false;
        session.gameOver = false;
        session.regionId = defaultRegionId;
        session.regionJunctions = 0;
        session.eliteSpawned = false;
      },
      pause() {
        if (session.running && !session.gameOver) session.paused = true;
      },
      resume() {
        if (session.running && !session.gameOver) session.paused = false;
      },
      end() {
        session.running = false;
        session.paused = false;
        session.gameOver = true;
      },
      warp(regionId) {
        if (!session.running || session.gameOver || !regionId) return false;
        session.regionId = regionId;
        session.regionJunctions += 1;
        return true;
      },
      markEliteSpawned() {
        if (!session.running || session.paused || session.gameOver) return false;
        session.eliteSpawned = true;
        return true;
      },
      setLanguage(language) {
        if (language !== "zh" && language !== "en") return false;
        session.language = language;
        return true;
      },
      snapshot() { return { ...session }; }
    };
  }

  return { createGameSession };
});
