(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingAudio = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createAudioController({ windowObject, navigatorObject } = {}) {
    const audioWindow = windowObject || (typeof window !== "undefined" ? window : {});
    const audioNavigator = navigatorObject || (typeof navigator !== "undefined" ? navigator : {});
    let audioCtx = null;
    let musicEnabled = true;
    let sfxEnabled = true;
    let musicNodes = [];

    function getAudioContext() {
      if (audioCtx) return audioCtx;
      const AudioContextCtor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        audioCtx = new AudioContextCtor();
        return audioCtx;
      } catch {
        return null;
      }
    }

    async function ensureAudioRunning(ctx) {
      if (ctx.state !== "suspended") return true;
      try {
        await ctx.resume();
        return true;
      } catch {
        return false;
      }
    }

    async function startMusic() {
      if (!musicEnabled || musicNodes.length) return;
      const ctxAudio = getAudioContext();
      if (!ctxAudio || !(await ensureAudioRunning(ctxAudio))) return;
      if (!musicEnabled || musicNodes.length) return;
      const master = ctxAudio.createGain();
      master.gain.setValueAtTime(0.06, ctxAudio.currentTime);
      master.connect(ctxAudio.destination);

      const bass = ctxAudio.createOscillator();
      const bassG = ctxAudio.createGain();
      bass.type = "sine";
      bass.frequency.value = 55;
      bassG.gain.value = 0.5;
      bass.connect(bassG); bassG.connect(master);
      bass.start();

      const pad = ctxAudio.createOscillator();
      const padG = ctxAudio.createGain();
      pad.type = "triangle";
      pad.frequency.value = 110;
      padG.gain.value = 0.3;
      pad.connect(padG); padG.connect(master);
      pad.start();

      const lfo = ctxAudio.createOscillator();
      const lfoG = ctxAudio.createGain();
      lfo.frequency.value = 0.18;
      lfoG.gain.value = 0.15;
      lfo.connect(lfoG); lfoG.connect(padG.gain);
      lfo.start();
      musicNodes = [bass, pad, lfo, bassG, padG, lfoG, master];
    }

    function stopMusic() {
      for (const node of musicNodes) {
        try { node.stop ? node.stop() : node.disconnect(); } catch {}
      }
      musicNodes = [];
    }

    function playSound(type) {
      if (!sfxEnabled) return;
      const vibrationMap = { shoot: 10, hit: 20, explode: 40, pickup: 15, hurt: 80 };
      const vibrationDuration = vibrationMap[type];
      if (!vibrationDuration) return;
      if (audioNavigator.vibrate) audioNavigator.vibrate(vibrationDuration);

      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;
      if (ctxAudio.state === "suspended") ctxAudio.resume().catch(() => {});
      const now = ctxAudio.currentTime;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.connect(gain); gain.connect(ctxAudio.destination);

      if (type === "shoot") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now); osc.stop(now + 0.07);
      } else if (type === "hit") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
      } else if (type === "explode") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(18, now + 0.35);
        const filter = ctxAudio.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 400;
        osc.disconnect(); osc.connect(filter); filter.connect(gain);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.35);
      } else if (type === "pickup") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.1, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now); osc.stop(now + 0.22);
      } else if (type === "hurt") {
        osc.type = "square";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.28);
        gain.gain.setValueAtTime(0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now); osc.stop(now + 0.28);
      }
    }

    return {
      startMusic,
      stopMusic,
      playSound,
      toggleMusic() { musicEnabled = !musicEnabled; if (musicEnabled) startMusic(); else stopMusic(); return musicEnabled; },
      toggleSfx() { sfxEnabled = !sfxEnabled; return sfxEnabled; },
      isMusicEnabled: () => musicEnabled,
      isSfxEnabled: () => sfxEnabled
    };
  }

  return { createAudioController };
});
