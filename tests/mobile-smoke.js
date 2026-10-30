const result = { error: null, checks: [] };
const check = (name, condition) => {
  if (!condition) throw new Error(name);
  result.checks.push(name);
};

const finish = () => {
  const text = "MOBILE_SMOKE_RESULT:" + JSON.stringify(result);
  document.body.textContent = text;
  document.title = text;
};

const waitFor = (predicate, timeout = 10000) => new Promise((resolve, reject) => {
  const started = performance.now();
  const poll = () => {
    const value = predicate();
    if (value) return resolve(value);
    if (performance.now() - started > timeout) return reject(new Error("timed out waiting for mobile game"));
    setTimeout(poll, 25);
  };
  poll();
});

const pointer = (target, type, options) => target.dispatchEvent(new PointerEvent(type, {
  bubbles: true,
  cancelable: true,
  pointerType: "touch",
  isPrimary: true,
  ...options
}));

const tap = (target, pointerId) => {
  const events = [];
  for (const type of ["pointerdown", "pointerup", "click"]) {
    target.addEventListener(type, () => events.push(type), { once: true });
  }
  pointer(target, "pointerdown", { pointerId });
  pointer(target, "pointerup", { pointerId });
  target.dispatchEvent(new PointerEvent("click", {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: "touch",
    isPrimary: true
  }));
  check(`touch tap completes pointer lifecycle for ${target.id}`, events.join(",") === "pointerdown,pointerup,click");
};

try {
  const api = window.starRingTestApi;
  await window.starRingWorldReady;
  await waitFor(() => document.body.dataset.view === "game" && api.getState().running);

  check(`game runs in a 390x844 mobile viewport (actual ${innerWidth}x${innerHeight})`, innerWidth === 390 && innerHeight === 844);
  await waitFor(() => getComputedStyle(document.querySelector("[data-look-pad]")).display !== "none");
  check("mobile viewport displays both gesture surfaces", getComputedStyle(document.querySelector("[data-gesture-pad]")).display !== "none" && getComputedStyle(document.querySelector("[data-look-pad]")).display !== "none");

  api.setForceLandscape(true);
  check("forced landscape switches the compact mobile layout", document.body.classList.contains("force-landscape") && document.body.classList.contains("landscape-layout"));
  api.setForceLandscape(false);

  const gesturePad = document.querySelector("[data-gesture-pad]");
  const lookPad = document.querySelector("[data-look-pad]");
  const fireButton = document.getElementById("touch-fire-btn");
  const pauseButton = document.getElementById("touch-pause-btn");
  for (const target of [gesturePad, lookPad, fireButton, pauseButton]) target.setPointerCapture = () => {};

  pointer(gesturePad, "pointerdown", { pointerId: 1, clientX: 60, clientY: 650 });
  pointer(gesturePad, "pointermove", { pointerId: 1, clientX: 90, clientY: 620 });
  const moving = api.getInputDebug();
  check("left touch drag produces forward and strafe movement", moving.move.forward > 0 && moving.move.strafe > 0);
  pointer(gesturePad, "pointerup", { pointerId: 1, clientX: 90, clientY: 620 });

  pointer(lookPad, "pointerdown", { pointerId: 2, clientX: 280, clientY: 420 });
  pointer(lookPad, "pointermove", { pointerId: 2, clientX: 310, clientY: 440 });
  const looking = api.getInputDebug();
  check("right touch drag produces yaw and pitch look input", looking.look.yaw > 0 && looking.look.pitch > 0);
  pointer(lookPad, "pointerup", { pointerId: 2, clientX: 310, clientY: 440 });

  const shotsBefore = api.getScene().shotsFired;
  pointer(fireButton, "pointerdown", { pointerId: 3 });
  check("touch fire shoots and holds fire", api.getScene().shotsFired === shotsBefore + 1 && api.getInputDebug().fireHeld);
  pointer(fireButton, "pointerup", { pointerId: 3 });
  check("touch fire release clears held fire", api.getInputDebug().fireHeld === false);

  pointer(pauseButton, "pointerdown", { pointerId: 4 });
  pointer(pauseButton, "pointerup", { pointerId: 4 });
  check("touch pause opens the pause state", api.getState().paused && !document.getElementById("back-home").hidden);
  pointer(pauseButton, "pointerdown", { pointerId: 5 });
  pointer(pauseButton, "pointerup", { pointerId: 5 });

  const settingsButton = document.getElementById("settings-button");
  settingsButton.focus();
  tap(settingsButton, 7);
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsCloseButton = document.getElementById("settings-close-button");
  await waitFor(() => document.activeElement === settingsCloseButton);
  check("settings opens, pauses, and focuses its close button", !settingsOverlay.classList.contains("hidden") && api.getState().paused);
  dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  check("settings traps keyboard focus inside the dialog", document.activeElement === document.querySelector('[data-lang="en"]'));
  tap(settingsCloseButton, 8);
  check("settings closes, resumes, and restores focus", settingsOverlay.classList.contains("hidden") && !api.getState().paused && document.activeElement === settingsButton);

  pointer(pauseButton, "pointerdown", { pointerId: 6 });
  pointer(pauseButton, "pointerup", { pointerId: 6 });
  tap(document.getElementById("back-home"), 9);
  check("pause return goes back to the landing view", document.body.dataset.view === "landing" && !document.getElementById("landing").hidden && document.getElementById("game-view").hidden);
} catch (error) {
  result.error = error.message;
}
finish();
