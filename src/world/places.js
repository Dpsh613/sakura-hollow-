import * as THREE from 'three';
import { rand, pick, randInt } from '../core/noise.js';
import { clay, glowMat, haloMat } from '../core/materials.js';
import { rbox, mesh, soft, jitter, colorize, taperedTube, leafGeo, sphereGeo, basis } from '../core/geo.js';
import { groundHeight, BRIDGE, walkHeight } from './island.js';
import { pumpkin } from './props.js';

const WOOD = '#7a4a2e', WOOD_D = '#56301e', WOOD_L = '#a3693f';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function log(parent, a, b, r, col = '#6b432f') {
  const g = taperedTube([a, a.clone().lerp(b, 0.5).add(V(0, 0.02, 0)), b], () => r, { segments: 10, radial: 10, ridge: 0.06, ridgeN: 9, capStart: true, color: (t, rv, c) => c.set(col).multiplyScalar(0.9 + rv * 0.12) });
  const m = mesh(g, clay('#ffffff'), parent);
  // pale end grain discs
  for (const [p, q] of [[a, b], [b, a]]) {
    const d = q.clone().sub(p).normalize();
    const disc = new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.02, 12);
    colorize(disc, '#d9b98d', (x, y, z, c) => c.multiplyScalar(0.85 + 0.15 * Math.sin(Math.hypot(x, z) * 60)));
    const dm = mesh(disc, clay('#ffffff'), parent);
    dm.applyMatrix4(basis(p.clone().addScaledVector(d, -r * 0.62), d, V(0, 1, 0)));
  }
  return m;
}

// ---------------------------------------------------------------------------
export function campfire(x, z) {
  const y = groundHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // stone ring
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const r = rand(0.1, 0.14);
    mesh(jitter(sphereGeo(1, 9), 0.15, 2, i), clay(pick(['#8f857a', '#a39788', '#7a7068'])), group, [Math.cos(a) * 0.42, r * 0.4, Math.sin(a) * 0.42], [0, rand(0, 6), 0], [r, r * 0.7, r * 1.1]);
  }
  mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.03, 18), clay('#3a2c24'), group, [0, 0.01, 0]);
  // firewood teepee
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    log(group, V(Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3), V(Math.cos(a) * 0.04, 0.38, Math.sin(a) * 0.04), 0.035, '#5a3826');
  }
  // flames
  const flameMat = glowMat('#ffb347', '#ff6a1a', 2.2);
  const flameMat2 = glowMat('#ffe28a', '#ffb02e', 2.6);
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t) * 0.5 + 0.0001, t)); }
  const flameGeo = soft(new THREE.LatheGeometry(prof, 10));
  const flames = [];
  const fg = new THREE.Group();
  fg.position.y = 0.06;
  fg.userData.keep = true;
  group.add(fg);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(flameGeo, i < 2 ? flameMat2 : flameMat);
    const a = (i / 5) * Math.PI * 2;
    f.position.set(i < 2 ? Math.cos(a) * 0.03 : Math.cos(a) * 0.1, 0, i < 2 ? Math.sin(a) * 0.03 : Math.sin(a) * 0.1);
    f.userData = { s: i < 2 ? 0.55 : 0.36, ph: rand(0, 6) };
    fg.add(f);
    flames.push(f);
  }
  const halo = new THREE.Mesh(sphereGeo(1, 16), haloMat('#ff8a3a', 0.4));
  halo.position.y = 0.35;
  halo.scale.setScalar(0.75);
  fg.add(halo);
  // warm light pool on the ground
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} ',
    fragmentShader: 'uniform float uI; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * uI; gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a, 1.0);} ',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  fg.add(pool);
  // log benches around
  const seats = [];
  const benchAngles = [0.4, 2.3, 4.2];
  for (const a of benchAngles) {
    const cx = Math.cos(a) * 1.15, cz = Math.sin(a) * 1.15;
    const tx = -Math.sin(a) * 0.55, tz = Math.cos(a) * 0.55;
    const yy = groundHeight(x + cx, z + cz) - y;
    log(group, V(cx - tx, yy + 0.13, cz - tz), V(cx + tx, yy + 0.13, cz + tz), 0.14);
    for (const k of [-0.25, 0.25]) {
      const px = cx + (tx / 0.55) * k, pz = cz + (tz / 0.55) * k;
      seats.push({ pos: V(x + px * 1.0, 0, z + pz * 1.0), seatY: y + yy + 0.27, face: Math.atan2(-px, -pz) });
    }
  }
  return {
    group, flames, flameMat, flameMat2, halo, poolMat, seats, center: V(x, y, z), lit: 0, want: 0,
    update(t, dt) {
      this.lit += (this.want - this.lit) * Math.min(1, dt * 1.5);
      const L = this.lit;
      fg.visible = L > 0.01;
      for (const f of flames) {
        const u = f.userData;
        const fl = 0.85 + 0.15 * Math.sin(t * 9 + u.ph) + 0.1 * Math.sin(t * 17 + u.ph * 2);
        f.scale.set(u.s * (0.9 + 0.1 * Math.sin(t * 7 + u.ph)) * L, u.s * 1.6 * fl * L, u.s * L);
        f.rotation.y = t * 0.6 + u.ph;
        f.rotation.z = Math.sin(t * 5 + u.ph) * 0.12;
      }
      const flick = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3);
      flameMat.emissiveIntensity = 2.2 * flick;
      flameMat2.emissiveIntensity = 2.6 * flick;
      halo.material.uniforms.uStrength.value = 0.35 * flick * L;
      poolMat.uniforms.uI.value = 0.3 * flick * L;
    },
  };
}

