(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingRenderer = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createRenderLoop({ windowObject, state, tuning, update, draw }) {
    let lastIdleFrame = 0;

    function frame(timestamp) {
      if (!state.lastTime) state.lastTime = timestamp;
      const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000);
      state.lastTime = timestamp;
      update(dt);
      const active = state.running && !state.paused && !state.gameOver;
      if (active || timestamp - lastIdleFrame >= tuning.idleFrameInterval) {
        draw();
        lastIdleFrame = timestamp;
      }
      windowObject.requestAnimationFrame(frame);
    }

    return { start: () => windowObject.requestAnimationFrame(frame) };
  }

  return { createRenderLoop };
});
