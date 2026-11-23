// Neon City — small seeded random helpers. The city layout is built once
// from a fixed seed so the map is identical every run; gameplay randomness
// uses Math.random through these same helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random float in [lo, hi).
export function rand(lo, hi, rng = Math.random) { return lo + rng() * (hi - lo); }

// Random integer in [lo, hi] inclusive.
export function randi(lo, hi, rng = Math.random) { return Math.floor(rand(lo, hi + 1, rng)); }

// Pick a random element.
export function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }

// True with probability p.
export function chance(p, rng = Math.random) { return rng() < p; }

// Shuffle a copy of an array (Fisher-Yates).
export function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