// ---------------------------------------------------------------------------
function carrotPlant() {
  const g = new THREE.Group();
  mesh(sphereGeo(0.05, 8), clay('#ee7f2c'), g, [0, 0.0, 0], null, [1, 0.8, 1]);
  for (let k = 0; k < 5; k++) {
    const lg = leafGeo({ length: rand(0.2, 0.28), width: 0.07, thick: 0.02, bend: 0.1, c1: '#4f8a2e', c2: '#86b84a', wSeg: 5, hSeg: 6 });
    const m = mesh(lg, clay('#ffffff', { foliage: true }), g, [0, 0.02, 0], [-rand(0.15, 0.5), (k / 5) * 6.28, 0]);
    m.rotation.order = 'YXZ';
  }
  return g;
}
function cabbagePlant() {
  const g = new THREE.Group();
  mesh(sphereGeo(0.1, 12), clay('#9cc06a', { foliage: true }), g, [0, 0.08, 0]);
  for (let k = 0; k < 7; k++) {
    const lg = leafGeo({ length: 0.2, width: 0.18, thick: 0.03, cup: 0.4, bend: 0.12, c1: '#5f9a3a', c2: '#a9cf7a', wSeg: 6, hSeg: 6 });
    const m = mesh(lg, clay('#ffffff', { foliage: true }), g, [0, 0.0, 0], [-0.75, (k / 7) * 6.28, 0]);
    m.rotation.order = 'YXZ';
  }
  return g;
}
function sproutPlant() {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const lg = leafGeo({ length: 0.1, width: 0.07, thick: 0.02, c1: '#5f9a3a', c2: '#a9d06a', wSeg: 5, hSeg: 5 });
    const m = mesh(lg, clay('#ffffff', { foliage: true }), g, [0, 0, 0], [-0.7, k * 2.1, 0]);
    m.rotation.order = 'YXZ';
  }
  mesh(sphereGeo(0.035, 8), clay('#e8455a'), g, [0, 0.09, 0]); // strawberry
  return g;
}

