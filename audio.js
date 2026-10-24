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
    // Background music starts off: the drone is not to everyone's taste and
    // autoplaying audio is intrusive. Players opt in from the settings panel.
    let musicEnabled = false;
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

      // Ambient pad: a slow minor-key progression with drifting detune and a
      // long attack, close to the sparse organ-and-strings feel of the
      // Interstellar score. All synthesised, so nothing is bundled.
      const master = ctxAudio.createGain();
      master.gain.setValueAtTime(0, ctxAudio.currentTime);
      master.gain.linearRampToValueAtTime(0.085, ctxAudio.currentTime + 3);
      master.connect(ctxAudio.destination);

      const reverb = ctxAudio.createConvolver();
      reverb.buffer = makeReverbImpulse(ctxAudio, 2.8, 2.4);
      const wet = ctxAudio.createGain();
      wet.gain.value = 0.55;
      reverb.connect(wet);
      wet.connect(master);

      const bus = ctxAudio.createGain();
      bus.connect(master);
      bus.connect(reverb);

      // Am - F - C - G, one chord every 8 seconds, voiced low and wide.
      const chords = [
        [110.0, 164.81, 261.63],
        [87.31, 130.81, 220.0],
        [130.81, 196.0, 329.63],
        [98.0, 146.83, 246.94]
      ];

      const voices = [];
      const lfos = [];
      for (let i = 0; i < chords.length; i += 1) {
        const chordGain = ctxAudio.createGain();
        chordGain.gain.value = 0;
        chordGain.connect(bus);

        for (const freq of chords[i]) {
          for (const detune of [-4, 4]) {
            const osc = ctxAudio.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            osc.detune.value = detune;
            const g = ctxAudio.createGain();
            g.gain.value = 0.22;
            osc.connect(g);
            g.connect(chordGain);
            osc.start();
            voices.push(osc);
          }
        }

        // Slow swell so the pad breathes instead of sitting flat.
        const lfo = ctxAudio.createOscillator();
        const lfoGain = ctxAudio.createGain();
        lfo.frequency.value = 0.045 + i * 0.011;
        lfoGain.gain.value = 0.12;
        lfo.connect(lfoGain);
        lfoGain.connect(chordGain.gain);
        lfo.start();
        lfos.push(lfo);

        const start = ctxAudio.currentTime + i * 8;
        chordGain.gain.setValueAtTime(0, start);
        chordGain.gain.linearRampToValueAtTime(0.5, start + 4);
        chordGain.gain.linearRampToValueAtTime(0.18, start + 8);
      }

      // Sub drone that ties the progression together.
      const drone = ctxAudio.createOscillator();
      const droneGain = ctxAudio.createGain();
      drone.type = "sine";
      drone.frequency.value = 55;
      droneGain.gain.value = 0.3;
      drone.connect(droneGain);
      droneGain.connect(bus);
      drone.start();

      // Tick a metronome-free pulse: a soft low note every 8s marks the change.
      const pulse = ctxAudio.createOscillator();
      const pulseGain = ctxAudio.createGain();
      pulse.type = "triangle";
      pulse.frequency.value = 55;
      pulseGain.gain.value = 0;
      pulse.connect(pulseGain);
      pulseGain.connect(bus);
      pulse.start();

      musicNodes = [master, reverb, wet, bus, drone, droneGain, pulse, pulseGain, ...voices, ...lfos];
    }

    // Cheap synthetic impulse response so the pad gets a long tail.
    function makeReverbImpulse(ctxAudio, seconds, decay) {
      const rate = ctxAudio.sampleRate;
      const length = Math.floor(rate * seconds);
      const buffer = ctxAudio.createBuffer(2, length, rate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }
      return buffer;
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
