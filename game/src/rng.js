// Seeded RNG (mulberry32) plus the small helpers the sim uses.
// Every random choice the game makes in a staged screenshot comes from one
// of these, so ?shot=&seed= replays the same frame.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
