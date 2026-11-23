import * as THREE from 'three';
import { rand, pick, noise3 } from '../core/noise.js';
import { clay, glowMat } from '../core/materials.js';
import { rbox, mesh, soft, jitter, colorize, taperedTube, leafGeo, sphereGeo, basis } from '../core/geo.js';

// ---------------------------------------------------------------------------
// Paper lantern (chochin) with horizontal ribs, wooden caps and a tassel.
// Group origin = hanging point, so rotating the group swings it naturally.
// ---------------------------------------------------------------------------
export function paperLantern({ color = '#f6c4b0', glow = '#ff9d55', size = 0.18, drop = 0.35, intensity = 1.7 } = {}) {
  const group = new THREE.Group();
  group.userData.keep = true;
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const groove = 1 - 0.035 * (1 - Math.pow(Math.abs(Math.sin(t * Math.PI * 7)), 0.35));
    pts.push(new THREE.Vector2(size * (0.6 + 0.4 * Math.sin(Math.PI * t)) * groove, -size * 1.15 + t * size * 2.3));
  }
  const mat = glowMat(color, glow, intensity);
  const body = mesh(soft(new THREE.LatheGeometry(pts, 20)), mat, group, [0, -drop - size * 1.2, 0]);
  body.castShadow = false;
  const wood = clay('#5f3d2b');
  mesh(soft(new THREE.CylinderGeometry(size * 0.6, size * 0.62, 0.05, 16)), wood, group, [0, -drop - size * 1.2 + size * 1.15, 0]);
  mesh(soft(new THREE.CylinderGeometry(size * 0.62, size * 0.6, 0.05, 16)), wood, group, [0, -drop - size * 1.2 - size * 1.15, 0]);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, drop, 5), clay('#4a3226'), group, [0, -drop / 2, 0]);
  mesh(soft(new THREE.CylinderGeometry(0.012, 0.035, 0.14, 8)), clay('#d9777a'), group, [0, -drop - size * 2.55 - 0.05, 0]);
  mesh(sphereGeo(0.025, 8), clay('#e9b25f'), group, [0, -drop - size * 2.45, 0]);
  return { group, mat, base: intensity };
}

export function bell() {
  const g = new THREE.Group();
  g.userData.keep = true;
  const prof = [[0, 0], [0.065, 0], [0.07, 0.015], [0.055, 0.06], [0.04, 0.1], [0.025, 0.125], [0, 0.13]].map((p) => new THREE.Vector2(p[0], p[1]));
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), clay('#4a3226'), g, [0, -0.08, 0]);
  mesh(soft(new THREE.LatheGeometry(prof, 16)), clay('#c8a064', { roughness: 0.55 }), g, [0, -0.29, 0]);
  mesh(sphereGeo(0.02, 8), clay('#8a6a45'), g, [0, -0.3, 0]);
  mesh(rbox(0.07, 0.15, 0.012, 0.005), clay(pick(['#f2b8bd', '#f6d6b8', '#e9c9d6'])), g, [0, -0.42, 0]);
  return g;
}

// ---------------------------------------------------------------------------
export function pumpkinGeo(r = 0.2, ribs = 9, flat = 0.72, elong = 1) {
  const g = soft(new THREE.SphereGeometry(1, 28, 18));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(z, x);
    const s = Math.abs(Math.sin(phi * ribs * 0.5));
    const k = 0.88 + 0.12 * Math.pow(s, 0.45);
    x *= k; z *= k;
    y *= flat * elong;
    const rr = x * x + z * z;
    if (y > 0) y -= 0.22 * Math.exp(-rr * 9) * flat;
    if (y < 0) y += 0.12 * Math.exp(-rr * 9) * flat;
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.computeVertexNormals();
  return g;
}

