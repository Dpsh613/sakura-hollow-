import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, randInt, pick, chance, noise2, fbm2, smoothstep } from '../core/noise.js';
import { clay, makeClay } from '../core/materials.js';
import { taperedTube, leafGeo, petalGeo, sphereGeo, colorize, jitter, soft, mesh, strip, swayAttr } from '../core/geo.js';
import { groundHeight, pathDist, isFree, onIsland, rimR, PATH, addZone } from './island.js';

const white = () => clay('#ffffff');
const leafy = () => clay('#ffffff', { kind: 'foliage' });

export function findSpot({ minR = 0, maxR = 9.4, pad = 0.2, path = 0.45, tries = 60, filter } = {}) {
  for (let i = 0; i < tries; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(minR * minR, maxR * maxR));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!onIsland(x, z, 0.35)) continue;
    if (!isFree(x, z, pad)) continue;
    if (pathDist(x, z) < path) continue;
    if (filter && !filter(x, z)) continue;
    return [x, z];
  }
  return null;
}

// ---------------------------------------------------------------------------
function bladeGeo() {
  const rows = 4;
  const pos = [], col = [], sw = [], idx = [];
  const cb = new THREE.Color('#3f6a2a'), ct = new THREE.Color('#9cc25a');
  const c = new THREE.Color();
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    const w = 0.085 * Math.pow(1 - t, 0.85);
    const z = 0.3 * t * t;
    pos.push(-w, t, z + w * 0.45, 0, t, z, w, t, z + w * 0.45);
    c.copy(cb).lerp(ct, t);
    for (let k = 0; k < 3; k++) { col.push(c.r, c.g, c.b); sw.push(Math.pow(t, 1.6)); }
  }
  pos.push(0, 1, 0.3);
  col.push(ct.r, ct.g, ct.b);
  sw.push(1);
  for (let i = 0; i < rows - 1; i++) {
    const L0 = i * 3, M0 = L0 + 1, R0 = L0 + 2, L1 = L0 + 3, M1 = L0 + 4, R1 = L0 + 5;
    idx.push(L0, M0, L1, M0, M1, L1, M0, R0, M1, R0, R1, M1);
  }
  const top = (rows - 1) * 3, tip = rows * 3;
  idx.push(top, top + 1, tip, top + 1, top + 2, tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tinyFlowerGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = soft(new THREE.SphereGeometry(0.026, 5, 3));
    p.scale(1, 0.45, 1);
    p.translate(Math.cos(a) * 0.026, 0, Math.sin(a) * 0.026);
    parts.push(strip(colorize(p, '#ffffff')));
  }
  const c = soft(new THREE.SphereGeometry(0.017, 5, 3));
  c.translate(0, 0.008, 0);
  parts.push(strip(colorize(c, '#f2c45f')));
  return mergeGeometries(parts, false);
}

function mapleGeo() {
  const s = new THREE.Shape();
  const N = 45;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2.5 * (th - Math.PI / 2))), 2.4) + 0.05 * Math.abs(Math.sin(th * 13.5));
    const x = Math.cos(th) * r, y = Math.sin(th) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.12 * (x * x + z * z)); }
  g.computeVertexNormals();
  // stem
  const stem = soft(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 5));
  stem.rotateX(Math.PI / 2);
  stem.translate(0, 0.02, 0.55);
  const merged = mergeGeometries([strip(g), strip(stem.toNonIndexed())], false);
  return merged;
}

