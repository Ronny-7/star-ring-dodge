const test = require("node:test");
const assert = require("node:assert/strict");

const { updateSpawnRelief } = require("../difficulty.js");

test("spawn relief activates near asteroid capacity", () => {
  const relief = updateSpawnRelief({
    asteroidCount: 27,
    maxAsteroids: 30,
    spawnInterval: 1,
    previousRelief: 0,
    deltaSeconds: 1
  });

  assert.equal(relief, 0.375);
});

test("spawn relief cannot exceed three quarters of the difficulty interval", () => {
  const relief = updateSpawnRelief({
    asteroidCount: 30,
    maxAsteroids: 30,
    spawnInterval: 1,
    previousRelief: 0.7,
    deltaSeconds: 1
  });

  assert.equal(relief, 0.75);
});

test("spawn relief recovers smoothly toward zero after the field clears", () => {
  const relief = updateSpawnRelief({
    asteroidCount: 0,
    maxAsteroids: 30,
    spawnInterval: 1,
    previousRelief: 0.5,
    deltaSeconds: 1
  });

  assert.equal(relief, 0.25);
});

test("spawn relief stays off below eighty percent capacity", () => {
  const relief = updateSpawnRelief({
    asteroidCount: 23,
    maxAsteroids: 30,
    spawnInterval: 1,
    previousRelief: 0,
    deltaSeconds: 1
  });

  assert.equal(relief, 0);
});
