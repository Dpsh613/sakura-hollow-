import * as THREE from 'three';
import { noise2, fbm2, smoothstep, clamp, lerp, rand, pick } from '../core/noise.js';
import { makeClay, clay, uniforms, glowMat } from '../core/materials.js';
import { taperedTube, sphereGeo, jitter, mesh, colorize } from '../core/geo.js';

export const R0 = 10;
export const BOTTOM = -0.9;

export function rimR(a) {
  return R0 * (1 + 0.02 * noise2(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 + 3) + 0.006 * Math.sin(a * 9 + 1));
}

// ---- water features ---------------------------------------------------------
export const POND = { x: -4.4, z: 4.05, rx: 1.95, rz: 1.45, rot: 0.3 };
export const WATER_Y = -0.12;
export const STREAM = [[-6.0, 4.75], [-6.9, 5.45], [-7.7, 6.05], [-8.7, 6.7]];
export const BRIDGE = { x: -7.25, z: 5.7, len: 1.5, wid: 0.62 };
{
  const [ax, az] = STREAM[1], [bx, bz] = STREAM[2];
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
  BRIDGE.dir = [-dz / l, dx / l]; // across the stream
}

export function pondD(x, z) {
  const dx = x - POND.x, dz = z - POND.z;
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  const u = (dx * c + dz * s) / POND.rx, v = (-dx * s + dz * c) / POND.rz;
  const a = Math.atan2(v, u);
  return Math.hypot(u, v) * (1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 5));
}

function polyDist(P, x, z) {
  let best = 1e9, bt = 0, acc = 0, total = 0;
  const lens = [];
  for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); lens.push(l); total += l; }
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const d = ex * ex + ez * ez;
    if (d < best) { best = d; bt = (acc + t * lens[i]) / total; }
    acc += lens[i];
  }
  return [Math.sqrt(best), bt];
}
export const streamDist = (x, z) => polyDist(STREAM, x, z)[0];
export const streamT = (x, z) => polyDist(STREAM, x, z)[1];

// meandering earthen path from the treehouse stairs to the front edge
export const PATH = [[2.55, 2.25], [2.15, 3.6], [1.25, 4.9], [0.45, 6.3], [0.05, 7.8], [-0.2, 9.4]];
export const pathDist = (x, z) => polyDist(PATH, x, z)[0];

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const R = rimR(Math.atan2(z, x));
  let h = 0.06 * fbm2(x * 0.3 + 11, z * 0.3 - 4, 3) + 0.022 * noise2(x * 1.7, z * 1.7);
  h += 0.6 * Math.exp(-(((x + 5.6) ** 2) / 5 + ((z + 3.1) ** 2) / 3.2)); // flower mound
  h += 0.34 * Math.exp(-(((x - 3.6) ** 2) + ((z + 2.9) ** 2)) / 3.2); // tree mound
  h += 0.16 * Math.exp(-(((x + 0.6) ** 2) + ((z + 1.5) ** 2)) / 0.5); // hillock
  h += 0.12 * Math.exp(-(((x + 4.3) ** 2) + ((z - 1.4) ** 2)) / 1.2); // stump hillock
  h += 0.18 * Math.exp(-(((x - 5.6) ** 2) + ((z - 7.4) ** 2)) / 1.6); // lookout knoll
  h -= 0.035 * (1 - smoothstep(0.25, 0.6, pathDist(x, z)));
  const pd = pondD(x, z);
  if (pd < 1.5) h -= 0.52 * smoothstep(1.38, 0.45, pd);
  const sd = streamDist(x, z);
  if (sd < 0.7) h -= 0.24 * (1 - smoothstep(0.1, 0.5, sd));
  const e = smoothstep(R - 1.4, R, r);
  return lerp(h, sd < 0.7 ? -0.18 : 0.03, e);
}

/** Height a character's feet should be at (handles the little bridge). */
export function walkHeight(x, z) {
  const g = groundHeight(x, z);
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  const u = dx * BRIDGE.dir[0] + dz * BRIDGE.dir[1];
  const v = -dx * BRIDGE.dir[1] + dz * BRIDGE.dir[0];
  if (Math.abs(u) < BRIDGE.len / 2 && Math.abs(v) < BRIDGE.wid / 2) {
    return Math.max(g, 0.12 + 0.2 * Math.cos((u / BRIDGE.len) * Math.PI));
  }
  return g;
}