export function pumpkin(parent, pos, r, col, { ribs = 9, flat = 0.72, elong = 1, rot = 0, leaf = false } = {}) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.set(rand(-0.1, 0.1), rot, rand(-0.1, 0.1));
  parent.add(g);
  mesh(pumpkinGeo(r, ribs, flat, elong), clay(col), g, [0, r * flat * elong, 0]);
  const top = r * flat * elong * 2 - r * 0.12;
  const stem = taperedTube(
    [new THREE.Vector3(0, top - 0.02, 0), new THREE.Vector3(0.01, top + r * 0.22, 0), new THREE.Vector3(r * 0.12, top + r * 0.36, 0.01)],
    (t) => r * 0.11 * (1 - t * 0.35), { segments: 8, radial: 6, ridge: 0.15, ridgeN: 5 },
  );
  mesh(stem, clay('#7b6a3e'), g);
  if (leaf) {
    const lg = leafGeo({ length: r * 1.2, width: r * 0.9, thick: r * 0.12, cup: 0.25, bend: -0.1, c1: '#7f9a52', c2: '#a7b974' });
    mesh(lg, clay('#ffffff'), g, [r * 0.1, top, 0], [-1.25, rand(0, 6), 0]);
  }
  return g;
}

// ---------------------------------------------------------------------------
export function gift(parent, pos, w, h, d, box, ribbon, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = rotY;
  parent.add(g);
  mesh(rbox(w, h, d, Math.min(w, h, d) * 0.12, 3), clay(box), g, [0, h / 2, 0]);
  mesh(rbox(w * 0.2, h + 0.012, d + 0.012, 0.008), clay(ribbon), g, [0, h / 2, 0]);
  mesh(rbox(w + 0.012, h + 0.012, d * 0.2, 0.008), clay(ribbon), g, [0, h / 2, 0]);
  const s = Math.min(w, d);
  for (const sgn of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(s * 0.17, s * 0.06, 8, 16), clay(ribbon), g, [sgn * s * 0.16, h + s * 0.1, 0], [0, 0, sgn * 0.6]);
    loop.scale.set(1, 0.8, 0.7);
  }
  mesh(sphereGeo(s * 0.08, 10), clay(ribbon), g, [0, h + s * 0.04, 0]);
  return g;
}

