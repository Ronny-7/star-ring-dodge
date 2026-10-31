// One page, two views. The landing view is the entry point and the game boots
// on demand; once booted it is never unloaded, because app.js and input.js bind
// document listeners at load and have no unbind path.
(function () {
  const landing = document.getElementById("landing");
  const gameView = document.getElementById("game-view");
  const startButton = document.getElementById("start-game");
  const backHomeButton = document.getElementById("back-home");
  const bootError = document.getElementById("boot-error");

  // Bump these queries with the build tag so browsers skip stale copies.
  const GAME_SCRIPTS = [
    "config.js?v=4.7.2",
    "bindings.js?v=4.7.2",
    "storage.js?v=4.7.2",
    "audio.js?v=4.7.2",
    "projection.js?v=4.7.2",
    "edge-warning.js?v=4.7.2",
    "renderer.js?v=4.7.2",
    "input.js?v=4.7.2",
    "app.js?v=4.7.2"
  ];

  let booting = null;
  let opening = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = src;
      tag.onload = () => resolve();
      tag.onerror = () => reject(new Error("failed to load " + src));
      document.head.append(tag);
    });
  }

  function bootGame() {
    if (!booting) {
      booting = GAME_SCRIPTS
        .reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve())
        .catch((error) => {
          booting = null;
          throw error;
        });
    }
    return booting;
  }

  function exitStageFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  function showGameView() {
    if (!gameView.hidden) return;
    exitStageFullscreen();
    gameView.classList.add("is-booting");
    landing.hidden = true;
    gameView.hidden = false;
    document.body.dataset.view = "game";
    window.dispatchEvent(new Event("resize"));
  }

  function showLandingView() {
    window.starRingGame?.leave();
    gameView.hidden = true;
    landing.hidden = false;
    document.body.dataset.view = "landing";
    // The stage was 0x0 while hidden; restored size and a repaint need this.
    window.dispatchEvent(new Event("resize"));
    startButton.focus({ preventScroll: true });
  }

  function openGame() {
    // Already in the game view: opening it again must not restart the run.
    if (!gameView.hidden) return Promise.resolve();
    if (opening) return opening;
    showGameView();
    opening = (async () => {
      try {
        await bootGame();
        if (!await window.starRingWorldReady) return;
        window.starRingGame.start();
        bootError.hidden = true;
      } catch (error) {
        console.error("Game failed to boot:", error);
        bootError.hidden = false;
      } finally {
        gameView.classList.remove("is-booting");
        opening = null;
      }
    })();
    return opening;
  }

  function closeGame() {
    showLandingView();
    if (location.hash === "#play") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  startButton.addEventListener("click", () => {
    if (location.hash === "#play") void openGame();
    else location.hash = "play";
  });
  backHomeButton.addEventListener("click", closeGame);
  window.addEventListener("hashchange", () => {
    if (location.hash === "#play") void openGame();
    else closeGame();
  });

  // ?test=1 boots straight into a run for the browser suites; #play is a
  // bookmarkable entry and the browser back button returns to the landing.
  if (new URLSearchParams(location.search).has("test") || location.hash === "#play") {
    void openGame();
  }
})();
