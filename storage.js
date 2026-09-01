(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingStorage = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createDefaultProfile() {
    return {
      version: 1,
      lang: "zh",
      totals: {
        runs: 0,
        destroyedAsteroids: 0,
        collectedCores: 0,
        warps: 0,
        longestSurvival: 0,
        bestAccuracy: 0
      },
      unlocked: {}
    };
  }

  function normalizeProfile(raw) {
    const fallback = createDefaultProfile();
    if (!raw || typeof raw !== "object" || raw.version !== 1) {
      return fallback;
    }
    const totals = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
    const num = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
    return {
      version: 1,
      lang: raw.lang === "en" ? "en" : "zh",
      totals: {
        runs: num(totals.runs),
        destroyedAsteroids: num(totals.destroyedAsteroids),
        collectedCores: num(totals.collectedCores),
        warps: num(totals.warps),
        longestSurvival: num(totals.longestSurvival),
        bestAccuracy: num(totals.bestAccuracy)
      },
      unlocked: raw.unlocked && typeof raw.unlocked === "object" ? { ...raw.unlocked } : {}
    };
  }

  function readBestScore(storage, key) {
    try {
      const score = Number(storage.getItem(key) || 0);
      return Number.isFinite(score) && score >= 0 ? score : 0;
    } catch {
      return 0;
    }
  }

  function writeBestScore(storage, key, score) {
    try {
      storage.setItem(key, String(score));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }

  function loadProfile(storage, key) {
    try {
      const raw = storage.getItem(key);
      return normalizeProfile(raw ? JSON.parse(raw) : null);
    } catch {
      return createDefaultProfile();
    }
  }

  function saveProfile(storage, key, profile) {
    try {
      storage.setItem(key, JSON.stringify(profile));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }

  function recordRun(profile, stats, regionJunctions) {
    const accuracy = stats.shotsFired > 0
      ? Math.round((stats.shotsHit / stats.shotsFired) * 100)
      : 0;
    profile.totals.runs += 1;
    profile.totals.destroyedAsteroids += stats.destroyedAsteroids;
    profile.totals.collectedCores += stats.collectedCores;
    profile.totals.warps += regionJunctions;
    profile.totals.longestSurvival = Math.max(profile.totals.longestSurvival, Math.floor(stats.survivalTime));
    profile.totals.bestAccuracy = Math.max(profile.totals.bestAccuracy, accuracy);
    return profile;
  }

  return {
    createDefaultProfile,
    normalizeProfile,
    readBestScore,
    writeBestScore,
    loadProfile,
    saveProfile,
    recordRun
  };
});