export function garden(x, z, rot = 0) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  group.rotation.y = rot;
  const W = 2.3, D = 1.5;
  mesh(jitter(rbox(W, 0.14, D, 0.06, 2), 0.01, 3), clay('#4f3424'), group, [0, 0.04, 0]);
  const rows = 3, cols = 6;
  const plots = [];
  for (let r = 0; r < rows; r++) {
    const rz = -D / 2 + (r + 0.5) * (D / rows);
    const ridge = jitter(rbox(W - 0.2, 0.1, 0.24, 0.05, 2), 0.01, 4, r);
    mesh(ridge, clay('#5e3e2b'), group, [0, 0.13, rz]);
    for (let c = 0; c < cols; c++) {
      const rx = -W / 2 + 0.25 + c * ((W - 0.5) / (cols - 1));
      const kind = r === 0 ? 'carrot' : r === 1 ? 'cabbage' : 'berry';
      const plant = kind === 'carrot' ? carrotPlant() : kind === 'cabbage' ? cabbagePlant() : sproutPlant();
      plant.position.set(rx, 0.17, rz);
      plant.rotation.y = rand(0, 6);
      plant.userData.keep = true;
      group.add(plant);
      const growth = rand(0.4, 1);
      plant.scale.setScalar(growth);
      plots.push({ plant, kind, growth, local: V(rx, 0.17, rz), thirst: rand(0, 0.5) });
    }
  }
  // picket fence on three sides
  const fence = (ax, az, bx, bz) => {
    const A = V(ax, 0, az), B = V(bx, 0, bz);
    const n = Math.round(A.distanceTo(B) / 0.18);
    for (let i = 0; i <= n; i++) {
      const p = A.clone().lerp(B, i / n);
      mesh(rbox(0.05, 0.36, 0.03, 0.012), clay('#e9dcc4'), group, [p.x, 0.18, p.z], [0, Math.atan2(B.x - A.x, B.z - A.z), 0]);
      mesh(new THREE.ConeGeometry(0.035, 0.06, 4), clay('#e9dcc4'), group, [p.x, 0.39, p.z], [0, Math.PI / 4, 0]);
    }
    const mid = A.clone().lerp(B, 0.5);
    for (const hy of [0.12, 0.28]) mesh(rbox(0.025, 0.03, A.distanceTo(B), 0.01), clay('#d9c8ab'), group, [mid.x, hy, mid.z], [0, Math.atan2(B.x - A.x, B.z - A.z), 0]);
  };
  fence(-W / 2 - 0.12, -D / 2 - 0.12, W / 2 + 0.12, -D / 2 - 0.12);
  fence(-W / 2 - 0.12, -D / 2 - 0.12, -W / 2 - 0.12, D / 2 + 0.12);
  fence(W / 2 + 0.12, -D / 2 - 0.12, W / 2 + 0.12, D / 2 + 0.12);
  // scarecrow
  const sc = new THREE.Group();
  sc.position.set(W / 2 - 0.15, 0, -D / 2 - 0.02);
  group.add(sc);
  mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 6), clay(WOOD), sc, [0, 0.55, 0]);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), clay(WOOD), sc, [0, 0.82, 0], [0, 0, Math.PI / 2]);
  mesh(eggShirt(), clay('#c95a4a'), sc, [0, 0.78, 0]);
  mesh(sphereGeo(0.13, 12), clay('#e6c99a'), sc, [0, 1.12, 0]);
  mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 14), clay('#d8b35a'), sc, [0, 1.2, 0]);
  mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.12, 12), clay('#d8b35a'), sc, [0, 1.27, 0]);
  for (const s of [-1, 1]) mesh(sphereGeo(0.018, 6), clay('#2a1c16'), sc, [s * 0.045, 1.14, 0.12]);
  // watering can resting at the corner
  const can = wateringCan();
  can.position.set(-W / 2 + 0.05, 0.12, D / 2 + 0.28);
  can.userData.keep = true;
  group.add(can);
  group.updateMatrixWorld(true);
  const workSpots = [];
  for (let r = 0; r < rows; r++) {
    const rz = -D / 2 + (r + 0.5) * (D / rows);
    workSpots.push(group.localToWorld(V(0, 0, D / 2 + 0.45)).setY(0));
  }
  return {
    group, plots, can,
    worldOf: (p) => group.localToWorld(p.local.clone()),
    front: group.localToWorld(V(0, 0, D / 2 + 0.5)),
    frontAt: (lx) => group.localToWorld(V(lx, 0, D / 2 + 0.5)),
    update(dt, env) {
      for (const p of plots) {
        const grow = (1 - env.night * 0.7) * (1 + env.rain * 1.5) * (env.season === 3 ? 0.1 : 1);
        p.growth = Math.min(1, p.growth + dt * 0.006 * grow);
        p.thirst = Math.min(1, Math.max(0, p.thirst + dt * (0.004 - env.rain * 0.05)));
        p.plant.scale.setScalar(0.2 + p.growth * 0.8);
      }
    },
  };
}
function eggShirt() {
  const g = sphereGeo(1, 10);
  g.scale(0.13, 0.17, 0.09);
  return g;
}
export function wateringCan() {
  const g = new THREE.Group();
  mesh(soft(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 14)), clay('#5f9aa8'), g, [0, 0.08, 0]);
  mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), clay('#5f9aa8'), g, [-0.02, 0.17, 0], [0, Math.PI / 2, 0]);
  const spout = mesh(soft(new THREE.CylinderGeometry(0.012, 0.022, 0.2, 8)), clay('#5f9aa8'), g, [0.12, 0.13, 0], [0, 0, -0.9]);
  mesh(soft(new THREE.CylinderGeometry(0.03, 0.02, 0.02, 10)), clay('#4c8290'), g, [0.2, 0.2, 0], [0, 0, -0.9]);
  g.userData.spoutTip = V(0.21, 0.2, 0);
  return g;
}