// ---------------------------------------------------------------------------
function mushroom(g, x, z, h, capR, capCol, dotCol, tilt = 0.18) {
  const y = groundHeight(x, z);
  const m = new THREE.Group();
  m.position.set(x, y - 0.02, z);
  m.rotation.set(rand(-tilt, tilt), rand(0, 6), rand(-tilt, tilt));
  g.add(m);
  const prof = [[0, 0], [0.55, 0], [0.5, 0.08], [0.38, 0.35], [0.35, 0.8], [0.3, 1], [0, 1]].map((p) => new THREE.Vector2(p[0] * capR * 0.55, p[1] * h));
  mesh(soft(new THREE.LatheGeometry(prof, 10)), clay('#f4e8d6'), m);
  const cy = h - capR * 0.08;
  const capGeo = soft(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.58));
  mesh(jitter(capGeo, 0.04, 2), clay(capCol), m, [0, cy, 0], null, [capR, capR * 0.72, capR]);
  const under = new THREE.CircleGeometry(capR * 0.96, 20);
  under.rotateX(Math.PI / 2);
  colorize(under, '#f1dcc4', (px, py, pz, c) => c.multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(Math.atan2(pz, px) * 18))));
  mesh(under, white(), m, [0, cy - capR * 0.72 * 0.25, 0]);
  if (dotCol) {
    const nd = randInt(5, 9);
    for (let i = 0; i < nd; i++) {
      const th = rand(0.12, 0.46) * Math.PI, ph = rand(0, Math.PI * 2);
      const px = Math.sin(th) * Math.cos(ph) * capR, py = Math.cos(th) * capR * 0.72, pz = Math.sin(th) * Math.sin(ph) * capR;
      const n = new THREE.Vector3(px / capR ** 2, py / (capR * 0.72) ** 2, pz / capR ** 2).normalize();
      const d = mesh(sphereGeo(1, 6), clay(dotCol), m, [px, cy + py, pz]);
      d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const ds = capR * rand(0.1, 0.16);
      d.scale.set(ds, ds * 0.35, ds);
    }
  }
}

function plant(g, x, z, { n = 9, len = 0.5, width = 0.18, c1 = '#7f9a52', c2 = '#b0c27f', spread = 1.0, sway = 0.6 } = {}) {
  const y = groundHeight(x, z);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const L = len * rand(0.75, 1.1);
    const lg = leafGeo({ length: L, width: width * rand(0.85, 1.1), thick: width * 0.2, bend: 0.1, cup: 0.18, c1, c2, sway, wSeg: 6, hSeg: 7 });
    const m = mesh(lg, leafy(), g, [x, y - 0.02, z]);
    m.rotation.order = 'YXZ';
    m.rotation.set(-rand(0.3, spread), a, rand(-0.15, 0.15));
  }
}

function fern(g, x, z, scale = 1) {
  const y = groundHeight(x, z);
  const fronds = randInt(5, 7);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand(-0.3, 0.3);
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = rand(0.65, 0.9) * scale;
    const pts = [
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + d.x * L * 0.25, y + L * 0.45, z + d.z * L * 0.25),
      new THREE.Vector3(x + d.x * L * 0.6, y + L * 0.62, z + d.z * L * 0.6),
      new THREE.Vector3(x + d.x * L * 0.95, y + L * 0.45, z + d.z * L * 0.95),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    mesh(taperedTube(curve, (t) => 0.018 * (1 - t * 0.7) * scale, { segments: 16, radial: 5, color: (t, r, c) => c.set('#7a9450'), sway: (t) => t * 0.8 }), leafy(), g);
    const nl = 7;
    for (let i = 1; i <= nl; i++) {
      const t = i / (nl + 1);
      const P = curve.getPointAt(t), T = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0)).normalize();
      for (const s of [-1, 1]) {
        const ll = (0.2 - t * 0.12) * scale;
        const lg = leafGeo({ length: ll, width: ll * 0.42, thick: ll * 0.12, bend: 0.05, c1: '#7f9a52', c2: '#b2c47e', wSeg: 5, hSeg: 6 });
        const sw = lg.attributes.aSway.array;
        for (let k = 0; k < sw.length; k++) sw[k] = t * 0.8;
        const dir = side.clone().multiplyScalar(s).addScaledVector(T, 0.5).add(new THREE.Vector3(0, 0.15, 0)).normalize();
        const m = new THREE.Mesh(lg, leafy());
        m.position.copy(P);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
    }
  }
}

