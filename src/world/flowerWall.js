import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, pick, randInt, noise3 } from '../core/noise.js';
import { clay } from '../core/materials.js';
import { taperedTube, leafGeo, sphereGeo, colorize, jitter, mesh, basis, strip, soft } from '../core/geo.js';

export const WALL = { c: new THREE.Vector3(-5.6, 2.95, -3.1), r: new THREE.Vector3(1.5, 2.8, 1.25), rotY: 0.55 };

const PALETTES = [
  ['#e48d92', '#f6dcca'], // pink / cream
  ['#ee9f7a', '#f9dcc0'], // peach
  ['#ecc970', '#fae9c4'], // butter
  ['#e07a6a', '#f4b9a4'], // coral
  ['#a9bc7c', '#e6e9c4'], // sage
  ['#d27d8a', '#f1c3c4'], // dusty rose
  ['#f0b19c', '#fbe6d6'], // blush
];

/**
 * Rolled two-tone clay coil: a solid domed disc whose surface is sculpted into
 * two interleaved, rounded spiral strands (like a rolled sheet of two clays).
 * Faces +Z, radius 1.
 */
function rosetteGeo(colA, colB, turns = 3.2) {
  const NR = 22, NA = 44;
  const pitch = 1 / turns;
  const ca = new THREE.Color(colA), cb = new THREE.Color(colB), cg = new THREE.Color(colA).multiplyScalar(0.72);
  const pos = [], cols = [], idx = [];
  const c = new THREE.Color();
  const surface = (r, a) => {
    const phase = (r / pitch - a / (Math.PI * 2)) * 2; // two strands per pitch
    const s = phase - Math.floor(phase);
    const strand = Math.floor(phase) & 1;
    const bead = Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2));
    const fadeIn = Math.min(1, r / (pitch * 0.6));
    const z = 0.12 * (1 - r * r) + pitch * 0.32 * bead * fadeIn + 0.04;
    c.copy(strand ? cb : ca).lerp(cg, (1 - bead) ** 3 * 0.8 * fadeIn);
    return z;
  };
  pos.push(0, 0, surface(0, 0)); cols.push(c.r, c.g, c.b);
  for (let i = 1; i <= NR; i++) {
    const r = i / NR;
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const z = surface(r, a);
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
      cols.push(c.r, c.g, c.b);
    }
  }
  // rounded rim curling back, then a flat back
  const rimRings = [[1.02, -0.03], [1.0, -0.1], [0.94, -0.14]];
  for (const [rr, zz] of rimRings) {
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, Math.sin(a) * rr, zz);
      c.copy(cb).multiplyScalar(0.9);
      cols.push(c.r, c.g, c.b);
    }
  }
  pos.push(0, 0, -0.14); cols.push(cb.r * 0.85, cb.g * 0.85, cb.b * 0.85);
  const ring = (i) => 1 + (i - 1) * NA;
  for (let j = 0; j < NA; j++) idx.push(0, ring(1) + j, ring(1) + ((j + 1) % NA));
  const totalRings = NR + rimRings.length;
  for (let i = 1; i < totalRings; i++)
    for (let j = 0; j < NA; j++) {
      const a = ring(i) + j, b = ring(i) + ((j + 1) % NA), cc = ring(i + 1) + j, d = ring(i + 1) + ((j + 1) % NA);
      idx.push(a, cc, b, b, cc, d);
    }
  const back = pos.length / 3 - 1, last = ring(totalRings);
  for (let j = 0; j < NA; j++) idx.push(back, last + ((j + 1) % NA), last + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dahlia/zinnia with rings of pointed sculpted petals. Faces +Z. */
function dahliaGeo(cIn, cOut) {
  const parts = [];
  const a = new THREE.Color(cIn), b = new THREE.Color(cOut);
  const rings = 4;
  for (let r = 0; r < rings; r++) {
    const n = 8 + r * 3;
    const len = 0.17 + r * 0.075;
    const elev = 1.25 - r * 0.3;
    const col = a.clone().lerp(b, r / (rings - 1));
    for (let i = 0; i < n; i++) {
      const p = leafGeo({ length: len, width: len * 0.5, thick: len * 0.22, bend: -0.05, cup: 0.25, groove: 0.5, wSeg: 5, hSeg: 6, c1: '#' + col.clone().multiplyScalar(0.92).getHexString(), c2: '#' + col.getHexString() });
      p.deleteAttribute('aSway');
      // petal +Y -> radial outward in XY plane, tilted toward +Z by elev
      p.rotateX(elev);
      p.rotateZ((i / n) * Math.PI * 2 + r * 0.4);
      parts.push(strip(p));
    }
  }
  const c = colorize(sphereGeo(0.12, 12), a.clone().multiplyScalar(0.85));
  c.scale(1, 1, 0.6);
  c.translate(0, 0, 0.1);
  parts.push(strip(c));
  return mergeGeometries(parts, false);
}

/** Simple round-petal flower. Faces +Z. */
function daisyGeo(petal, center) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const p = leafGeo({ length: 0.2, width: 0.13, thick: 0.035, bend: 0.02, cup: 0.15, groove: 0.2, wSeg: 5, hSeg: 6, pinch: 0.5, c1: petal, c2: petal });
    p.deleteAttribute('aSway');
    p.rotateX(0.22);
    p.rotateZ((i / 7) * Math.PI * 2);
    parts.push(strip(p));
  }
  const c = colorize(sphereGeo(0.07, 10), center);
  c.scale(1, 1, 0.6);
  c.translate(0, 0, 0.04);
  parts.push(strip(c));
  return mergeGeometries(parts, false);
}

