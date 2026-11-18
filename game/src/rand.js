// Seeded random numbers (mulberry32): the same seed gives the same city,
// the same traffic and the same pedestrians, which makes screenshots repeatable.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, arr) {
  return arr[Math.floor(random() * arr.length)];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

export function int(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}