// ---------------------------------------------------------------------------
export function swing(anchor) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.copy(anchor);
  pivot.userData.keep = true;
  group.add(pivot);
  const seatY = groundHeight(anchor.x, anchor.z) + 0.55;
  const len = anchor.y - seatY;
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 5), clay('#d8c49c'), pivot, [s * 0.28, -len / 2, 0]);
    mesh(new THREE.TorusGeometry(0.05, 0.015, 5, 10), clay('#d8c49c'), pivot, [s * 0.28, 0, 0], [0, Math.PI / 2, 0]);
  }
  mesh(rbox(0.7, 0.05, 0.26, 0.02), clay(WOOD_L), pivot, [0, -len, 0]);
  return {
    group, pivot, len, angle: 0, vel: 0, seatPoint: () => pivot.localToWorld(V(0, -len + 0.03, 0)),
    groundFront: V(anchor.x, 0, anchor.z).add(V(0, 0, 0.9)),
    update(dt, push) {
      // simple pendulum with damping
      this.vel += (-9.8 / len) * Math.sin(this.angle) * dt + push * dt;
      this.vel *= 1 - 0.18 * dt;
      this.angle += this.vel * dt;
      pivot.rotation.x = this.angle;
    },
  };
}

// ---------------------------------------------------------------------------
export function dock(a, b) {
  const group = new THREE.Group();
  const A = V(a[0], 0, a[1]), B = V(b[0], 0, b[1]);
  const dir = B.clone().sub(A).normalize();
  const side = V(-dir.z, 0, dir.x);
  const len = A.distanceTo(B);
  const deckY = Math.max(groundHeight(A.x, A.z), -0.12) + 0.12;
  const n = Math.round(len / 0.16);
  for (let i = 0; i < n; i++) {
    const p = A.clone().addScaledVector(dir, (i + 0.5) * (len / n));
    mesh(rbox(0.62, 0.05, 0.14, 0.015), clay(i % 3 === 0 ? WOOD_D : WOOD_L), group, [p.x, deckY + rand(-0.008, 0.008), p.z], [0, Math.atan2(dir.x, dir.z), 0]);
  }
  for (const t of [0.15, 0.6, 1.0]) for (const s of [-1, 1]) {
    const p = A.clone().addScaledVector(dir, t * len - 0.05).addScaledVector(side, s * 0.3);
    mesh(soft(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 8)), clay(WOOD_D), group, [p.x, deckY - 0.15, p.z]);
  }
  return { group, deckY, end: B.clone().addScaledVector(dir, -0.25).setY(deckY + 0.03), face: Math.atan2(dir.x, dir.z) };
}

