(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingInput = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Hysteresis: engage only near the stick edge, release only well below it,
  // so a stick hovering around the threshold does not flutter the boost.
  function nextBoostState(previous, magnitude, on, off) {
    if (previous) return magnitude > off;
    return magnitude >= on;
  }

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
    selectColor,
    getCanvas,
    tuning = {}
  } = {}) {
    const inputWindow = windowObject || (typeof window !== "undefined" ? window : null);
    const inputDocument = documentObject || (typeof document !== "undefined" ? document : null);
    const keys = new Set();
    const fireKeys = new Set(["j", "J"]);
    let fireHeld = false;
    const gestureMovement = { active: false, pointerId: null, startX: 0, startY: 0, dx: 0, dy: 0, boost: false };
    // Chromium pointer lock occasionally reports a bogus 300-600 px step
    // (about half the window) for a single event; real mouse steps stay far
    // below this even on fast flicks. Drop such an event instead of turning.
    const MAX_MOUSE_STEP = 200;
    const lookDelta = { yaw: 0, pitch: 0 };
    const lookDrag = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    const mouseDrag = { active: false, lastX: 0, lastY: 0 };
    let gesturePad = null;
    let lookPad = null;
    let pointerLocked = false;

    function getKeyboardMovement() {
      let forward = 0;
      let strafe = 0;
      if (keys.has("ArrowUp") || keys.has("w")) forward += 1;
      if (keys.has("ArrowDown") || keys.has("s")) forward -= 1;
      if (keys.has("a")) strafe -= 1;
      if (keys.has("d")) strafe += 1;
      if (keys.has("ArrowLeft")) strafe -= 1;
      if (keys.has("ArrowRight")) strafe += 1;
      return { forward, strafe };
    }

    function isBoostKeyDown() {
      return keys.has("Shift") || keys.has("ShiftLeft") || keys.has("ShiftRight");
    }

    function isBoosting() {
      return isBoostKeyDown() || gestureMovement.boost;
    }

    // Combined move input: keyboard plus the left-half touch drag.
    function getMoveInput() {
      const keyboard = getKeyboardMovement();
      const forward = clampUnit(keyboard.forward - gestureMovement.dy);
      const strafe = clampUnit(keyboard.strafe + gestureMovement.dx);
      return { forward, strafe };
    }

    function clampUnit(value) {
      return Math.max(-1, Math.min(1, value));
    }

    function hasActiveMovement() {
      const move = getMoveInput();
      return move.forward !== 0 || move.strafe !== 0;
    }

    // Look input is drained by the game loop: mouse deltas and right-side drags
    // both land here so the camera code has a single source.
    function consumeLook() {
      const yaw = lookDelta.yaw;
      const pitch = lookDelta.pitch;
      lookDelta.yaw = 0;
      lookDelta.pitch = 0;
      return { yaw, pitch };
    }

    function addLook(dx, dy, sensitivity) {
      lookDelta.yaw += dx * sensitivity;
      lookDelta.pitch += dy * sensitivity;
    }

    function filterMouseStep(value) {
      const step = value || 0;
      return Math.abs(step) > MAX_MOUSE_STEP ? 0 : step;
    }

    function updateGestureVisual() {
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
      gestureMovement.boost = false;
      updateGestureVisual();
    }

    function clearAll() {
      keys.clear();
      fireHeld = false;
      clearGestureMovement();
      clearLookDrag();
      mouseDrag.active = false;
      lookDelta.yaw = 0;
      lookDelta.pitch = 0;
      inputDocument?.querySelectorAll("[data-touch-action]").forEach((button) => button.classList.remove("is-active"));
    }

    function clearLookDrag() {
      lookDrag.active = false;
      lookDrag.pointerId = null;
    }

    function setGestureMovement(event) {
      const maxDistance = isCompactLandscapeMode() ? 30 : 48;
      const deadZone = isCompactLandscapeMode() ? 4 : 7;
      const screenX = event.clientX - gestureMovement.startX;
      const screenY = event.clientY - gestureMovement.startY;
      const rawX = isForceLandscapeMode() ? screenY : screenX;
      const rawY = isForceLandscapeMode() ? -screenX : screenY;
      const distance = Math.hypot(rawX, rawY);
      const boostOn = tuning.touchBoostOn;
      const boostOff = tuning.touchBoostOff;
      if (distance < deadZone) {
        gestureMovement.dx = 0;
        gestureMovement.dy = 0;
        gestureMovement.boost = nextBoostState(gestureMovement.boost, 0, boostOn, boostOff);
        updateGestureVisual();
        return;
      }
      const scale = Math.min(1, distance / maxDistance);
      gestureMovement.dx = (rawX / distance) * scale;
      gestureMovement.dy = (rawY / distance) * scale;
      gestureMovement.boost = nextBoostState(gestureMovement.boost, scale, boostOn, boostOff);
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
      if (!state.paused) {
        keys.add(key);
        // Browsers report Shift as event.key "Shift"; event.code also covers
        // ShiftLeft / ShiftRight for synthetic and remapped input.
        if (event.code) keys.add(event.code);
      }
    }

    function handleKeyUp(event) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keys.delete(key);
      if (event.code) keys.delete(event.code);
      if (fireKeys.has(event.key)) fireHeld = false;
    }

    function bind() {
      if (!inputWindow || !inputDocument) return;
      const touchControls = inputDocument.querySelectorAll("[data-touch-action]");
      gesturePad = inputDocument.querySelector("[data-gesture-pad]");
      lookPad = inputDocument.querySelector("[data-look-pad]");
      const canvasEl = getCanvas ? getCanvas() : inputDocument.getElementById("game");
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

      // Right-half drag looks around (mobile counterpart to the mouse).
      if (lookPad) {
        lookPad.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          lookDrag.active = true;
          lookDrag.pointerId = event.pointerId;
          lookDrag.lastX = event.clientX;
          lookDrag.lastY = event.clientY;
          lookPad.setPointerCapture?.(event.pointerId);
        });
        lookPad.addEventListener("pointermove", (event) => {
          if (!lookDrag.active || lookDrag.pointerId !== event.pointerId) return;
          event.preventDefault();
          const dx = event.clientX - lookDrag.lastX;
          const dy = event.clientY - lookDrag.lastY;
          lookDrag.lastX = event.clientX;
          lookDrag.lastY = event.clientY;
          addLook(dx, dy, getState?.()?.touchLookSensitivity ?? 0.006);
        });
        lookPad.addEventListener("pointerup", () => clearLookDrag());
        lookPad.addEventListener("pointercancel", clearLookDrag);
        lookPad.addEventListener("lostpointercapture", clearLookDrag);
      }

      // Mouse look: prefer pointer lock; fall back to drag-to-look when the
      // browser refuses it (headless, embedded frames, denied permission).
      const retryPointerLock = () => {
        try {
          canvasEl.requestPointerLock?.()?.catch?.(() => {});
        } catch {
          // Right-drag still works.
        }
      };
      inputDocument.addEventListener("pointerlockchange", () => {
        pointerLocked = inputDocument.pointerLockElement === canvasEl;
      });
      inputDocument.addEventListener("mousemove", (event) => {
        const state = getState?.() || {};
        if (!state.running || state.paused || state.gameOver) return;

        if (pointerLocked) {
          addLook(filterMouseStep(event.movementX), filterMouseStep(event.movementY), state.mouseSensitivity ?? 0.0024);
        } else if (mouseDrag.active) {
          const dx = event.clientX - mouseDrag.lastX;
          const dy = event.clientY - mouseDrag.lastY;
          mouseDrag.lastX = event.clientX;
          mouseDrag.lastY = event.clientY;
          addLook(dx, dy, state.mouseSensitivity ?? 0.0024);
        }
      });
      // Left mouse button fires; the right button (when pointer lock is
      // unavailable) drags to look. Firing is the primary action, so it must
      // never be swallowed by the look fallback.
      canvasEl?.addEventListener("mousedown", (event) => {
        const state = getState?.() || {};
        if (!state.running || state.paused || state.gameOver) return;

        if (event.button === 0) {
          event.preventDefault();
          fireHeld = true;
          fireLaser?.();
          if (!pointerLocked) {
            try {
              // Raw input avoids Chromium's occasional huge movement deltas.
              const request = canvasEl.requestPointerLock?.({ unadjustedMovement: true });
              request?.catch?.(retryPointerLock);
            } catch {
              retryPointerLock();
            }
          }
          return;
        }

        if (event.button === 2 && !pointerLocked) {
          event.preventDefault();
          mouseDrag.active = true;
          mouseDrag.lastX = event.clientX;
          mouseDrag.lastY = event.clientY;
        }
      });
      canvasEl?.addEventListener("contextmenu", (event) => event.preventDefault());
      inputDocument.addEventListener("mouseup", (event) => {
        if (event.button === 0) fireHeld = false;
        if (event.button === 2) mouseDrag.active = false;
      });

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
      gestureMovement,
      lookDelta,
      bind,
      clearAll,
      clearGestureMovement,
      getKeyboardMovement,
      getMoveInput,
      hasActiveMovement,
      consumeLook,
      isFireHeld: () => fireHeld,
      isBoosting,
      handleKeyDown,
      handleKeyUp,
      pressTouchControl,
      releaseTouchControl
    };
  }

  return { createInputController, nextBoostState };
});