function succulent(g, x, z, scale = 1) {
  const y = groundHeight(x, z);
  const grp = new THREE.Group();
  grp.position.set(x, y - 0.02, z);
  grp.scale.setScalar(scale);
  grp.rotation.y = rand(0, 6);
  g.add(grp);
  const rings = [[9, 0.32, 1.15], [7, 0.26, 0.75], [5, 0.19, 0.4], [3, 0.12, 0.15]];
  rings.forEach(([n, L, tilt], r) => {
    for (let i = 0; i < n; i++) {
      const lg = leafGeo({ length: L, width: L * 0.62, thick: L * 0.3, cup: 0.3, bend: 0.06, groove: 0.1, pinch: 0.6, c1: '#90ad94', c2: r === 0 ? '#e6a3a6' : '#c9d8b8' });
      const m = mesh(lg, white(), grp);
      m.rotation.order = 'YXZ';
      m.rotation.set(-tilt, (i / n) * Math.PI * 2 + r * 0.5, 0);
    }
  });
}

function spiky(g, x, z, scale = 1) {
  const y = groundHeight(x, z);
  const grp = new THREE.Group();
  grp.position.set(x, y - 0.03, z);
  grp.scale.setScalar(scale);
  g.add(grp);
  mesh(sphereGeo(0.2, 16), clay('#5e7d4b'), grp, [0, 0.12, 0], null, [1, 0.85, 1]);
  const cone = soft(new THREE.ConeGeometry(0.03, 0.1, 6));
  colorize(cone, '#6f8f55', (px, py, pz, c) => c.lerp(new THREE.Color('#b8c98c'), Math.max(0, py * 10 + 0.5)));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 80; i++) {
    const yy = 1 - (i / 79) * 1.3;
    if (yy < -0.25) continue;
    const r = Math.sqrt(Math.max(0, 1 - yy * yy));
    const n = new THREE.Vector3(Math.cos(golden * i) * r, yy, Math.sin(golden * i) * r);
    const m = new THREE.Mesh(cone, white());
    m.position.set(n.x * 0.2, 0.12 + n.y * 0.17, n.z * 0.2).addScaledVector(n, 0.03);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }
}

function pebble(g, x, z, r, col) {
  const y = groundHeight(x, z);
  const p = jitter(sphereGeo(1, 12), 0.2, 1.3, rand(0, 50));
  mesh(p, clay(col), g, [x, y + r * 0.15, z], [0, rand(0, 6), 0], [r, r * 0.55, r * rand(0.7, 1)]);
}

function flowerClump(g, x, z, petalCol) {
  const y = groundHeight(x, z);
  const n = randInt(3, 6);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0.02, 0.16);
    const h = rand(0.32, 0.6);
    const lean = new THREE.Vector3(rand(-0.12, 0.12), 0, rand(-0.12, 0.12));
    const base = new THREE.Vector3(x + Math.cos(a) * d, y - 0.02, z + Math.sin(a) * d);
    const top = base.clone().add(new THREE.Vector3(lean.x, h, lean.z));
    const mid = base.clone().lerp(top, 0.5).add(new THREE.Vector3(lean.x * 0.6, 0, lean.z * 0.6));
    mesh(taperedTube([base, mid, top], (t) => 0.013 * (1 - t * 0.4), { segments: 8, radial: 5, color: (t, r, c) => c.set('#7f9a52'), sway: (t) => t * t }), leafy(), g);
    const head = new THREE.Group();
    head.position.copy(top);
    g.add(head);
    for (let k = 0; k < 6; k++) {
      const pa = (k / 6) * Math.PI * 2;
      const pg = sphereGeo(0.04, 6);
      swayAttr(pg, () => 1);
      const pm = mesh(pg, clay(petalCol), head, [Math.cos(pa) * 0.045, 0, Math.sin(pa) * 0.045], null, [1, 0.45, 1]);
      pm.userData.sway = 1;
    }
    const cg = sphereGeo(0.03, 8);
    swayAttr(cg, () => 1);
    mesh(cg, clay('#efbf5d'), head, [0, 0.012, 0]);
  }
  // leaves
  for (let i = 0; i < 4; i++) {
    const lg = leafGeo({ length: rand(0.18, 0.26), width: 0.08, thick: 0.025, c1: '#7f9a52', c2: '#a9bd78', sway: 0.5 });
    const m = mesh(lg, leafy(), g, [x, y - 0.01, z]);
    m.rotation.order = 'YXZ';
    m.rotation.set(-rand(0.5, 1.0), rand(0, 6), 0);
  }
}