// ---------------------------------------------------------------------------
// The harvest cart, brimming with pumpkins and produce.
// ---------------------------------------------------------------------------
export function cart() {
  const g = new THREE.Group();
  const wood = '#a8754f', woodD = '#7b5035', woodL = '#c18f66';
  const by = 0.62;
  mesh(rbox(1.9, 0.08, 1.1, 0.03), clay(woodD), g, [0, by, 0]);
  for (const s of [-1, 1]) {
    for (const [yy, c] of [[0.1, wood], [0.25, woodL]]) {
      mesh(rbox(1.94, 0.13, 0.06, 0.03), clay(c), g, [rand(-0.01, 0.01), by + yy, s * 0.55]);
      mesh(rbox(0.06, 0.13, 1.1, 0.03), clay(c), g, [s * 0.95, by + yy, 0]);
    }
    for (const t of [-1, 1]) mesh(rbox(0.09, 0.42, 0.09, 0.03), clay(woodD), g, [s * 0.95, by + 0.16, t * 0.55]);
  }
  // wheels
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(-0.15, 0.43, s * 0.68);
    g.add(w);
    mesh(new THREE.TorusGeometry(0.38, 0.05, 10, 32), clay(woodD), w);
    mesh(new THREE.TorusGeometry(0.33, 0.022, 6, 32), clay(wood), w);
    mesh(soft(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 14)), clay(woodL), w, null, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mesh(soft(new THREE.CylinderGeometry(0.02, 0.026, 0.32, 6)), clay(wood), w, [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0], [0, 0, a - Math.PI / 2]);
    }
  }
  mesh(soft(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8)), clay(woodD), g, [-0.15, 0.43, 0], [Math.PI / 2, 0, 0]);
  // handles resting on the ground with a crossbar
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(0.9, by + 0.04, s * 0.42), b = new THREE.Vector3(1.85, 0.07, s * 0.36);
    mesh(rbox(0.07, a.distanceTo(b), 0.07, 0.03), clay(wood), g).applyMatrix4(basis(a.clone().add(b).multiplyScalar(0.5), b.clone().sub(a), new THREE.Vector3(0, 0, 1)));
  }
  mesh(soft(new THREE.CylinderGeometry(0.035, 0.035, 0.84, 8)), clay(woodL), g, [1.72, 0.15, 0], [Math.PI / 2, 0, 0]);
  // rest leg at the back
  mesh(rbox(0.07, 0.6, 0.07, 0.025), clay(woodD), g, [-0.85, 0.3, 0]);

  // produce
  const P = [
    { p: [-0.5, by + 0.05, -0.15], r: 0.3, c: '#e8955a' },
    { p: [0.25, by + 0.05, 0.12], r: 0.27, c: '#f0dcb7', ribs: 8 },
    { p: [0.55, by + 0.05, -0.2], r: 0.2, c: '#e3884f' },
    { p: [-0.15, by + 0.2, 0.22], r: 0.18, c: '#9fae6c', ribs: 7 },
    { p: [-0.1, by + 0.38, -0.12], r: 0.22, c: '#eb9f62', leaf: true },
    { p: [0.65, by + 0.06, 0.25], r: 0.16, c: '#f2c480' },
    { p: [-0.68, by + 0.12, 0.27], r: 0.15, c: '#d6744a' },
  ];
  for (const q of P) pumpkin(g, q.p, q.r, q.c, { ribs: q.ribs ?? 9, rot: rand(0, 6), leaf: q.leaf });
  // squash
  mesh(pumpkinGeo(0.13, 6, 0.9, 2.1), clay('#e3b45f'), g, [0.45, by + 0.45, 0.02], [0.3, 0.5, 1.35]);
  // apples
  for (let i = 0; i < 6; i++) {
    const a = mesh(sphereGeo(0.075, 14), clay(pick(['#d9786b', '#e38a74', '#cf6b5e'])), g, [0.1 + rand(-0.25, 0.25), by + 0.32 + rand(0, 0.12), -0.3 + rand(-0.12, 0.12)], null, [1, 0.92, 1]);
    mesh(soft(new THREE.CylinderGeometry(0.006, 0.008, 0.04, 5)), clay('#6c5034'), a, [0, 0.08, 0]);
  }
  // carrots
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    c.position.set(-0.45 + i * 0.08, by + 0.4, 0.1 + rand(-0.05, 0.05));
    c.rotation.set(rand(-0.4, 0.4) + 0.9, rand(0, 6), rand(-0.3, 0.3));
    g.add(c);
    mesh(jitter(new THREE.ConeGeometry(0.045, 0.28, 10, 4), 0.006, 6), clay('#ea8a45'), c, [0, -0.14, 0], [Math.PI, 0, 0]);
    for (let k = 0; k < 3; k++) mesh(leafGeo({ length: 0.14, width: 0.04, thick: 0.015, c1: '#7d9a4e', c2: '#a6c070' }), clay('#ffffff'), c, [0, 0, 0], [rand(-0.4, 0.4), k * 2.1, 0]);
  }
  // cabbage
  const cab = new THREE.Group();
  cab.position.set(0.7, by + 0.24, -0.25);
  g.add(cab);
  mesh(sphereGeo(0.12, 14), clay('#b9c98a'), cab);
  for (let k = 0; k < 7; k++) mesh(leafGeo({ length: 0.2, width: 0.2, thick: 0.03, cup: 0.4, bend: 0.12, c1: '#9fb56e', c2: '#c9d69d' }), clay('#ffffff'), cab, [0, -0.08, 0], [-0.55, (k / 7) * Math.PI * 2, 0]).rotation.order = 'YXZ';
  // autumn leaves tucked in
  for (let k = 0; k < 6; k++) {
    mesh(leafGeo({ length: 0.22, width: 0.13, thick: 0.02, c1: pick(['#e48a55', '#d97040', '#e9a65c']), c2: '#f2c08a' }), clay('#ffffff'), g, [rand(-0.8, 0.8), by + 0.3, pick([-0.5, 0.5])], [rand(-1.6, -0.6), rand(0, 6), 0]);
  }
  return g;
}