// ---------------------------------------------------------------------------
export function picnic(x, z, rot = 0) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y + 0.02, z);
  group.rotation.y = rot;
  const W = 1.6, D = 1.2, NX = 16, NZ = 12;
  const g = new THREE.PlaneGeometry(W, D, NX, NZ);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const cols = [];
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i);
    const edge = Math.max(Math.abs(px) / (W / 2), Math.abs(pz) / (D / 2));
    p.setY(i, groundHeight(x + px, z + pz) - y + 0.02 * Math.sin(px * 6) * Math.sin(pz * 5) + (edge > 0.95 ? -0.01 : 0));
    const cx = Math.floor((px + W / 2) / 0.2), cz = Math.floor((pz + D / 2) / 0.2);
    const c = (cx + cz) % 2 ? new THREE.Color('#e04848') : new THREE.Color('#fbf1e2');
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  mesh(g, clay('#ffffff', { kind: 'clay2' }), group).castShadow = false;
  // basket
  const bk = new THREE.Group();
  bk.position.set(0.5, 0, -0.3);
  group.add(bk);
  const basketG = soft(new THREE.CylinderGeometry(0.2, 0.16, 0.2, 16, 4, true));
  colorize(basketG, '#b8844a', (px, py, pz, c) => c.multiplyScalar(0.8 + 0.25 * ((Math.floor(Math.atan2(pz, px) * 5) + Math.floor(py * 40)) % 2)));
  mesh(basketG, clay('#ffffff', { kind: 'clay2' }), bk, [0, 0.1, 0]);
  mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 16, Math.PI), clay('#9a6a38'), bk, [0, 0.2, 0]);
  for (let i = 0; i < 3; i++) mesh(sphereGeo(0.07, 10), clay(pick(['#d64a3c', '#e8b23a', '#7aa63a'])), bk, [rand(-0.08, 0.08), 0.2, rand(-0.08, 0.08)]);
  // teapot + cups
  const tp = new THREE.Group();
  tp.position.set(-0.2, 0, 0.05);
  group.add(tp);
  mesh(sphereGeo(0.11, 14), clay('#7fb3c9'), tp, [0, 0.1, 0], null, [1, 0.85, 1]);
  mesh(sphereGeo(0.03, 8), clay('#f2e6d0'), tp, [0, 0.2, 0]);
  mesh(soft(new THREE.CylinderGeometry(0.015, 0.025, 0.12, 8)), clay('#7fb3c9'), tp, [0.12, 0.12, 0], [0, 0, -0.8]);
  mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), clay('#7fb3c9'), tp, [-0.11, 0.11, 0]);
  for (const [cx, cz] of [[0.1, 0.35], [-0.45, -0.2], [0.35, 0.25]]) {
    mesh(soft(new THREE.CylinderGeometry(0.04, 0.032, 0.06, 12)), clay('#fbf1e2'), group, [cx, 0.03, cz]);
    mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.01, 12), clay('#8a5a3a'), group, [cx, 0.058, cz]);
  }
  group.updateMatrixWorld(true);
  const spots = [V(-0.55, 0, 0.25), V(0.15, 0, 0.42), V(-0.1, 0, -0.42)].map((v) => group.localToWorld(v));
  return { group, spots, center: V(x, y, z) };
}

// ---------------------------------------------------------------------------
export function bench(x, z, face) {
  const group = new THREE.Group();
  group.position.set(x, groundHeight(x, z), z);
  group.rotation.y = face;
  mesh(rbox(0.9, 0.05, 0.28, 0.02), clay(WOOD_L), group, [0, 0.3, 0]);
  mesh(rbox(0.9, 0.18, 0.04, 0.02), clay(WOOD_L), group, [0, 0.48, -0.13], [-0.15, 0, 0]);
  for (const s of [-1, 1]) for (const t of [-1, 1]) mesh(rbox(0.05, 0.3, 0.05, 0.015), clay(WOOD_D), group, [s * 0.38, 0.15, t * 0.1]);
  return { group, seats: [-0.22, 0.22].map((o) => ({ pos: group.localToWorld(V(o, 0, 0.02)), seatY: group.position.y + 0.33, face })) };
}

export function signpost(x, z) {
  const group = new THREE.Group();
  group.position.set(x, groundHeight(x, z), z);
  mesh(rbox(0.07, 1.0, 0.07, 0.02), clay(WOOD_D), group, [0, 0.5, 0]);
  const boards = [[0.75, 0.6, '#d9b58a'], [0.55, -0.9, '#c9a070'], [0.35, 2.4, '#e2c299']];
  for (const [yy, ry, c] of boards) {
    const b = new THREE.Group();
    b.position.y = yy + 0.1;
    b.rotation.y = ry;
    group.add(b);
    mesh(rbox(0.42, 0.11, 0.03, 0.015), clay(c), b, [0.2, 0, 0]);
    mesh(new THREE.ConeGeometry(0.06, 0.1, 3), clay(c), b, [0.45, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.3]);
    for (let k = 0; k < 3; k++) mesh(rbox(0.06, 0.012, 0.01, 0.004), clay('#7a5236'), b, [0.08 + k * 0.1, 0, 0.018]);
  }
  return group;
}