export function buildFlowerWall() {
  const group = new THREE.Group();
  const white = clay('#ffffff');
  const rot = new THREE.Matrix4().makeRotationY(WALL.rotY);
  const { c: C, r: RAD } = WALL;

  // lumpy, hand-stacked column rather than a smooth egg
  const lump = (d) => 1 + 0.17 * noise3(d.x * 1.7 + 3.1, d.y * 2.4 + 1.3, d.z * 1.7 - 2.2) + 0.07 * noise3(d.x * 4.1, d.y * 4.1 + 7, d.z * 4.1);
  const local = (d) => { const k = lump(d); return new THREE.Vector3(d.x * RAD.x * k, d.y * RAD.y * (0.94 + 0.06 * k), d.z * RAD.z * k); };
  const surf = (dir) => {
    const d = dir.clone().normalize();
    const p0 = local(d);
    // numerical normal from two nearby surface points
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    const pa = local(d.clone().addScaledVector(t1, 0.01).normalize()).sub(p0);
    const pb = local(d.clone().addScaledVector(t2, 0.01).normalize()).sub(p0);
    const n = new THREE.Vector3().crossVectors(pa, pb).normalize();
    if (n.dot(p0) < 0) n.negate();
    const p = p0.applyMatrix4(rot).add(C);
    n.applyMatrix4(rot).normalize();
    return { p, n };
  };

  // sculpted core
  const core = soft(new THREE.SphereGeometry(1, 40, 30));
  {
    const pa = core.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const q = local(v.normalize()).multiplyScalar(0.96); pa.setXYZ(i, q.x, q.y, q.z); }
    core.computeVertexNormals();
  }
  core.applyMatrix4(rot);
  core.translate(C.x, C.y, C.z);
  mesh(core, clay('#7a8f52'), group);

  // geometry variants (cached, cloned via mesh transforms)
  const rosettes = PALETTES.flatMap(([a, b]) => [rosetteGeo(a, b, 2.8), rosetteGeo(b, a, 2.2)]);
  const dahlias = [dahliaGeo('#e98d76', '#f6c2a6'), dahliaGeo('#e48e9a', '#f8cdd3'), dahliaGeo('#eda36b', '#f8d29f')];
  const daisies = [daisyGeo('#fff3e6', '#efc062'), daisyGeo('#f6c9cf', '#e98aa0'), daisyGeo('#fbe2c6', '#e7a35f')];

  // fibonacci distribution over the ellipsoid
  const N = 84;
  const placed = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    if (y < -0.72) continue;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i + rand(-0.12, 0.12);
    const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    const { p, n } = surf(dir);
    const roll = rand(0, 1);
    const spin = rand(0, Math.PI * 2);
    let type, size;
    if (roll < 0.58) { type = 'rosette'; size = rand(0.44, 0.72) * (y > 0.85 ? 0.8 : 1); }
    else if (roll < 0.7) { type = 'dahlia'; size = rand(0.75, 1.15); }
    else if (roll < 0.82) { type = 'daisy'; size = rand(0.8, 1.2); }
    else { type = 'berry'; size = 1; }
    placed.push({ p, n });
    const m = basis(p.clone().addScaledVector(n, 0.03), n, new THREE.Vector3(Math.cos(spin), Math.sin(spin), 0).cross(n).normalize(), 1);
    // basis() aligns local Y with n; our flowers face +Z, so rotate Z->Y first
    const faceUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const s = new THREE.Matrix4().makeScale(size, size, size);
    const M = m.clone().multiply(faceUp).multiply(s);
    let geo;
    if (type === 'rosette') geo = pick(rosettes);
    else if (type === 'dahlia') geo = pick(dahlias);
    else if (type === 'daisy') geo = pick(daisies);
    if (geo) {
      const mm = new THREE.Mesh(geo, white);
      mm.applyMatrix4(M);
      mm.castShadow = mm.receiveShadow = true;
      group.add(mm);
    } else {
      // cluster of clay berries
      const bc = pick(['#f6dcc4', '#f2b6a6', '#fbeee0', '#e9a0a8']);
      for (let k = 0; k < 7; k++) {
        const o = new THREE.Vector3(rand(-0.16, 0.16), rand(-0.16, 0.16), rand(-0.16, 0.16));
        mesh(sphereGeo(rand(0.05, 0.08), 10), clay(bc), group, p.clone().add(o).addScaledVector(n, 0.06).toArray());
      }
    }
  }

  // sculpted leaves poking out between flowers
  const leafCols = [['#8ea35d', '#b7c787'], ['#9daf6b', '#c8d39a'], ['#7d9452', '#a4b876'], ['#e7a07f', '#f4c9ab'], ['#d98e7f', '#f1bfae']];
  for (let i = 0; i < 120; i++) {
    const u = rand(-0.7, 1);
    const th = rand(0, Math.PI * 2);
    const rr = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(Math.cos(th) * rr, u, Math.sin(th) * rr);
    const { p, n } = surf(dir);
    const tangent = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).addScaledVector(n, 0).normalize();
    const tan = tangent.clone().addScaledVector(n, -tangent.dot(n)).normalize();
    const d = n.clone().multiplyScalar(0.55).addScaledVector(tan, 0.8).normalize();
    const [c1, c2] = leafCols[i % 9 < 7 ? i % 3 : 3 + (i % 2)];
    const len = rand(0.5, 0.85);
    const lg = leafGeo({ length: len, width: len * rand(0.48, 0.6), thick: len * 0.11, bend: rand(0.05, 0.2), cup: 0.15, c1, c2, sway: 0.35, wSeg: 7, hSeg: 8 });
    const m = new THREE.Mesh(lg, white);
    m.applyMatrix4(basis(p.clone().addScaledVector(n, -0.06), d, n, 1));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // crown leaves reaching upward
  for (let i = 0; i < 9; i++) {
    const th = (i / 9) * Math.PI * 2;
    const { p, n } = surf(new THREE.Vector3(Math.cos(th) * 0.35, 0.94, Math.sin(th) * 0.35));
    const d = n.clone().add(new THREE.Vector3(0, 1.2, 0)).normalize();
    const lg = leafGeo({ length: rand(0.55, 0.8), width: 0.36, thick: 0.08, bend: 0.3, c1: '#8ea35d', c2: '#c3d095', sway: 0.6 });
    const m = new THREE.Mesh(lg, white);
    m.applyMatrix4(basis(p, d, n, 1));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // base leaves fanning onto the moss
  for (let i = 0; i < 22; i++) {
    const th = (i / 22) * Math.PI * 2 + rand(-0.1, 0.1);
    const { p, n } = surf(new THREE.Vector3(Math.cos(th) * 0.75, -0.62, Math.sin(th) * 0.75));
    const d = new THREE.Vector3(n.x, 0.25, n.z).normalize();
    const lg = leafGeo({ length: rand(0.6, 0.95), width: 0.36, thick: 0.08, bend: -0.15, c1: '#7f9653', c2: '#adc07b', sway: 0.3 });
    const m = new THREE.Mesh(lg, white);
    m.applyMatrix4(basis(p.clone().addScaledVector(n, -0.1), d, new THREE.Vector3(0, 1, 0), 1));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  return group;
}