// ---------------------------------------------------------------------------
export function buildVegetation() {
  const staticGroup = new THREE.Group();
  const live = new THREE.Group();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // ---- grass tufts ---------------------------------------------------------
  const blades = [];
  for (let i = 0; i < 1000; i++) {
    const s = findSpot({ maxR: 9.75, pad: 0.05, path: 0.32, tries: 20 });
    if (!s) continue;
    const [cx, cz] = s;
    const dens = 0.5 + 0.5 * fbm2(cx * 0.4, cz * 0.4, 2);
    const k = Math.round(4 + dens * 8);
    for (let j = 0; j < k; j++) {
      const x = cx + rand(-0.09, 0.09), z = cz + rand(-0.09, 0.09);
      blades.push([x, z, rand(0.16, 0.36) * (0.8 + dens * 0.5)]);
    }
  }
  const grassMat = makeClay({ vertexColors: true, wind: 'attr', swayAmp: 0.04, side: THREE.DoubleSide, bump: 0, roughness: 0.92, tint: 0.12, foliage: true });
  const grass = new THREE.InstancedMesh(bladeGeo(), grassMat, blades.length);
  blades.forEach(([x, z, h], i) => {
    dummy.position.set(x, groundHeight(x, z) - 0.015, z);
    dummy.rotation.set(rand(-0.25, 0.25), rand(0, Math.PI * 2), rand(-0.25, 0.25));
    dummy.scale.set(h * rand(0.8, 1.2), h, h);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    col.setRGB(1, 1, 1).multiplyScalar(rand(0.82, 1.1));
    if (chance(0.15)) col.setRGB(1.08, 1.05, 0.85);
    grass.setColorAt(i, col);
  });
  grass.receiveShadow = true;
  live.add(grass);

  // ---- moss balls ---------------------------------------------------------
  const mossCols = ['#5f9038', '#76a646', '#4f7a30', '#8ab450', '#a2bf55', '#466f2c'];
  const moss = [];
  for (let i = 0; i < 1100; i++) {
    const s = findSpot({ maxR: 9.9, pad: 0.0, path: 0.38, tries: 8 });
    if (s) moss.push([s[0], s[1], groundHeight(s[0], s[1]), rand(0.05, 0.13), pick(mossCols)]);
  }
  // around the rim lip
  for (let i = 0; i < 560; i++) {
    const a = rand(0, Math.PI * 2);
    const R = rimR(a);
    const r = R + rand(-0.15, 0.22);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < 0.4) continue;
    const yTop = groundHeight(Math.cos(a) * R, Math.sin(a) * R);
    const over = Math.max(0, r - R);
    const y = yTop - over * over * 3.5 - over * 0.25;
    const isYellow = chance(0.08);
    moss.push([x, z, y, rand(0.06, 0.14), isYellow ? '#d6c867' : pick(mossCols)]);
  }
  const mossMesh = new THREE.InstancedMesh(jitter(new THREE.IcosahedronGeometry(1, 0), 0.06, 1.5), makeClay({ bump: 0.03, roughness: 0.95, foliage: true }), moss.length);
  moss.forEach(([x, z, y, r, c], i) => {
    dummy.position.set(x, y - r * 0.15, z);
    dummy.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    dummy.scale.set(r, r * rand(0.5, 0.75), r);
    dummy.updateMatrix();
    mossMesh.setMatrixAt(i, dummy.matrix);
    mossMesh.setColorAt(i, col.set(c));
  });
  mossMesh.receiveShadow = true;
  mossMesh.castShadow = false;
  live.add(mossMesh);

  // ---- tiny flowers on the moss -------------------------------------------
  const tf = [];
  for (let i = 0; i < 420; i++) {
    const s = findSpot({ maxR: 9.7, pad: 0.05, path: 0.4, tries: 10 });
    if (s) tf.push(s);
  }
  const tfMesh = new THREE.InstancedMesh(tinyFlowerGeo(), makeClay({ vertexColors: true, bump: 0.01 }), tf.length);
  const tfCols = ['#fffaf2', '#fff4e4', '#f8d6dc', '#f6e2b0', '#f3c2c9', '#ffffff'];
  tf.forEach(([x, z], i) => {
    dummy.position.set(x, groundHeight(x, z) + rand(0.02, 0.06), z);
    dummy.rotation.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3));
    dummy.scale.setScalar(rand(0.7, 1.3));
    dummy.updateMatrix();
    tfMesh.setMatrixAt(i, dummy.matrix);
    tfMesh.setColorAt(i, col.set(pick(tfCols)));
  });
  tfMesh.castShadow = false;
  tfMesh.receiveShadow = true;
  live.add(tfMesh);

  // ---- fallen sakura petals on the ground ------------------------------------
  const gp = [];
  for (let i = 0; i < 420; i++) {
    let x, z;
    if (chance(0.55)) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * 5;
      x = 3.4 + Math.cos(a) * r; z = -2.6 + Math.sin(a) * r;
    } else { const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * 9.6; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    if (!onIsland(x, z, 0.1)) continue;
    gp.push([x, z]);
  }
  const petalMat = makeClay({ vertexColors: true, side: THREE.DoubleSide, bump: 0.005, blossom: true, noSnow: true });
  const gpMesh = new THREE.InstancedMesh(petalGeo({ L: 0.13, W: 0.075, cup: 0.2 }), petalMat, gp.length);
  gp.forEach(([x, z], i) => {
    dummy.position.set(x, groundHeight(x, z) + 0.035, z);
    dummy.rotation.set(-Math.PI / 2 + rand(-0.35, 0.35), rand(0, 6), rand(-0.3, 0.3));
    dummy.rotation.order = 'YXZ';
    dummy.scale.setScalar(rand(0.8, 1.2));
    dummy.updateMatrix();
    gpMesh.setMatrixAt(i, dummy.matrix);
    gpMesh.setColorAt(i, col.setRGB(1, 1, 1).lerp(new THREE.Color(1, 0.86, 0.9), rand(0, 1)));
  });
  gpMesh.receiveShadow = true;
  live.add(gpMesh);

  // ---- mushrooms (clusters) -----------------------------------------------
  const types = [
    ['#d8463c', '#fff4e6'], ['#e2683f', '#fff6ec'], ['#b9844f', null], ['#e88a5a', '#fff2e2'], ['#8a5a3a', '#f3e2cc'], ['#d85a7a', '#fff6ee'],
  ];
  const clusterSpots = [[-3.6, 2.6], [-4.9, 0.4], [-2.0, 4.6], [5.0, -0.4], [2.2, -5.4], [-7.0, 2.6], [-1.4, -4.2], [6.8, -2.6], [-3.2, -6.8], [4.6, 6.1], [-6.3, -0.8], [1.0, 7.4]];
  for (const [cx, cz] of clusterSpots) {
    if (!isFree(cx, cz, 0.35)) continue;
    const [cc, dc] = pick(types);
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) {
      const x = cx + rand(-0.32, 0.32), z = cz + rand(-0.32, 0.32);
      if (!isFree(x, z, 0.12) || pathDist(x, z) < 0.35) continue;
      const big = i === 0;
      mushroom(staticGroup, x, z, big ? rand(0.32, 0.46) : rand(0.16, 0.28), big ? rand(0.2, 0.28) : rand(0.1, 0.17), cc, dc);
    }
    addZone(cx, cz, 0.4);
  }

  // ---- plants, ferns, succulents ------------------------------------------
  for (let i = 0; i < 13; i++) {
    const s = findSpot({ minR: 2, maxR: 9.2, pad: 0.4, path: 0.6 });
    if (!s) continue;
    const variant = i % 3;
    if (variant === 0) plant(staticGroup, s[0], s[1], { n: randInt(7, 11), len: rand(0.4, 0.62), width: 0.18 });
    else if (variant === 1) plant(staticGroup, s[0], s[1], { n: randInt(6, 9), len: rand(0.35, 0.5), width: 0.14, c1: '#e09a7c', c2: '#f3c5a8' });
    else plant(staticGroup, s[0], s[1], { n: randInt(9, 13), len: rand(0.3, 0.42), width: 0.1, c1: '#91a868', c2: '#c5d39b', spread: 0.8 });
    addZone(s[0], s[1], 0.35);
  }
  for (let i = 0; i < 4; i++) {
    const s = findSpot({ minR: 3, maxR: 9, pad: 0.55, path: 0.7 });
    if (!s) continue;
    fern(staticGroup, s[0], s[1], rand(0.8, 1.1));
    addZone(s[0], s[1], 0.6);
  }
  for (let i = 0; i < 7; i++) {
    const s = findSpot({ minR: 1.5, maxR: 9.2, pad: 0.3, path: 0.5 });
    if (!s) continue;
    if (i % 2) spiky(staticGroup, s[0], s[1], rand(0.85, 1.2));
    else succulent(staticGroup, s[0], s[1], rand(0.8, 1.15));
    addZone(s[0], s[1], 0.32);
  }
  const flowerSpots = [];
  const clumpCols = ['#fff4e6', '#ff8aa0', '#ffb04a', '#ffd84a', '#c88af0'];
  for (let i = 0; i < 12; i++) {
    const s = findSpot({ minR: 1.5, maxR: 9.3, pad: 0.22, path: 0.45 });
    if (!s) continue;
    flowerClump(staticGroup, s[0], s[1], clumpCols[i % clumpCols.length]);
    flowerSpots.push(new THREE.Vector3(s[0] + 0.35, 0, s[1] + 0.2));
    addZone(s[0], s[1], 0.2);
  }

  // ---- pebbles and stepping stones ----------------------------------------
  const stoneCols = ['#c3b8aa', '#b2a698', '#d2c8b9', '#a69a8d', '#cbbfae'];
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = rand(1.15, 1.9);
    const x = 3.6 + Math.cos(a) * r, z = -2.6 + Math.sin(a) * r;
    if (!isFree(x, z, -0.2) && chance(0.3)) continue;
    pebble(staticGroup, x, z, rand(0.08, 0.2), pick(stoneCols));
  }
  for (let i = 0; i < 30; i++) {
    const s = findSpot({ maxR: 9.5, pad: 0.1, path: 0.3 });
    if (s) pebble(staticGroup, s[0], s[1], rand(0.05, 0.14), pick(stoneCols));
  }
  // stepping stones along the path
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len / 0.62);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t + rand(-0.08, 0.08), z = az + (bz - az) * t + rand(-0.08, 0.08);
      if (!onIsland(x, z, 0.45)) continue;
      const r = rand(0.2, 0.28);
      const st = jitter(new THREE.CylinderGeometry(1, 1.05, 0.5, 16, 2), 0.1, 1.2, rand(0, 30));
      mesh(st, clay(pick(stoneCols)), staticGroup, [x, groundHeight(x, z) + 0.005, z], [0, rand(0, 6), 0], [r, 0.16, r * rand(0.75, 0.95)]);
    }
  }

  // ---- autumn maple leaves (island + table) --------------------------------
  const mg = mapleGeo();
  const leafCols = ['#e3874f', '#d4693f', '#eba85e', '#e9a07d', '#d9795d', '#f0b46e'];
  const dropLeaf = (x, y, z, s) => {
    const m = mesh(mg, clay(pick(leafCols)), staticGroup, [x, y, z], null, s);
    m.rotation.order = 'YXZ';
    m.rotation.set(rand(-0.15, 0.15), rand(0, 6), rand(-0.15, 0.15));
  };
  for (let i = 0; i < 52; i++) {
    const s = findSpot({ maxR: 9.8, pad: 0.05, path: 0.0 });
    if (s) dropLeaf(s[0], groundHeight(s[0], s[1]) + 0.03, s[1], rand(0.12, 0.2));
  }

  return { staticGroup, live, flowerSpots };
}