export function birdhouse(x, z) {
  const group = new THREE.Group();
  group.position.set(x, groundHeight(x, z), z);
  mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.6, 8), clay(WOOD_D), group, [0, 0.8, 0]);
  mesh(rbox(0.3, 0.28, 0.28, 0.03), clay('#e2a65a'), group, [0, 1.72, 0]);
  const roof = new THREE.ConeGeometry(0.28, 0.2, 4);
  mesh(roof, clay('#c25e3a'), group, [0, 1.96, 0], [0, Math.PI / 4, 0]);
  mesh(new THREE.CircleGeometry(0.05, 14), clay('#2a1c16'), group, [0, 1.76, 0.142]);
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 5), clay(WOOD_D), group, [0, 1.66, 0.18], [Math.PI / 2, 0, 0]);
  return { group, perch: V(x, group.position.y + 2.07, z), door: V(x, group.position.y + 1.66, z + 0.24) };
}

export function rootDoor(x, z, face) {
  const group = new THREE.Group();
  group.position.set(x, groundHeight(x, z), z);
  group.rotation.y = face;
  const door = new THREE.Shape();
  door.absarc(0, 0.16, 0.13, 0, Math.PI * 2, false);
  const d = new THREE.ExtrudeGeometry(door, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 18 });
  mesh(d, clay('#3e6e8a'), group, [0, 0, 0]);
  mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 20), clay('#8a6440'), group, [0, 0.16, 0.035]);
  mesh(sphereGeo(0.015, 6), clay('#e8c35a'), group, [0.07, 0.15, 0.05]);
  // tiny lamp
  const lampMat = glowMat('#ffe3a0', '#ffb24a', 0.2);
  const lamp = new THREE.Mesh(sphereGeo(0.03, 8), lampMat);
  lamp.position.set(0.2, 0.3, 0.04);
  lamp.userData.keep = true;
  group.add(lamp);
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4), clay('#3a2a20'), group, [0.2, 0.35, 0.04]);
  // doormat + mini pot
  mesh(rbox(0.22, 0.012, 0.1, 0.005), clay('#c47a5a'), group, [0, 0.005, 0.12]);
  group.updateMatrixWorld(true);
  return { group, lampMat, front: group.localToWorld(V(0, 0, 0.35)), inside: group.localToWorld(V(0, 0, -0.15)) };
}

export function hollowLog(x, z, face) {
  const group = new THREE.Group();
  group.position.set(x, groundHeight(x, z), z);
  group.rotation.y = face;
  const g = new THREE.CylinderGeometry(0.32, 0.36, 1.3, 16, 4, true);
  g.rotateZ(Math.PI / 2);
  colorize(g, '#6b432f', (px, py, pz, c) => c.multiplyScalar(0.85 + 0.2 * Math.sin(Math.atan2(pz, py) * 9 + px * 3)));
  mesh(jitter(g, 0.02, 3), clay('#ffffff', { kind: 'clay2' }), group, [0, 0.3, 0]);
  const inner = new THREE.CylinderGeometry(0.25, 0.28, 1.28, 14, 1, true);
  inner.rotateZ(Math.PI / 2);
  mesh(inner, clay('#3a271c', { kind: 'clay2' }), group, [0, 0.3, 0]);
  for (let i = 0; i < 6; i++) mesh(sphereGeo(rand(0.05, 0.09), 8), clay(pick(['#5f8c38', '#7aa646'])), group, [rand(-0.5, 0.5), 0.6, rand(-0.1, 0.1)], null, [1, 0.5, 1]);
  mesh(sphereGeo(0.09, 10), clay('#e8a03a'), group, [0.4, 0.62, 0.1], null, [1, 0.6, 1]);
  group.updateMatrixWorld(true);
  return { group, mouth: group.localToWorld(V(0.85, 0, 0)), inside: group.localToWorld(V(0.2, 0, 0)) };
}