// ---------------------------------------------------------------------------
export function stump() {
  const g = new THREE.Group();
  const geo = jitter(new THREE.CylinderGeometry(0.42, 0.56, 0.6, 22, 5, true), 0.03, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.sin(a * 9 + y * 2) + (y < -0.15 ? 0.12 * (-0.15 - y) * 3 : 0);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  colorize(geo, '#7a5440', (x, y, z, c) => c.multiplyScalar(0.85 + 0.25 * Math.abs(Math.sin(Math.atan2(z, x) * 9 + y * 2))));
  mesh(geo, clay('#ffffff'), g, [0, 0.3, 0]);
  const top = new THREE.CircleGeometry(0.43, 28, 0, Math.PI * 2);
  top.rotateX(-Math.PI / 2);
  colorize(top, '#e2c29a', (x, y, z, c) => {
    const r = Math.hypot(x, z);
    c.multiplyScalar(0.86 + 0.14 * Math.sin(r * 55 + noise3(x * 6, 0, z * 6) * 2));
    if (r > 0.38) c.set('#9b6c4f');
  });
  mesh(top, clay('#ffffff'), g, [0, 0.6, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const root = taperedTube([d.clone().multiplyScalar(0.35).setY(0.25), d.clone().multiplyScalar(0.62).setY(0.08), d.clone().multiplyScalar(0.85).setY(-0.04)], (t) => 0.12 * (1 - t * 0.7), { segments: 10, radial: 7 });
    mesh(root, clay('#7a5440'), g);
  }
  // moss cap on one side
  for (let i = 0; i < 7; i++) {
    const a = rand(2.2, 3.6);
    mesh(sphereGeo(rand(0.05, 0.09), 10), clay(pick(['#8ea25a', '#a3b56c', '#7d954e'])), g, [Math.cos(a) * 0.44, 0.58 + rand(-0.05, 0.02), Math.sin(a) * 0.44], null, [1, 0.6, 1]);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Bunting garland. Flags are live so they can flutter.
// ---------------------------------------------------------------------------
export function bunting(A, B, sag, n, colors) {
  const group = new THREE.Group();
  const P = (s) => new THREE.Vector3().lerpVectors(A, B, s).add(new THREE.Vector3(0, -sag * 4 * s * (1 - s), 0));
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(P(i / 40));
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.014, 5), clay('#e9d6bf'), group);
  const flags = [];
  const shape = new THREE.Shape();
  const w = 0.3, h = 0.38;
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, -h); shape.lineTo(-w / 2, 0);
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2 });
  fg.translate(0, -0.012, -0.009);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.7) / (n + 0.4);
    const p = P(s);
    const tan = P(Math.min(1, s + 0.01)).sub(P(Math.max(0, s - 0.01))).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3().crossVectors(tan, up).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, tan).normalize();
    const pivot = new THREE.Group();
    pivot.matrixAutoUpdate = true;
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, Y, Z));
    pivot.position.copy(p);
    pivot.userData.keep = true;
    group.add(pivot);
    const f = mesh(fg, clay(colors[i % colors.length]), pivot);
    f.scale.setScalar(rand(0.92, 1.05));
    flags.push({ obj: f, phase: rand(0, 6), amp: rand(0.1, 0.18), freq: rand(1.2, 1.8) });
  }
  return { group, flags };
}

export function beadStrand(A, B, sag, colors, spacing = 0.12, r = 0.05) {
  const group = new THREE.Group();
  const P = (s) => new THREE.Vector3().lerpVectors(A, B, s).add(new THREE.Vector3(0, -sag * 4 * s * (1 - s), 0));
  const len = A.distanceTo(B) * (1 + sag * 0.3);
  const n = Math.floor(len / spacing);
  const geo = sphereGeo(1, 8);
  const strandMat = (c) => clay(c, { kind: 'gloss', roughness: 0.45 });
  for (let i = 0; i <= n; i++) {
    const p = P(i / n);
    const big = i % 4 === 0;
    mesh(geo, strandMat(colors[i % colors.length]), group, [p.x, p.y, p.z], null, big ? r * 1.35 : r);
  }
  // little dangling drops
  for (let k = 1; k < 5; k++) {
    const p = P(k / 5);
    for (let j = 1; j <= 4; j++) mesh(geo, strandMat(colors[(k + j) % colors.length]), group, [p.x, p.y - j * spacing * 0.95, p.z], null, r * (j === 4 ? 1.3 : 0.9));
  }
  return group;
}

