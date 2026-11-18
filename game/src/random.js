// A small seeded random number generator (sfc32): the same seed gives the
// same city, the same traffic and the same missions, which is what makes the
// screenshot scenes repeatable and the game fair to re-run.

export function createRandom(seed) {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x85ebca6b) >>> 0;
  let counter = 1;
  return function random() {
    const t = (a + b + counter) >>> 0;
    counter = (counter + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (Math.imul(c, 0x9e3779b1) + t) >>> 0;
    return ((t ^ (t >>> 11)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the seeded random. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** An integer in [min, max). */
export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min));
}