export function fairyRing(x, z, r = 0.75) {
  const group = new THREE.Group();
  const mats = [];
  const hues = [['#f3c7ff', '#c46ad0'], ['#c7f0ff', '#4ab0e8'], ['#d4ffd0', '#58d06a']];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand(-0.1, 0.1);
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = groundHeight(px, pz);
    const [c, e] = hues[i % 3];
    const m = glowMat(c, e, 0.05);
    mats.push(m);
    const h = rand(0.12, 0.22), cr = rand(0.06, 0.1);
    mesh(new THREE.CylinderGeometry(cr * 0.35, cr * 0.45, h, 8), clay('#f2ead8'), group, [px, y + h / 2, pz]);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
    cap.position.set(px, y + h, pz);
    cap.userData.keep = true;
    cap.userData.fairy = true;
    group.add(cap);
  }
  return { group, mats, center: V(x, groundHeight(x, z), z), r };
}

export function bridge() {
  const group = new THREE.Group();
  const { x, z, len, wid, dir } = BRIDGE;
  const d = V(dir[0], 0, dir[1]);
  const side = V(-d.z, 0, d.x);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + (i + 0.5) * (len / n);
    const p = V(x, 0, z).addScaledVector(d, u);
    const y = walkHeight(p.x, p.z) - 0.025;
    const slope = Math.atan(-0.2 * Math.PI / len * Math.sin((u / len) * Math.PI));
    const plank = mesh(rbox(0.13, 0.05, wid, 0.015), clay(i % 2 ? WOOD_L : '#b07548'), group, [p.x, y, p.z]);
    plank.rotation.order = 'YXZ';
    plank.rotation.set(0, Math.atan2(d.x, d.z) + Math.PI / 2, slope);
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = -len / 2 + (i / 8) * len;
      const p = V(x, 0, z).addScaledVector(d, u).addScaledVector(side, s * (wid / 2));
      pts.push(p.setY(walkHeight(V(x, 0, z).addScaledVector(d, u).x, V(x, 0, z).addScaledVector(d, u).z) + 0.32));
    }
    mesh(taperedTube(pts, () => 0.022, { segments: 16, radial: 5, capStart: true }), clay(WOOD), group);
    for (const i of [0, 4, 8]) mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.36, 6), clay(WOOD_D), group, [pts[i].x, pts[i].y - 0.17, pts[i].z]);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Things characters carry
