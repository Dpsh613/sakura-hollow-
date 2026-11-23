// Deterministic randomness + smooth value noise used for every handcrafted imperfection.

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _r = mulberry32(20261123);
export const seed = (s) => { _r = mulberry32(s); };
export const rng = () => _r();
export const rand = (a = 0, b = 1) => a + (b - a) * _r();
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(_r() * arr.length)];
export const chance = (p) => _r() < p;
export const gauss = () => (_r() + _r() + _r() - 1.5) / 1.5;

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const L = (a, b, t) => a + (b - a) * t;

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const n000 = hash3(xi, yi, zi), n100 = hash3(xi + 1, yi, zi);
  const n010 = hash3(xi, yi + 1, zi), n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi, yi, zi + 1), n101 = hash3(xi + 1, yi, zi + 1);
  const n011 = hash3(xi, yi + 1, zi + 1), n111 = hash3(xi + 1, yi + 1, zi + 1);
  return L(L(L(n000, n100, u), L(n010, n110, u), v), L(L(n001, n101, u), L(n011, n111, u), v), w) * 2 - 1;
}

export const noise2 = (x, y) => noise3(x, y, 0.371);
export const noise1 = (x, s = 0) => noise3(x, s * 1.731, 4.17);

export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = L;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => L(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