export function isWater(x, z, pad = 0) {
  return pondD(x, z) < 1.05 + pad || streamDist(x, z) < 0.32 + pad;
}

/** Surface for falling things: ground on the island, the void (far below) elsewhere. */
export function floorHeight(x, z) {
  return onIsland(x, z, 0.05) ? groundHeight(x, z) : -14;
}

export function onIsland(x, z, margin = 0) {
  return Math.hypot(x, z) < rimR(Math.atan2(z, x)) - margin;
}

// --- occupancy so scattered details never poke through big objects -------
export const zones = [];
export function addZone(x, z, r) { zones.push({ x, z, r }); }
export function isFree(x, z, pad = 0) {
  if (isWater(x, z, 0.15 + pad * 0.5)) return false;
  for (const q of zones) {
    const dx = x - q.x, dz = z - q.z;
    if (dx * dx + dz * dz < (q.r + pad) ** 2) return false;
  }
  return true;
}

const C = (h) => new THREE.Color(h);
const MOSS_MID = C('#6b9a3c'), MOSS_DARK = C('#477532'), MOSS_LIGHT = C('#93b84f'), MOSS_YEL = C('#b9b347');
const CLEARING = C('#86ad48'), SOIL = C('#7b5638'), PATHC = C('#c4a070'), MUD = C('#6f5a3c'), POND_BED = C('#3f5236');
const SOIL_SIDE = C('#7a5034'), SOIL_LIGHT = C('#9a6c48'), SOIL_DARK = C('#57382a');

function mossColor(x, z, out) {
  const n1 = fbm2(x * 0.45 + 3, z * 0.45 - 7, 3);
  const n2 = noise2(x * 2.2 + 1, z * 2.2 + 5);
  const n3 = noise2(x * 7.3, z * 7.3);
  out.copy(MOSS_MID)
    .lerp(MOSS_DARK, smoothstep(0.0, 0.5, n1) * 0.85)
    .lerp(MOSS_LIGHT, smoothstep(0.05, 0.55, -n1) * 0.7)
    .lerp(MOSS_YEL, smoothstep(0.35, 0.75, n2) * 0.4);
  out.lerp(CLEARING, Math.exp(-(x * x + (z - 1) ** 2) / 9) * 0.35);
  out.lerp(SOIL, Math.exp(-(((x - 3.6) ** 2) + ((z + 2.9) ** 2)) / 2.2) * 0.65);
  out.lerp(PATHC, (1 - smoothstep(0.18, 0.55, pathDist(x, z) + n3 * 0.09)) * 0.85);
  const pd = pondD(x, z);
  out.lerp(MUD, smoothstep(1.4, 1.02, pd + n3 * 0.05) * 0.8);
  out.lerp(POND_BED, smoothstep(1.0, 0.7, pd));
  const sd = streamDist(x, z);
  out.lerp(MUD, (1 - smoothstep(0.2, 0.55, sd + n3 * 0.05)) * 0.85);
  out.multiplyScalar(0.92 + 0.1 * n3);
  return out;
}