// ---------------------------------------------------------------------------
// Workbench clutter around the base: brushes, sculpting tools, yarn.
// ---------------------------------------------------------------------------
export function tableProps(group, y) {
  const brush = (x, z, rot, len, handle, tip) => {
    const g = new THREE.Group();
    g.position.set(x, y + 0.06, z);
    g.rotation.set(0, rot, Math.PI / 2);
    group.add(g);
    const prof = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.05 + 0.03 * Math.sin(t * Math.PI * 0.9) - t * 0.025, t * len)); }
    prof.unshift(new THREE.Vector2(0, 0));
    prof.push(new THREE.Vector2(0, len));
    mesh(soft(new THREE.LatheGeometry(prof, 14)), clay(handle), g);
    mesh(soft(new THREE.CylinderGeometry(0.052, 0.045, 0.3, 14)), clay('#c9c3ba', { roughness: 0.5 }), g, [0, -0.14, 0]);
    const bp = [[0, 0], [0.05, 0], [0.06, -0.12], [0.03, -0.3], [0, -0.36]].map((q) => new THREE.Vector2(q[0], q[1]));
    mesh(soft(new THREE.LatheGeometry(bp, 12)), clay(tip), g, [0, -0.28, 0]);
  };
  brush(-13.4, 5.2, 0.5, 3.6, '#c99a6b', '#5b4335');
  brush(-12.5, 7.0, 0.25, 3.2, '#e2b9a1', '#d8c2a8');
  brush(13.6, 6.4, -0.4, 3.4, '#b07a54', '#4e3a30');
  // sculpting tools
  const tool = (x, z, rot) => {
    const g = new THREE.Group();
    g.position.set(x, y + 0.06, z);
    g.rotation.set(0, rot, Math.PI / 2);
    group.add(g);
    mesh(soft(new THREE.CylinderGeometry(0.055, 0.055, 2.6, 12)), clay('#d6b48c'), g);
    mesh(sphereGeo(0.09, 12), clay('#bfbab3', { roughness: 0.45 }), g, [0, 1.35, 0]);
    mesh(soft(new THREE.ConeGeometry(0.06, 0.4, 10)), clay('#bfbab3', { roughness: 0.45 }), g, [0, -1.5, 0], [Math.PI, 0, 0]);
  };
  tool(11.5, 9.0, 0.9);
  tool(-10.8, -6.5, -0.3);
  // yarn ball
  const yarn = new THREE.Group();
  yarn.position.set(-14.5, y + 0.85, -2.5);
  group.add(yarn);
  mesh(sphereGeo(0.82, 22), clay('#a2ae7a'), yarn);
  for (let i = 0; i < 26; i++) {
    const t = mesh(new THREE.TorusGeometry(0.83, 0.035, 5, 48), clay(i % 2 ? '#a9b582' : '#97a46f'), yarn);
    t.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  }
  const strand = taperedTube([new THREE.Vector3(0.6, -0.5, 0.4), new THREE.Vector3(1.4, -0.82, 0.9), new THREE.Vector3(2.6, -0.84, 0.6), new THREE.Vector3(3.6, -0.84, 1.4)], () => 0.035, { segments: 40, radial: 5 });
  mesh(strand, clay('#a2ae7a'), yarn);
  // spools of clay
  for (const [x, z, c] of [[12.6, -6.5, '#f2b8b8'], [13.8, -5.4, '#f3dcc0'], [12.2, -4.8, '#b7c88f']]) {
    const sp = soft(new THREE.CylinderGeometry(0.42, 0.45, 0.42, 20));
    mesh(sp, clay(c), group, [x, y + 0.21, z]);
  }
}
