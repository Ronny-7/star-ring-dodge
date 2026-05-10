window.starRingConfig = {
  bestKey: "star-ring-dodge-best",

  tuning: {
    safeSpawnDistance: 260,
    maxSpawnAttempts: 8,
    hitInvulnerability: 0.9,
    hitFlashDuration: 0.34,
    difficultyStep: 5.5,
    baseSpawnInterval: 1.05,
    minSpawnInterval: 0.42,
    spawnIntervalStep: 0.045,
    asteroidSpeedStep: 0.055,
    maxSpeedScale: 1.95,
    screenShakeDecay: 32,
    powerUpSpawnInterval: 9,
    doubleShotDuration: 8,
    pickupSafeDistance: 120,
    pickupAsteroidDistance: 132,
    maxPickupSpawnAttempts: 18,
    asteroidWarningDistance: 96,
    idleFrameInterval: 1000 / 12
  },

  uiText: {
    startTitle: "按空格开始",
    startText: "方向键或 WASD 移动，J 发射激光，P 或 Esc 暂停。拾取蓝色能量核得分，激光可以击碎陨石。",
    startButton: "开始游戏",
    pauseTitle: "已暂停",
    pauseText: "按 P、Esc 或点击按钮继续。",
    pauseButton: "继续游戏",
    recordTitle: "刷新纪录",
    gameOverTitle: "本局结束",
    restartButton: "再来一局",
    newRecord: (score) => `你创下了 ${score} 分的新纪录，按空格可以立即再来一局。`,
    gameOver: (score) => `你的分数是 ${score}。按空格可以立即重开。`
  }
};