export function buildIsland() {
  const S = 288, K = 72, ROLL = 6, SIDE = 7;
  const pos = [], cols = [];
  const c = new THREE.Color();
  pos.push(0, groundHeight(0, 0), 0);
  mossColor(0, 0, c); cols.push(c.r, c.g, c.b);
  const rings = K + ROLL + SIDE;
  for (let k = 1; k <= rings; k++) {
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      const R = rimR(a);
      const ca = Math.cos(a), sa = Math.sin(a);
      let r, y;
      const yEdge = groundHeight(ca * R, sa * R);
      if (k <= K) {
        r = R * (k / K);
        y = groundHeight(ca * r, sa * r);
        mossColor(ca * r, sa * r, c);
      } else if (k <= K + ROLL) {
        const th = ((k - K) / ROLL) * Math.PI * 0.5;
        r = R + 0.24 * Math.sin(th);
        y = yEdge - 0.24 * (1 - Math.cos(th));
        mossColor(ca * R, sa * R, c).multiplyScalar(0.9);
      } else {
        const t = (k - K - ROLL) / SIDE;
        const wob = 0.05 * noise2(a * 6, t * 3) + 0.03 * noise2(a * 19, t * 6);
        r = R + 0.24 - 0.14 * t * t + wob;
        y = lerp(yEdge - 0.24, BOTTOM, t);
        const depth = yEdge - y;
        const mossDepth = 0.2 + 0.22 * (0.5 + 0.5 * noise2(ca * 3 + 9, sa * 3)) + 0.08 * noise2(a * 23, 1);
        if (depth < mossDepth) mossColor(ca * R, sa * R, c).multiplyScalar(0.8);
        else {
          const band = Math.sin(y * 26 + noise2(a * 4, y * 2) * 3);
          c.copy(SOIL_SIDE).lerp(band > 0 ? SOIL_LIGHT : SOIL_DARK, Math.abs(band) * 0.35);
          c.multiplyScalar(0.9 + 0.12 * noise2(a * 30, y * 9));
        }
      }
      pos.push(ca * r, y, sa * r);
      cols.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  const ringStart = (k) => 1 + (k - 1) * S;
  for (let s = 0; s < S; s++) idx.push(0, ringStart(1) + ((s + 1) % S), ringStart(1) + s);
  for (let k = 1; k < rings; k++) {
    const a0 = ringStart(k), a1 = ringStart(k + 1);
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S;
      idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  const mat = makeClay({ vertexColors: true, bump: 0.05, bumpFreq: 5, roughness: 0.9, tint: 0.12, terrain: true, foliage: true });
  const island = new THREE.Mesh(g, mat);
  island.receiveShadow = true;
  island.castShadow = true;
  island.userData.pickable = true;
  return island;
}

// ---------------------------------------------------------------------------
// The floating island's rocky underbelly: strata, hanging roots, crystals.
// ---------------------------------------------------------------------------
export function buildUnderside() {
  const group = new THREE.Group();
  const S = 160, U = 18;
  const pos = [], cols = [], idx = [];
  const c = new THREE.Color();
  const strata = [C('#5c3c2a'), C('#7a6151'), C('#9a8370'), C('#6b5849'), C('#857262'), C('#594a42')];
  const surf = (a, t) => {
    const R = rimR(a) + 0.02;
    const lump = 1 + 0.1 * noise2(Math.cos(a) * 2.2 + t * 3, Math.sin(a) * 2.2 - t * 2) + 0.05 * noise2(a * 7, t * 9);
    const r = R * Math.pow(1 - t, 1.25) * lump;
    const y = BOTTOM + 0.15 - 6.4 * Math.pow(t, 0.9) - 0.35 * noise2(Math.cos(a) * 3, Math.sin(a) * 3 + t * 5);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  for (let k = 0; k <= U; k++) {
    const t = (k / U) * 0.985;
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      const [x, y, z] = surf(a, t);
      pos.push(x, y, z);
      const band = Math.floor((y + noise2(a * 3, y) * 0.35) * 2.2);
      c.copy(strata[((band % strata.length) + strata.length) % strata.length]);
      if (k === 0) c.copy(SOIL_DARK);
      c.multiplyScalar(0.85 + 0.2 * noise2(a * 13, y * 4));
      if (noise2(a * 5 + 2, y * 1.5) > 0.45 && k < U * 0.6) c.lerp(C('#567a3a'), 0.6);
      cols.push(c.r, c.g, c.b);
    }
  }
  const [tx, ty, tz] = surf(0, 1);
  pos.push(0, ty - 0.2, 0);
  c.copy(strata[5]); cols.push(c.r, c.g, c.b);
  for (let k = 0; k < U; k++)
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S, a = k * S + s, b = k * S + s1, cc = (k + 1) * S + s, d = (k + 1) * S + s1;
      idx.push(a, b, cc, b, d, cc);
    }
  const tip = pos.length / 3 - 1, last = U * S;
  for (let s = 0; s < S; s++) idx.push(last + s, last + ((s + 1) % S), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const rockMesh = mesh(g, clay('#ffffff', { kind: 'rock' }), group);
  rockMesh.castShadow = false;

  // hanging roots
  const rootMat = clay('#ffffff', { kind: 'rock' });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), t = rand(0.06, 0.45);
    const [x, y, z] = surf(a, t);
    const out = new THREE.Vector3(x, 0, z).normalize();
    const len = rand(1.2, 3.4);
    const pts = [new THREE.Vector3(x, y + 0.1, z)];
    let p = pts[0].clone();
    for (let j = 1; j <= 4; j++) {
      p = p.clone().add(new THREE.Vector3(out.x * rand(-0.1, 0.25) + rand(-0.2, 0.2), -len / 4, out.z * rand(-0.1, 0.25) + rand(-0.2, 0.2)));
      pts.push(p);
    }
    mesh(taperedTube(pts, (tt) => 0.09 * (1 - tt * 0.85), { segments: 14, radial: 5, color: (tt, r, cc) => cc.set('#6e4a33').lerp(C('#a07a58'), tt * 0.5) }), rootMat, group);
  }
  // crystals that glow at night
  const crystalMat = glowMat('#e3a6d8', '#c46ad0', 0.15);
  const crystalMat2 = glowMat('#a9c8f2', '#5f8ff0', 0.15);
  const crystals = [crystalMat, crystalMat2];
  const cg = new THREE.ConeGeometry(0.12, 0.6, 6, 1);
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), t = rand(0.45, 0.85);
    const [x, y, z] = surf(a, t);
    const n = new THREE.Vector3(x, -1.6, z).normalize();
    const cluster = new THREE.Group();
    cluster.position.set(x, y, z);
    cluster.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    cluster.userData.keep = true;
    group.add(cluster);
    const m = i % 2 ? crystalMat : crystalMat2;
    for (let k = 0; k < 4; k++) {
      const cm = new THREE.Mesh(cg, m);
      const s = rand(0.6, 1.5);
      cm.scale.set(s, s * rand(0.8, 1.6), s);
      cm.position.set(rand(-0.12, 0.12), 0.2 * s, rand(-0.12, 0.12));
      cm.rotation.set(rand(-0.5, 0.5), rand(0, 6), rand(-0.5, 0.5));
      cluster.add(cm);
    }
  }
  return { group, crystals };
}