// ---------------------------------------------------------------------------
export function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'apple') {
    mesh(sphereGeo(0.07, 12), clay('#d63c34'), g, [0, 0, 0], null, [1, 0.92, 1]);
    mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.04, 5), clay('#5a3a24'), g, [0, 0.07, 0]);
    mesh(leafGeo({ length: 0.05, width: 0.03, thick: 0.01, c1: '#4f8a2e', wSeg: 4, hSeg: 4 }), clay('#ffffff'), g, [0.01, 0.07, 0], [0, 0, -1]);
  } else if (kind === 'carrot') {
    mesh(new THREE.ConeGeometry(0.035, 0.2, 8), clay('#ee7f2c'), g, [0, -0.08, 0], [Math.PI, 0, 0]);
    for (let k = 0; k < 3; k++) mesh(leafGeo({ length: 0.12, width: 0.04, thick: 0.012, c1: '#4f8a2e', c2: '#86b84a', wSeg: 4, hSeg: 5 }), clay('#ffffff'), g, [0, 0.01, 0], [rand(-0.3, 0.3), k * 2.1, 0]);
  } else if (kind === 'flowers') {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.28;
      mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), clay('#5f8a3a'), g, [Math.cos(a) * 0.01, -0.02, Math.sin(a) * 0.01], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]);
      mesh(sphereGeo(0.03, 8), clay(pick(['#ffd34a', '#ff7aa2', '#ffffff', '#b98ef0', '#ff8a4a'])), g, [Math.cos(a) * 0.035, 0.06, Math.sin(a) * 0.035]);
    }
  } else if (kind === 'acorn') {
    mesh(sphereGeo(0.035, 10), clay('#b8743a'), g, [0, -0.01, 0], null, [1, 1.2, 1]);
    mesh(sphereGeo(0.038, 10), clay('#6e4a2c'), g, [0, 0.02, 0], null, [1, 0.6, 1]);
  } else if (kind === 'rod') {
    mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.9, 5), clay(WOOD_L), g, [0, 0.4, 0.18], [0.45, 0, 0]);
    g.userData.tip = V(0, 0.82, 0.38);
  } else if (kind === 'fish') {
    mesh(sphereGeo(0.06, 10), clay('#e88a4a'), g, [0, 0, 0], null, [0.6, 1, 1.8]);
    mesh(new THREE.ConeGeometry(0.05, 0.07, 6), clay('#e88a4a'), g, [0, 0, -0.13], [Math.PI / 2, 0, 0], [0.3, 1, 1]);
  } else if (kind === 'mug') {
    mesh(soft(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 12)), clay('#f2e6d0'), g);
    mesh(new THREE.TorusGeometry(0.025, 0.008, 5, 10), clay('#f2e6d0'), g, [0.05, 0, 0]);
  } else if (kind === 'book') {
    mesh(rbox(0.16, 0.03, 0.12, 0.01), clay('#7a3a5a'), g);
    mesh(rbox(0.15, 0.022, 0.11, 0.008), clay('#f8f0e0'), g, [0.005, 0, 0]);
  } else if (kind === 'can') {
    const c = wateringCan();
    c.scale.setScalar(0.85);
    g.add(c);
  } else if (kind === 'boat') {
    const hull = new THREE.CylinderGeometry(0.1, 0.06, 0.05, 4, 1);
    hull.rotateY(Math.PI / 4);
    hull.scale(1.6, 1, 0.7);
    mesh(hull, clay('#f2e6d0'), g);
    mesh(new THREE.ConeGeometry(0.07, 0.14, 3), clay('#e8a03a'), g, [0, 0.09, 0], null, [1, 1, 0.1]);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A giant toadstool: a whimsical umbrella the creatures huddle under when it rains. */
export function bigMushroom(x, z) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  const prof = [[0, 0], [0.32, 0], [0.26, 0.2], [0.2, 0.8], [0.19, 1.4], [0.24, 1.62], [0, 1.62]].map((p) => new THREE.Vector2(p[0], p[1]));
  mesh(jitter(new THREE.LatheGeometry(prof, 16), 0.02, 2), clay('#f4e6cf'), group);
  mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), clay('#efe0c4'), group, [0, 1.15, 0], [Math.PI / 2, 0.1, 0]);
  const cap = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  mesh(jitter(cap, 0.05, 1.5), clay('#d7473b'), group, [0, 1.55, 0], null, [1.25, 0.72, 1.25]);
  const under = new THREE.CircleGeometry(1.2, 28);
  under.rotateX(Math.PI / 2);
  colorize(under, '#f2dcc0', (px, py, pz, c) => c.multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(Math.atan2(pz, px) * 22))));
  mesh(under, clay('#ffffff', { kind: 'clay2' }), group, [0, 1.42, 0]);
  for (let i = 0; i < 14; i++) {
    const th = rand(0.15, 0.48) * Math.PI, ph = rand(0, Math.PI * 2);
    const px = Math.sin(th) * Math.cos(ph) * 1.25, py = Math.cos(th) * 0.72, pz = Math.sin(th) * Math.sin(ph) * 1.25;
    const n = V(px / 1.56, py / 0.52, pz / 1.56).normalize();
    const d = mesh(sphereGeo(1, 8), clay('#fff6ea'), group, [px, 1.55 + py, pz]);
    d.quaternion.setFromUnitVectors(V(0, 1, 0), n);
    const s = rand(0.08, 0.15);
    d.scale.set(s, s * 0.35, s);
  }
  // a tiny ladybird resident
  mesh(sphereGeo(0.05, 10), clay('#e23a2a'), group, [0.95, 1.83, 0.25], null, [1, 0.6, 1.2]);
  mesh(sphereGeo(0.025, 6), clay('#2a1c16'), group, [0.95, 1.85, 0.31]);
  group.updateMatrixWorld(true);
  const shelter = [0, 2.1, 4.2].map((a) => group.localToWorld(V(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65)).setY(0));
  return { group, shelter };
}
