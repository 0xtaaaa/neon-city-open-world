// Neon City — all sound is generated with WebAudio: no audio files.
// Three procedural radio stations (a step sequencer per station), engine
// hum, gunshots, sirens, pickups and UI blips. Everything is guarded so a
// suspended AudioContext (before the first user gesture, or headless)
// never throws.

let ctx = null;
let master = null;
let radioGain = null;
let engineOsc = null;
let engineGain = null;
let sirenNodes = null;
let radioTimer = null;
let radioStep = 0;
let currentStation = -1;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    radioGain = ctx.createGain();
    radioGain.gain.value = 0.30;
    radioGain.connect(master);
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineGain.connect(master);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    engineOsc.connect(lp);
    lp.connect(engineGain);
    engineOsc.start();
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

export function initAudio() { ensureCtx(); }

export function resumeAudio() {
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// Short noise burst (gunshot, impact, explosion).
function noiseBurst(dur, vol, freq) {
  const c = ensureCtx();
  if (!c || !master) return;
  try {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  } catch (err) { /* audio is best-effort */ }
}

// Short oscillator blip.
function blip(freq, dur, vol, type = 'sine', slideTo = 0) {
  const c = ensureCtx();
  if (!c || !master) return;
  try {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  } catch (err) { /* audio is best-effort */ }
}

export const sfx = {
  shoot(kind) {
    if (kind === 'shotgun') { noiseBurst(0.22, 0.5, 900); blip(120, 0.12, 0.3, 'square', 50); }
    else if (kind === 'smg') { noiseBurst(0.07, 0.25, 1800); }
    else { noiseBurst(0.12, 0.35, 1400); blip(220, 0.06, 0.2, 'square', 90); }
  },
  reload() { blip(500, 0.07, 0.15, 'square'); setTimeout(() => blip(700, 0.07, 0.15, 'square'), 120); },
  hit() { noiseBurst(0.08, 0.3, 700); },
  pickup() { blip(660, 0.09, 0.2); setTimeout(() => blip(990, 0.12, 0.2), 90); },
  cash() { blip(880, 0.08, 0.2); setTimeout(() => blip(1174, 0.1, 0.2), 80); setTimeout(() => blip(1568, 0.14, 0.2), 160); },
  mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 0.22), i * 110)); },
  fail() { blip(220, 0.4, 0.25, 'sawtooth', 110); },
  click() { blip(800, 0.05, 0.12, 'square'); },
  engine(on, speedFrac) {
    if (!engineGain || !engineOsc) return;
    try {
      engineGain.gain.setTargetAtTime(on ? 0.05 + speedFrac * 0.06 : 0.0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speedFrac * 130, ctx.currentTime, 0.1);
    } catch (err) { /* ignore */ }
  },
  siren(on) {
    const c = ensureCtx();
    if (!c || !master) return;
    try {
      if (on && !sirenNodes) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 700;
        const lfo = c.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.9;
        const lg = c.createGain();
        lg.gain.value = 250;
        lfo.connect(lg); lg.connect(o.frequency);
        const g = c.createGain();
        g.gain.value = 0.045;
        o.connect(g); g.connect(master);
        o.start(); lfo.start();
        sirenNodes = { o, lfo, g };
      } else if (!on && sirenNodes) {
        sirenNodes.g.gain.setTargetAtTime(0, c.currentTime, 0.1);
        const nodes = sirenNodes;
        setTimeout(() => { try { nodes.o.stop(); nodes.lfo.stop(); } catch (e) {} }, 400);
        sirenNodes = null;
      }
    } catch (err) { /* ignore */ }
  },
  setMuted(m) {
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
  },
};

// ---- Radio: three procedural stations, 16-step sequencer ----
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  blues: [0, 3, 5, 6, 7, 10],
};
const ROOTS = { 0: 55, 1: 65.41, 2: 49 }; // A1, C2, G1

function noteFreq(root, scale, degree, octave = 0) {
  const s = SCALES[scale];
  const idx = ((degree % s.length) + s.length) % s.length;
  const oct = Math.floor(degree / s.length) + octave;
  return root * Math.pow(2, (s[idx] + oct * 12) / 12);
}

function playTone(freq, when, dur, vol, type) {
  const c = ctx;
  if (!c || !radioGain) return;
  try {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(radioGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  } catch (err) { /* ignore */ }
}

function stationStep(station, step) {
  if (!ctx) return;
  const now = ctx.currentTime + 0.05;
  const beat = 60 / [112, 84, 100][station] / 4; // 16th notes
  const t = now + step * 0; // scheduled per tick below
  void t;
  if (station === 0) {
    // NEON FM — synthwave: driving bass 8ths + arpeggio 16ths.
    if (step % 2 === 0) playTone(noteFreq(ROOTS[0], 'minor', [0, 0, 3, 5][Math.floor(step / 4) % 4], -1), now, beat * 1.8, 0.5, 'sawtooth');
    if (step % 4 === 2) playTone(noteFreq(ROOTS[0], 'minor', [7, 10, 12, 10][Math.floor(step / 4) % 4], 1), now, beat, 0.12, 'square');
    playTone(noteFreq(ROOTS[0], 'minor', [0, 2, 3, 5, 7, 10, 12, 10, 7, 5, 3, 2, 0, 3, 5, 7][step], 1), now, beat * 0.9, 0.10, 'square');
    if (step === 0 || step === 8) noiseBurst(0.05, 0.06, 6000);
  } else if (station === 1) {
    // VICE WAVE — chill chords: soft pads on beats 1 and 3.
    if (step % 8 === 0) {
      const chord = [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]][Math.floor(step / 8) % 4];
      chord.forEach((d) => playTone(noteFreq(ROOTS[1], 'minor', d, 1), now, beat * 7, 0.07, 'triangle'));
    }
    if (step % 4 === 0) playTone(noteFreq(ROOTS[1], 'minor', [0, 0, 3, 5][Math.floor(step / 4) % 4], 0), now, beat * 3, 0.16, 'sine');
  } else {
    // BASSLINE 88 — funk: syncopated bass + stab.
    const bassLine = [0, -1, 0, 3, 0, -1, 5, 3, 0, -1, 0, 3, 7, 5, 3, 0];
    if (bassLine[step] >= 0) playTone(noteFreq(ROOTS[2], 'blues', bassLine[step], 0), now, beat * 1.4, 0.4, 'sawtooth');
    if (step === 4 || step === 12) playTone(noteFreq(ROOTS[2], 'blues', 7, 2), now, beat, 0.08, 'square');
    if (step % 4 === 2) noiseBurst(0.03, 0.05, 7000);
  }
  void beat;
}

export function startRadio(station) {
  const c = ensureCtx();
  if (!c) return;
  stopRadio();
  currentStation = station;
  radioStep = 0;
  const bpm = [112, 84, 100][station];
  const stepMs = (60 / bpm / 4) * 1000;
  radioTimer = setInterval(() => {
    if (!ctx) return;
    stationStep(currentStation, radioStep % 16);
    radioStep++;
  }, stepMs);
}

export function stopRadio() {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
  currentStation = -1;
}

export function setRadioStation(station, on) {
  if (!on) { stopRadio(); return; }
  startRadio(station);
}