/** Little floating islets drifting around the main island. */
export function buildIslets() {
  const list = [];
  const defs = [
    { a: 2.4, r: 15, y: 1.2, s: 1.0, deco: 'tree' },
    { a: 3.9, r: 17, y: -2.2, s: 0.8, deco: 'mush' },
    { a: 5.4, r: 14.5, y: 3.0, s: 0.65, deco: 'nest' },
    { a: 0.7, r: 16.5, y: -0.6, s: 0.9, deco: 'flowers' },
    { a: 1.6, r: 21, y: 4.5, s: 0.55, deco: 'rock' },
  ];
  for (const d of defs) {
    const g = new THREE.Group();
    const top = jitter(new THREE.CylinderGeometry(1.2, 1.1, 0.35, 16, 1), 0.08, 1.2);
    colorize(top, '#6d9a3d', (x, y, z, c) => { if (y < 0.1) c.set('#7a5034'); });
    mesh(top, clay('#ffffff', { foliage: true, noAO: true, vertexColors: true }), g);
    const under = jitter(new THREE.ConeGeometry(1.1, 2.4, 14, 4), 0.14, 1.1);
    under.rotateX(Math.PI);
    under.translate(0, -1.3, 0);
    colorize(under, '#7a6151', (x, y, z, c) => c.multiplyScalar(0.85 + 0.2 * Math.sin(y * 5)));
    mesh(under, clay('#ffffff', { noAO: true, vertexColors: true }), g);
    for (let i = 0; i < 6; i++) mesh(sphereGeo(rand(0.12, 0.22), 8), clay(pick(['#5f8c38', '#7aa646', '#8eb352']), { foliage: true, noAO: true }), g, [rand(-0.8, 0.8), 0.2, rand(-0.8, 0.8)], null, [1, 0.55, 1]);
    if (d.deco === 'tree') {
      mesh(taperedTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.6, 0), new THREE.Vector3(-0.05, 1.1, 0.05)], (t) => 0.1 * (1 - t * 0.6), { segments: 8, radial: 6 }), clay('#6e4a33', { noAO: true }), g);
      for (let i = 0; i < 5; i++) mesh(sphereGeo(rand(0.3, 0.45), 10), clay(pick(['#e4708f', '#ee8aa4', '#d8607f']), { blossom: true, noAO: true }), g, [rand(-0.35, 0.35), 1.1 + rand(0, 0.4), rand(-0.35, 0.35)]);
    } else if (d.deco === 'mush') {
      mesh(sphereGeo(0.45, 12), clay('#d9544a', { noAO: true }), g, [0, 0.55, 0], null, [1, 0.6, 1]);
      mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.45, 10), clay('#f3e6d0', { noAO: true }), g, [0, 0.3, 0]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; mesh(sphereGeo(0.06, 6), clay('#fff6ea', { noAO: true }), g, [Math.cos(a) * 0.32, 0.72, Math.sin(a) * 0.32]); }
    } else if (d.deco === 'nest') {
      const nest = new THREE.TorusGeometry(0.32, 0.12, 6, 14);
      nest.rotateX(Math.PI / 2);
      mesh(nest, clay('#8a6440', { noAO: true }), g, [0, 0.25, 0]);
      for (let i = 0; i < 3; i++) mesh(sphereGeo(0.09, 8), clay('#b8dbe6', { noAO: true }), g, [rand(-0.1, 0.1), 0.26, rand(-0.1, 0.1)], null, [1, 1.25, 1]);
    } else if (d.deco === 'flowers') {
      for (let i = 0; i < 9; i++) mesh(sphereGeo(0.09, 8), clay(pick(['#f2c84b', '#f07a5a', '#ffffff', '#c86fd0']), { noAO: true }), g, [rand(-0.7, 0.7), 0.3, rand(-0.7, 0.7)]);
    } else {
      mesh(jitter(sphereGeo(0.5, 10), 0.12, 2), clay('#9a8370', { noAO: true }), g, [0.2, 0.4, 0], null, [1, 0.8, 0.9]);
    }
    g.scale.setScalar(d.s);
    g.userData.keep = true;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    list.push({ group: g, ...d, phase: rand(0, 6) });
  }
  return {
    list,
    update(t) {
      for (const d of list) {
        const a = d.a + t * 0.006;
        d.group.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * 0.4 + d.phase) * 0.25, Math.sin(a) * d.r);
        d.group.rotation.y = t * 0.02 + d.phase;
        d.group.rotation.z = Math.sin(t * 0.3 + d.phase) * 0.03;
      }
    },
  };
}

