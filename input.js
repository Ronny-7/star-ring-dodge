(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingInput = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createInputController({
    windowObject,
    documentObject,
    getState,
    fireLaser,
    startGame,
    togglePause,
    pauseGame,
    handleSettingsKeydown,
    isCompactLandscapeMode = () => false,
    isForceLandscapeMode = () => false,
    requestLandscapeMode,
    openSettings,
    setLanguage,
    closeSettings,
    toggleMusic,
    toggleSfx,
    selectSkin,
    selectColor
  } = {}) {
    const inputWindow = windowObject || (typeof window !== "undefined" ? window : null);
    const inputDocument = documentObject || (typeof document !== "undefined" ? document : null);
    const keys = new Set();
    const fireKeys = new Set(["j", "J"]);
    let fireHeld = false;
    const gestureMovement = { active: false, pointerId: null, startX: 0, startY: 0, dx: 0, dy: 0 };

    function getKeyboardMovement() {
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
      if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
      return { dx, dy };
    }

    function hasActiveMovement() {
      const keyboard = getKeyboardMovement();
      return keyboard.dx !== 0 || keyboard.dy !== 0 || gestureMovement.dx !== 0 || gestureMovement.dy !== 0;
    }

    function updateGestureVisual() {
      const gesturePad = inputDocument?.querySelector("[data-gesture-pad]");
      if (!gesturePad) return;
      const thumbRange = isCompactLandscapeMode() ? 30 : 36;
      gesturePad.style.setProperty("--gesture-x", `${gestureMovement.dx * thumbRange}px`);
      gesturePad.style.setProperty("--gesture-y", `${gestureMovement.dy * thumbRange}px`);
      gesturePad.classList.toggle("is-active", gestureMovement.active);
    }

    function clearGestureMovement() {
      gestureMovement.active = false;
      gestureMovement.pointerId = null;
      gestureMovement.dx = 0;
      gestureMovement.dy = 0;
      updateGestureVisual();
    }

    function clearAll() {
      keys.clear();
      fireHeld = false;
      clearGestureMovement();
      inputDocument?.querySelectorAll("[data-touch-action]").forEach((button) => button.classList.remove("is-active"));
    }

    function setGestureMovement(event) {
      const maxDistance = isCompactLandscapeMode() ? 30 : 48;
      const deadZone = isCompactLandscapeMode() ? 4 : 7;
      const screenX = event.clientX - gestureMovement.startX;
      const screenY = event.clientY - gestureMovement.startY;
      const rawX = isForceLandscapeMode() ? screenY : screenX;
      const rawY = isForceLandscapeMode() ? -screenX : screenY;
      const distance = Math.hypot(rawX, rawY);
      if (distance < deadZone) {
        gestureMovement.dx = 0;
        gestureMovement.dy = 0;
        updateGestureVisual();
        return;
      }
      const scale = Math.min(1, distance / maxDistance);
      gestureMovement.dx = (rawX / distance) * scale;
      gestureMovement.dy = (rawY / distance) * scale;
      updateGestureVisual();
    }

    function pressTouchControl(button) {
      const key = button.dataset.touchKey;
      const action = button.dataset.touchAction;
      const state = getState?.() || {};
      if (key && !state.paused) keys.add(key);
      if (action === "fire") {
        fireHeld = true;
        fireLaser?.();
      }
      if (action === "pause") togglePause?.();
      button.classList.add("is-active");
    }

    function releaseTouchControl(button) {
      const key = button.dataset.touchKey;
      const action = button.dataset.touchAction;
      if (key) keys.delete(key);
      if (action === "fire") fireHeld = false;
      button.classList.remove("is-active");
    }

    function handleKeyDown(event) {
      if (handleSettingsKeydown?.(event)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const state = getState?.() || {};
      if (event.code === "Space") {
        event.preventDefault();
        if (!state.running || state.gameOver) startGame?.();
        return;
      }
      if (key === "p" || key === "Escape") {
        event.preventDefault();
        togglePause?.();
        return;
      }
      if (fireKeys.has(event.key)) {
        event.preventDefault();
        fireHeld = true;
        fireLaser?.();
        return;
      }
      if (!state.paused) keys.add(key);
    }

    function handleKeyUp(event) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keys.delete(key);
      if (fireKeys.has(event.key)) fireHeld = false;
    }

    function bind() {
      if (!inputWindow || !inputDocument) return;
      const touchControls = inputDocument.querySelectorAll("[data-touch-action]");
      const gesturePad = inputDocument.querySelector("[data-gesture-pad]");
      const orientationButton = inputDocument.querySelector("[data-orientation-button]");
      const settingsButton = inputDocument.getElementById("settings-button");
      const settingsCloseButton = inputDocument.querySelector(".settings-close");

      touchControls.forEach((button) => {
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          pressTouchControl(button);
        });
        button.addEventListener("pointerup", (event) => {
          event.preventDefault();
          releaseTouchControl(button);
        });
        button.addEventListener("pointercancel", () => releaseTouchControl(button));
        button.addEventListener("lostpointercapture", () => releaseTouchControl(button));
      });

      if (gesturePad) {
        gesturePad.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          gestureMovement.active = true;
          gestureMovement.pointerId = event.pointerId;
          gestureMovement.startX = event.clientX;
          gestureMovement.startY = event.clientY;
          gesturePad.setPointerCapture?.(event.pointerId);
          setGestureMovement(event);
        });
        gesturePad.addEventListener("pointermove", (event) => {
          if (!gestureMovement.active || gestureMovement.pointerId !== event.pointerId) return;
          event.preventDefault();
          setGestureMovement(event);
        });
        gesturePad.addEventListener("pointerup", (event) => {
          if (gestureMovement.pointerId === event.pointerId) {
            event.preventDefault();
            clearGestureMovement();
          }
        });
        gesturePad.addEventListener("pointercancel", clearGestureMovement);
        gesturePad.addEventListener("lostpointercapture", clearGestureMovement);
      }

      orientationButton?.addEventListener("click", requestLandscapeMode);
      settingsButton?.addEventListener("click", openSettings);
      inputDocument.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => setLanguage?.(button.dataset.lang)));
      settingsCloseButton?.addEventListener("click", closeSettings);
      inputDocument.getElementById("settings-overlay")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) closeSettings?.();
      });
      inputDocument.getElementById("settings-music-btn")?.addEventListener("click", toggleMusic);
      inputDocument.getElementById("settings-sfx-btn")?.addEventListener("click", toggleSfx);
      inputDocument.querySelectorAll("[data-skin]").forEach((button) => button.addEventListener("click", () => selectSkin?.(button.dataset.skin)));
      inputDocument.querySelectorAll("[data-color]").forEach((button) => button.addEventListener("click", () => selectColor?.(button.dataset.color)));
      inputWindow.addEventListener("keydown", handleKeyDown);
      inputWindow.addEventListener("keyup", handleKeyUp);
      inputWindow.addEventListener("blur", () => {
        clearAll();
        const state = getState?.() || {};
        if (state.running && !state.paused && !state.gameOver) pauseGame?.();
      });
    }

    return {
      keys,
      gestureMovement,
      bind,
      clearAll,
      clearGestureMovement,
      getKeyboardMovement,
      hasActiveMovement,
      isFireHeld: () => fireHeld,
      handleKeyDown,
      handleKeyUp,
      pressTouchControl,
      releaseTouchControl
    };
  }

  return { createInputController };
});
