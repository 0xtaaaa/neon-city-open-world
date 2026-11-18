// Procedural sound: every noise the game makes is synthesised with the
// Web Audio API, so the game ships no audio files and works offline. The
// engine hums with speed, sirens wail two tones, shots crack, and pickups
// blip. Everything is guarded: no audio context, no sound, no crash.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that an LFO swings between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 780;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, volume, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noiseBurst(dur, volume, lowpass) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call from any user gesture; browsers block audio before one. */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Continuous engine hum; speed 0 silences it. */
    engine(speed, maxSpeed) {
      if (!ctx || muted) return;
      try {
        const ratio = Math.min(1, Math.abs(speed) / maxSpeed);
        engineOsc.frequency.value = 55 + ratio * 130;
        engineGain.gain.value = speed === 0 ? 0 : 0.045 + ratio * 0.05;
      } catch {
        // Ignore.
      }
    },
    siren(on) {
      if (!ctx || muted) return;
      try {
        sirenGain.gain.value = on ? 0.05 : 0;
      } catch {
        // Ignore.
      }
    },
    shot() {
      noiseBurst(0.12, 0.5, 2800);
    },
    punch() {
      noiseBurst(0.08, 0.3, 900);
    },
    crash() {
      noiseBurst(0.25, 0.45, 500);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.35, 990);
    },
    cash() {
      blip(880, 0.1, 'sine', 0.3, 1320);
    },
    mission() {
      blip(523, 0.14, 'triangle', 0.35);
      setTimeout(() => blip(659, 0.14, 'triangle', 0.35), 130);
      setTimeout(() => blip(784, 0.22, 'triangle', 0.35), 260);
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.3, 110);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
  };
}