/**
 * Terrain height + soft contact-occlusion map, sampled by every clay shader
 * for cheap ambient occlusion that works even on the lightest quality tier.
 */
export function buildAOMap(occluders) {
  const N = 192;
  const b = uniforms.uAOBounds.value;
  const data = new Uint8Array(N * N * 4);
  const occ = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = b.x + ((i + 0.5) / N) * b.z, z = b.y + ((j + 0.5) / N) * b.w;
      const h = onIsland(x, z, -0.3) ? groundHeight(x, z) : -1.5;
      data[(j * N + i) * 4] = clamp(Math.round(((h + 1.5) / 4) * 255), 0, 255);
      let o = 0;
      for (const q of occluders) {
        const d = Math.hypot(x - q.x, z - q.z);
        if (q.box) {
          const dx = Math.max(0, Math.abs(x - q.x) - q.hx), dz = Math.max(0, Math.abs(z - q.z) - q.hz);
          o += q.s * (1 - smoothstep(0, q.soft, Math.hypot(dx, dz)));
        } else o += q.s * (1 - smoothstep(q.r * 0.5, q.r * 1.35, d));
      }
      occ[j * N + i] = Math.min(1, o);
    }
  }
  // blur occlusion
  const tmp = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const ii = i + k; if (ii >= 0 && ii < N) { s += occ[j * N + ii]; n++; } }
      tmp[j * N + i] = s / n;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const jj = j + k; if (jj >= 0 && jj < N) { s += tmp[jj * N + i]; n++; } }
      occ[j * N + i] = s / n;
    }
  }
  for (let k = 0; k < N * N; k++) { data[k * 4 + 1] = Math.round(occ[k] * 255); data[k * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, N, N);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  uniforms.uAOMap.value = tex;
  return tex;
}
