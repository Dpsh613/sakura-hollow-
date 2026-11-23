import * as THREE from 'three';
import { rand } from '../core/noise.js';
import { clay, eyeMat, sparkleMat } from '../core/materials.js';
import { eggGeo, sphereGeo, mesh, taperedTube, jitter, colorize } from '../core/geo.js';

const Z = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (c) => clay(c, { noSnow: true, rim: 1.3 });

/** point + normal on an ellipsoid head */
function surf(r, yaw, pitch, inset = 0) {
  const p = V(r[0] * Math.sin(yaw) * Math.cos(pitch), r[1] * Math.sin(pitch), r[2] * Math.cos(yaw) * Math.cos(pitch));
  const n = V(p.x / r[0] ** 2, p.y / r[1] ** 2, p.z / r[2] ** 2).normalize();
  p.addScaledVector(n, -inset);
  return { p, n };
}

/** Eye with three expressions: open (with sparkles), happy ^ arc, closed u arc. */
function eye(parent, r, R, yaw, pitch) {
  const { p, n } = surf(R, yaw, pitch, r * 0.35);
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(Z, n);
  parent.add(g);
  const open = new THREE.Group();
  g.add(open);
  const e = mesh(sphereGeo(r, 16), eyeMat, open);
  e.scale.set(1, 1.12, 0.6);
  mesh(sphereGeo(r * 0.32, 8), sparkleMat, open, [r * 0.32, r * 0.42, r * 0.45]).castShadow = false;
  mesh(sphereGeo(r * 0.15, 6), sparkleMat, open, [-r * 0.3, -r * 0.35, r * 0.5]).castShadow = false;
  const arcGeo = new THREE.TorusGeometry(r * 0.8, r * 0.22, 6, 12, Math.PI);
  const happy = mesh(arcGeo, eyeMat, g, [0, -r * 0.2, r * 0.3]);
  const closed = mesh(arcGeo, eyeMat, g, [0, r * 0.25, r * 0.3], [0, 0, Math.PI]);
  happy.visible = closed.visible = false;
  return { g, open, happy, closed };
}

function patch(parent, R, yaw, pitch, r, col, flat = 0.35) {
  const { p, n } = surf(R, yaw, pitch, r * 0.2);
  const m = mesh(sphereGeo(1, 12), C(col), parent, p.toArray());
  m.quaternion.setFromUnitVectors(Z, n);
  m.scale.set(r, r * 0.8, r * flat);
  return m;
}

function mouthOn(parent, R, pitch, w = 0.05) {
  const { p, n } = surf(R, 0, pitch, 0.006);
  const m = mesh(sphereGeo(1, 10), C('#5a2326'), parent, p.toArray());
  m.quaternion.setFromUnitVectors(Z, n);
  m.scale.set(w, w * 0.25, w * 0.35);
  m.userData.base = m.scale.clone();
  return m;
}

function capsule(r, len, col) {
  return mesh(new THREE.CapsuleGeometry(r, len, 5, 12), C(col));
}

/** Arm: a shoulder pivot group with a hanging capsule (and optional paw tip). */
function arm(parent, x, y, z, r, len, col, tip) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const a = capsule(r, len, col);
  a.position.set(0, -len * 0.55, 0);
  g.add(a);
  if (tip) mesh(sphereGeo(r * 1.05, 10), C(tip), g, [0, -len - r * 0.6, 0]);
  return g;
}

function leg(parent, x, y, z, footR, col, footLen = 1.6, legLen = 0.1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  if (legLen > 0.02) mesh(new THREE.CapsuleGeometry(footR * 0.65, legLen, 4, 10), C(col), g, [0, -legLen * 0.5, 0]);
  const f = mesh(sphereGeo(footR, 12), C(col), g, [0, -y + footR * 0.55, footR * 0.45], null, [1, 0.6, footLen]);
  return g;
}

function skeleton(name) {
  const root = new THREE.Group();
  root.name = name;
  const body = new THREE.Group();
  root.add(body);
  const torso = new THREE.Group();
  body.add(torso);
  return { root, body, torso, eyes: [], ears: [], arms: [], legs: [], wings: [], cheeks: [], extras: {} };
}

// ---------------------------------------------------------------------------
export function rabbitRig({ fur = '#f7f0e7', inner = '#f1a9b0', cheek = '#f39aa2', belly = '#fffaf3', bow = null } = {}) {
  const r = skeleton('rabbit');
  r.torso.position.y = 0.24;
  mesh(eggGeo(0.37, 0.44, 0.35, 0.2), C(fur), r.torso, [0, 0.22, 0]);
  mesh(eggGeo(0.25, 0.29, 0.14, 0.1), C(belly), r.torso, [0, 0.18, 0.25]);
  mesh(sphereGeo(0.12, 12), C(belly), r.torso, [0, 0.02, -0.35]);
  r.head = new THREE.Group();
  r.head.position.set(0, 0.74, 0.03);
  r.torso.add(r.head);
  const HR = [0.36, 0.32, 0.33];
  mesh(sphereGeo(1, 28), C(fur), r.head, null, null, HR);
  for (const s of [-1, 1]) mesh(sphereGeo(0.085, 12), C(belly), r.head, [s * 0.065, -0.1, 0.27], null, [1, 0.85, 0.9]);
  r.extras.nose = mesh(sphereGeo(0.038, 10), C(inner), r.head, [0, -0.045, 0.318], null, [1.2, 0.85, 0.9]);
  r.cheeks.push(patch(r.head, HR, 0.85, -0.22, 0.07, cheek), patch(r.head, HR, -0.85, -0.22, 0.07, cheek));
  r.eyes.push(eye(r.head, 0.05, HR, 0.42, 0.1), eye(r.head, 0.05, HR, -0.42, 0.1));
  r.mouth = mouthOn(r.head, HR, -0.42, 0.045);
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.13, 0.24, -0.03);
    ear.rotation.set(-0.12, 0, -s * 0.16);
    r.head.add(ear);
    const e = capsule(0.088, 0.36, fur); e.position.set(0, 0.27, 0); e.scale.set(1, 1, 0.55); ear.add(e);
    const ei = capsule(0.052, 0.28, inner); ei.position.set(0, 0.27, 0.034); ei.scale.set(1, 1, 0.4); ear.add(ei);
    ear.userData.base = ear.rotation.clone();
    r.ears.push(ear);
  }
  if (bow) {
    mesh(sphereGeo(0.05, 8), C(bow), r.head, [0.16, 0.26, 0.05]);
    for (const s of [-1, 1]) mesh(sphereGeo(0.07, 8), C(bow), r.head, [0.16 + s * 0.07, 0.26, 0.05], [0, 0, s * 0.5], [1, 0.6, 0.5]);
  }
  for (const s of [-1, 1]) r.arms.push(arm(r.torso, s * 0.27, 0.36, 0.1, 0.065, 0.16, fur));
  for (const s of [-1, 1]) r.legs.push(leg(r.body, s * 0.16, 0.18, 0.04, 0.1, fur, 1.7, 0));
  r.tail = new THREE.Group(); r.tail.position.set(0, 0.03, -0.38); r.torso.add(r.tail);
  r.hand = new THREE.Group(); r.hand.position.set(0, 0.24, 0.44); r.torso.add(r.hand);
  r.params = { gait: 'hop', stepLen: 0.42, walk: 0.85, run: 1.9, height: 1.35, armRest: [-0.35, 0.22], sitDrop: 0.12, voice: 'rabbit' };
  return r;
}

export function foxRig() {
  const O = '#e8833f', CR = '#fdf0e0', DK = '#4a2f24';
  const r = skeleton('fox');
  r.torso.position.y = 0.22;
  mesh(eggGeo(0.33, 0.44, 0.33, 0.22), C(O), r.torso, [0, 0.22, 0]);
  mesh(eggGeo(0.21, 0.29, 0.13, 0.1), C(CR), r.torso, [0, 0.27, 0.23]);
  r.head = new THREE.Group();
  r.head.position.set(0, 0.73, 0.04);
  r.torso.add(r.head);
  const HR = [0.34, 0.29, 0.3];
  mesh(sphereGeo(1, 28), C(O), r.head, null, null, HR);
  for (const s of [-1, 1]) mesh(sphereGeo(0.14, 14), C(CR), r.head, [s * 0.18, -0.11, 0.13], null, [1, 0.75, 0.9]);
  const snout = new THREE.Group();
  snout.position.set(0, -0.07, 0.22);
  r.head.add(snout);
  mesh(sphereGeo(1, 16), C(CR), snout, [0, 0, 0.05], null, [0.13, 0.105, 0.17]);
  r.extras.nose = mesh(sphereGeo(0.04, 10), eyeMat, snout, [0, 0.025, 0.215], null, [1.15, 0.85, 0.9]);
  r.eyes.push(eye(r.head, 0.048, HR, 0.4, 0.12), eye(r.head, 0.048, HR, -0.4, 0.12));
  r.cheeks.push(patch(r.head, HR, 0.75, -0.08, 0.055, '#f2846c'), patch(r.head, HR, -0.75, -0.08, 0.055, '#f2846c'));
  r.mouth = mouthOn(snout, [0.13, 0.105, 0.22], -0.55, 0.04);
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.17, 0.2, -0.02);
    ear.rotation.set(-0.08, 0, -s * 0.32);
    r.head.add(ear);
    mesh(new THREE.ConeGeometry(0.13, 0.3, 12), C(O), ear, [0, 0.14, 0], null, [1, 1, 0.55]);
    mesh(new THREE.ConeGeometry(0.075, 0.2, 10), C(DK), ear, [0, 0.11, 0.035], null, [1, 1, 0.4]);
    ear.userData.base = ear.rotation.clone();
    r.ears.push(ear);
  }
  // little green scarf - Hazel's signature
  const scarf = new THREE.TorusGeometry(0.2, 0.05, 8, 18);
  scarf.rotateX(Math.PI / 2);
  mesh(scarf, C('#3f8a6a'), r.torso, [0, 0.58, 0.02], null, [1, 1, 0.95]);
  mesh(new THREE.CapsuleGeometry(0.045, 0.14, 4, 8), C('#3f8a6a'), r.torso, [0.1, 0.48, 0.2], [0.3, 0, 0.2]);
  for (const s of [-1, 1]) r.arms.push(arm(r.torso, s * 0.24, 0.36, 0.08, 0.06, 0.15, O, DK));
  for (const s of [-1, 1]) r.legs.push(leg(r.body, s * 0.14, 0.17, 0.02, 0.085, DK, 1.6, 0.06));
  r.tail = new THREE.Group();
  r.tail.position.set(0, 0.04, -0.28);
  r.torso.add(r.tail);
  const tailPts = [[0, 0, 0], [0.22, -0.08, -0.22], [0.42, -0.06, -0.3], [0.6, 0.08, -0.22], [0.66, 0.26, -0.02]].map((p) => V(...p));
  const tg = taperedTube(tailPts, (t) => 0.06 + 0.13 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.8), {
    segments: 30, radial: 12, bumpy: 0.06,
    color: (t, rv, c) => c.set(t > 0.8 ? CR : O).lerp(new THREE.Color(CR), t > 0.74 && t <= 0.8 ? (t - 0.74) / 0.06 : 0),
  });
  mesh(tg, clay('#ffffff', { vertexColors: true, noSnow: true, rim: 1.3 }), r.tail);
  r.hand = new THREE.Group(); r.hand.position.set(0, 0.24, 0.4); r.torso.add(r.hand);
  r.params = { gait: 'walk', stepLen: 0.32, walk: 0.95, run: 2.3, height: 1.3, armRest: [-0.3, 0.2], sitDrop: 0.12, voice: 'fox', tailWag: 0.25 };
  return r;
}

export function owlRig() {
  const BR = '#9a6a48', BL = '#f0d9b8', DK = '#6e4a34', BK = '#e8a24a', TN = '#cfa47a';
  const r = skeleton('owl');
  r.torso.position.y = 0.06;
  mesh(eggGeo(0.42, 0.5, 0.4, 0.12), C(BR), r.torso, [0, 0.44, 0]);
  mesh(eggGeo(0.3, 0.36, 0.18, 0.08), C(BL), r.torso, [0, 0.39, 0.25]);
  for (let row = 0; row < 3; row++) {
    const n = row === 2 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.12, y = 0.52 - row * 0.12;
      const zz = 0.25 + 0.17 * Math.sqrt(Math.max(0, 1 - (x / 0.3) ** 2 - ((y - 0.39) / 0.36) ** 2));
      mesh(sphereGeo(1, 8), C(TN), r.torso, [x, y, zz + 0.005], [-0.15, 0, 0], [0.045, 0.03, 0.015]);
    }
  }
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.36, 0.66, -0.02);
    r.torso.add(w);
    mesh(eggGeo(0.12, 0.33, 0.27, -0.15), C(DK), w, [s * 0.02, -0.2, 0], [0, 0, s * 0.12]);
    r.wings.push(w);
  }
  r.arms = r.wings;
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.14, 0.06, 0.18); r.body.add(lg);
    for (let k = -1; k <= 1; k++) mesh(sphereGeo(0.04, 8), C(BK), lg, [k * 0.045, -0.03, k === 0 ? 0.05 : 0.02], null, [1, 0.6, 1.4]);
    r.legs.push(lg);
  }
  r.head = new THREE.Group();
  r.head.position.set(0, 0.97, 0);
  r.torso.add(r.head);
  const HR = [0.42, 0.35, 0.38];
  mesh(sphereGeo(1, 28), C(BR), r.head, null, null, HR);
  patch(r.head, HR, 0.36, 0.02, 0.17, BL, 0.3);
  patch(r.head, HR, -0.36, 0.02, 0.17, BL, 0.3);
  r.eyes.push(eye(r.head, 0.075, HR, 0.36, 0.04), eye(r.head, 0.075, HR, -0.36, 0.04));
  for (const e of r.eyes) e.g.position.multiplyScalar(1.03);
  mesh(new THREE.ConeGeometry(0.05, 0.12, 10), C(BK), r.head, [0, -0.07, 0.385], [Math.PI + 0.5, 0, 0], [1, 1, 0.8]);
  r.mouth = mouthOn(r.head, HR, -0.36, 0.04);
  for (const s of [-1, 1]) {
    const tuft = new THREE.Group(); tuft.position.set(s * 0.25, 0.28, 0.02); tuft.rotation.z = -s * 0.5; r.head.add(tuft);
    mesh(new THREE.ConeGeometry(0.07, 0.17, 10), C(DK), tuft, [0, 0.05, 0], null, [1, 1, 0.6]);
    tuft.userData.base = tuft.rotation.clone();
    r.ears.push(tuft);
  }
  // round spectacles - he is a professor after all
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 18), C('#c9a24a'), r.head, [s * 0.15, 0.03, 0.37], [0, s * 0.35, 0]);
  r.cheeks.push(patch(r.head, HR, 0.7, -0.2, 0.05, '#e88f7a'), patch(r.head, HR, -0.7, -0.2, 0.05, '#e88f7a'));
  r.hand = new THREE.Group(); r.hand.position.set(0, 0.35, 0.42); r.torso.add(r.hand);
  r.params = { gait: 'waddle', stepLen: 0.18, walk: 0.55, run: 1.0, height: 1.4, armRest: [0, 0], sitDrop: 0.04, voice: 'owl', headRange: 2.6, flies: true };
  return r;
}

export function pigletRig({ skin = '#f3aaa3', dark = '#e08b86', scarf = null } = {}) {
  const r = skeleton('piglet');
  r.torso.position.y = 0.1;
  mesh(sphereGeo(1, 24), C(skin), r.torso, [0, 0.2, 0], null, [0.3, 0.26, 0.38]);
  for (const sx of [-1, 1]) for (const sz of [1, -1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.15, 0.17, sz * 0.2); r.body.add(lg);
    mesh(jitter(new THREE.CylinderGeometry(0.06, 0.055, 0.14, 10), 0.004, 4), C(skin), lg, [0, -0.09, 0]);
    mesh(new THREE.CylinderGeometry(0.057, 0.06, 0.035, 10), C('#b97570'), lg, [0, -0.155, 0]);
    r.legs.push(lg);
  }
  r.head = new THREE.Group();
  r.head.position.set(0, 0.32, 0.33);
  r.torso.add(r.head);
  const HR = [0.24, 0.22, 0.22];
  mesh(sphereGeo(1, 22), C(skin), r.head, null, null, HR);
  const snout = new THREE.Group(); snout.position.set(0, -0.04, 0.2); r.head.add(snout);
  mesh(new THREE.CylinderGeometry(0.1, 0.105, 0.09, 16), C('#ef9c98'), snout, null, [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) mesh(sphereGeo(0.022, 8), C('#a8605d'), snout, [s * 0.035, 0, 0.045], null, [0.8, 1.2, 0.5]);
  r.extras.nose = snout;
  r.eyes.push(eye(r.head, 0.034, HR, 0.45, 0.2), eye(r.head, 0.034, HR, -0.45, 0.2));
  r.cheeks.push(patch(r.head, HR, 0.8, -0.15, 0.05, '#ef7f86'), patch(r.head, HR, -0.8, -0.15, 0.05, '#ef7f86'));
  r.mouth = mouthOn(r.head, HR, -0.55, 0.05);
  r.mouth.position.z += 0.02;
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.13, 0.15, 0.0); ear.rotation.set(0.5, 0, -s * 0.45); r.head.add(ear);
    mesh(new THREE.ConeGeometry(0.075, 0.15, 10), C(dark), ear, [0, 0.06, 0], null, [1, 1, 0.45]);
    ear.userData.base = ear.rotation.clone();
    r.ears.push(ear);
  }
  if (scarf) {
    const sc = new THREE.TorusGeometry(0.2, 0.04, 6, 16);
    mesh(sc, C(scarf), r.torso, [0, 0.27, 0.22], [0.2, 0, 0], [1, 0.95, 1]);
  }
  r.tail = new THREE.Group(); r.tail.position.set(0, 0.26, -0.37); r.torso.add(r.tail);
  const tp = [];
  for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 5; tp.push(V(Math.cos(a) * 0.035, Math.sin(a) * 0.035 + i * 0.002, -i * 0.006)); }
  mesh(taperedTube(tp, (t) => 0.016 * (1 - t * 0.4), { segments: 32, radial: 5, capStart: true }), C(skin), r.tail);
  r.hand = new THREE.Group(); r.hand.position.set(0, -0.08, 0.3); r.head.add(r.hand);
  r.params = { gait: 'trot', stepLen: 0.22, walk: 0.8, run: 1.9, height: 0.75, armRest: [0, 0], sitDrop: 0.08, voice: 'piglet', quad: true };
  return r;
}

export function mouseRig() {
  const G = '#d9a7a8', BL = '#fbe6e2', IN = '#e8849a';
  const r = skeleton('mouse');
  r.torso.position.y = 0.12;
  mesh(eggGeo(0.24, 0.3, 0.24, 0.22), C(G), r.torso, [0, 0.18, 0]);
  mesh(eggGeo(0.16, 0.2, 0.1, 0.1), C(BL), r.torso, [0, 0.17, 0.17]);
  r.head = new THREE.Group();
  r.head.position.set(0, 0.52, 0.04);
  r.torso.add(r.head);
  const HR = [0.21, 0.19, 0.2];
  mesh(sphereGeo(1, 22), C(G), r.head, null, null, HR);
  mesh(sphereGeo(1, 12), C(BL), r.head, [0, -0.06, 0.14], null, [0.1, 0.075, 0.1]);
  r.extras.nose = mesh(sphereGeo(0.028, 10), C(IN), r.head, [0, -0.04, 0.235]);
  r.eyes.push(eye(r.head, 0.036, HR, 0.38, 0.12), eye(r.head, 0.036, HR, -0.38, 0.12));
  r.cheeks.push(patch(r.head, HR, 0.8, -0.2, 0.045, '#f28a96'), patch(r.head, HR, -0.8, -0.2, 0.045, '#f28a96'));
  r.mouth = mouthOn(r.head, HR, -0.55, 0.03);
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.16, 0.14, -0.03); ear.rotation.set(0, 0, -s * 0.35); r.head.add(ear);
    mesh(sphereGeo(1, 14), C(G), ear, [0, 0.07, 0], null, [0.13, 0.13, 0.04]);
    mesh(sphereGeo(1, 12), C(IN), ear, [0, 0.07, 0.02], null, [0.09, 0.09, 0.025]);
    ear.userData.base = ear.rotation.clone();
    r.ears.push(ear);
  }
  const wh = new THREE.Group(); wh.position.set(0, -0.06, 0.19); r.head.add(wh);
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
    const w = mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.15, 3), C('#fff4ee'), wh, [s * 0.1, k * 0.015, 0], [0, 0, Math.PI / 2 + k * 0.15 * s]);
    w.castShadow = false;
  }
  r.extras.whiskers = wh;
  // tiny acorn-cap hat
  mesh(sphereGeo(0.1, 12), C('#6e4a2c'), r.head, [0.02, 0.17, 0], [0, 0, 0.2], [1, 0.45, 1]);
  mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.05, 5), C('#5a3a24'), r.head, [0.03, 0.23, 0], [0, 0, 0.2]);
  for (const s of [-1, 1]) r.arms.push(arm(r.torso, s * 0.18, 0.27, 0.08, 0.042, 0.1, G));
  for (const s of [-1, 1]) r.legs.push(leg(r.body, s * 0.11, 0.1, 0.03, 0.07, G, 1.6, 0));
  r.tail = new THREE.Group(); r.tail.position.set(0, -0.02, -0.22); r.torso.add(r.tail);
  mesh(taperedTube([V(0, 0, 0), V(0.1, -0.06, -0.22), V(0.32, -0.08, -0.32), V(0.5, -0.06, -0.24), V(0.58, 0.02, -0.1)], (t) => 0.022 * (1 - t * 0.7), { segments: 26, radial: 5, capStart: true }), C(IN), r.tail);
  r.hand = new THREE.Group(); r.hand.position.set(0, 0.16, 0.28); r.torso.add(r.hand);
  r.params = { gait: 'scurry', stepLen: 0.14, walk: 0.9, run: 2.1, height: 0.85, armRest: [-0.5, 0.25], sitDrop: 0.07, voice: 'mouse' };
  return r;
}

export function birdRig() {
  const BR = '#3f7fc4', BL = '#f6e4c8', DK = '#2c5f9a', RED = '#e8603c';
  const r = skeleton('bird');
  r.torso.position.y = 0.06;
  mesh(eggGeo(0.17, 0.16, 0.2, 0.05), C(BR), r.torso, [0, 0.1, 0]);
  mesh(sphereGeo(1, 12), C(RED), r.torso, [0, 0.08, 0.08], null, [0.12, 0.11, 0.12]);
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.14, 0.14, -0.02); r.torso.add(w);
    mesh(eggGeo(0.05, 0.1, 0.15, 0), C(DK), w, [0, -0.04, -0.03], [0.4, 0, 0]);
    r.wings.push(w);
  }
  r.arms = r.wings;
  r.tail = new THREE.Group(); r.tail.position.set(0, 0.14, -0.2); r.torso.add(r.tail);
  mesh(eggGeo(0.08, 0.025, 0.14, 0), C(DK), r.tail, [0, 0, -0.04], [-0.5, 0, 0]);
  for (const s of [-1, 1]) { const lg = new THREE.Group(); lg.position.set(s * 0.05, 0.06, 0.02); r.body.add(lg); mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), C('#d8954f'), lg, [0, -0.03, 0]); r.legs.push(lg); }
  r.head = new THREE.Group(); r.head.position.set(0, 0.25, 0.08); r.torso.add(r.head);
  const HR = [0.12, 0.115, 0.12];
  mesh(sphereGeo(1, 18), C(BR), r.head, null, null, HR);
  mesh(new THREE.ConeGeometry(0.028, 0.08, 8), C('#f0b04a'), r.head, [0, -0.01, 0.15], [Math.PI / 2, 0, 0]);
  r.eyes.push(eye(r.head, 0.024, HR, 0.6, 0.15), eye(r.head, 0.024, HR, -0.6, 0.15));
  r.cheeks.push(patch(r.head, HR, 0.95, -0.25, 0.03, '#f0a59b'), patch(r.head, HR, -0.95, -0.25, 0.03, '#f0a59b'));
  r.mouth = mouthOn(r.head, HR, -0.5, 0.015);
  r.mouth.visible = false;
  r.hand = new THREE.Group(); r.hand.position.set(0, -0.02, 0.18); r.head.add(r.hand);
  r.params = { gait: 'birdhop', stepLen: 0.12, walk: 0.7, run: 1.4, height: 0.4, armRest: [0, 0], sitDrop: 0.02, voice: 'bird', flies: true, headRange: 2.2 };
  return r;
}

export function frogRig() {
  const G = '#5fae4a', L = '#c8e38a', DK = '#3f7a32';
  const r = skeleton('frog');
  r.torso.position.y = 0.05;
  mesh(sphereGeo(1, 22), C(G), r.torso, [0, 0.16, 0], null, [0.28, 0.2, 0.26]);
  mesh(sphereGeo(1, 16), C(L), r.torso, [0, 0.12, 0.1], null, [0.22, 0.14, 0.18]);
  r.head = new THREE.Group(); r.head.position.set(0, 0.26, 0.08); r.torso.add(r.head);
  const HR = [0.26, 0.15, 0.2];
  mesh(sphereGeo(1, 22), C(G), r.head, null, null, HR);
  for (const s of [-1, 1]) {
    const bump = new THREE.Group(); bump.position.set(s * 0.13, 0.12, 0.02); r.head.add(bump);
    mesh(sphereGeo(0.085, 14), C(G), bump);
    const e = eye(bump, 0.055, [0.085, 0.085, 0.085], 0.0, 0.25);
    r.eyes.push(e);
  }
  r.cheeks.push(patch(r.head, HR, 0.9, -0.2, 0.045, '#f29a8a'), patch(r.head, HR, -0.9, -0.2, 0.045, '#f29a8a'));
  r.mouth = mouthOn(r.head, HR, -0.35, 0.12);
  r.extras.throat = mesh(sphereGeo(0.1, 12), C(L), r.head, [0, -0.12, 0.06], null, [1, 0.6, 0.9]);
  // a tiny crown of a lily-pad leaf
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12, 1, false, 0.4, 5.6), C('#3f8a3a'), r.head, [0.05, 0.16, -0.04], [0.2, 0, 0.15]);
  for (const s of [-1, 1]) r.arms.push(arm(r.torso, s * 0.2, 0.14, 0.15, 0.04, 0.1, G, L));
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.22, 0.1, -0.08); r.body.add(lg);
    mesh(sphereGeo(1, 12), C(DK), lg, [s * 0.04, 0, 0], null, [0.1, 0.08, 0.16]);
    mesh(sphereGeo(1, 10), C(L), lg, [s * 0.06, -0.08, 0.1], null, [0.06, 0.03, 0.09]);
    r.legs.push(lg);
  }
  r.hand = new THREE.Group(); r.hand.position.set(0, 0.1, 0.3); r.torso.add(r.hand);
  r.params = { gait: 'hop', stepLen: 0.5, walk: 0.9, run: 1.6, height: 0.5, armRest: [-0.6, 0.1], sitDrop: 0.0, voice: 'frog', hopHeight: 0.3 };
  return r;
}

export function hedgehogRig() {
  const B = '#9a7a5a', SP = '#6a4a34', F = '#f0d9b8';
  const r = skeleton('hedgehog');
  r.torso.position.y = 0.08;
  mesh(sphereGeo(1, 20), C(B), r.torso, [0, 0.17, 0], null, [0.26, 0.2, 0.3]);
  const spineGeo = new THREE.ConeGeometry(0.035, 0.14, 5);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 90; i++) {
    const y = 1 - (i / 89) * 1.2;
    if (y < -0.15) continue;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const n = V(Math.cos(golden * i) * rr, y, Math.sin(golden * i) * rr);
    if (n.z > 0.55) continue;
    const m = new THREE.Mesh(spineGeo, C(i % 3 ? SP : '#8a6a4a'));
    m.position.set(n.x * 0.26, 0.17 + n.y * 0.2, n.z * 0.3).addScaledVector(n, 0.03);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), V(n.x, n.y, n.z - 0.4).normalize());
    m.castShadow = true;
    r.torso.add(m);
  }
  r.head = new THREE.Group(); r.head.position.set(0, 0.16, 0.26); r.torso.add(r.head);
  const HR = [0.14, 0.13, 0.17];
  mesh(sphereGeo(1, 16), C(F), r.head, null, null, HR);
  mesh(sphereGeo(1, 12), C(F), r.head, [0, -0.02, 0.14], null, [0.06, 0.055, 0.09]);
  r.extras.nose = mesh(sphereGeo(0.028, 8), eyeMat, r.head, [0, -0.01, 0.23]);
  r.eyes.push(eye(r.head, 0.028, HR, 0.45, 0.25), eye(r.head, 0.028, HR, -0.45, 0.25));
  r.cheeks.push(patch(r.head, HR, 0.75, -0.1, 0.03, '#f29a8a'), patch(r.head, HR, -0.75, -0.1, 0.03, '#f29a8a'));
  r.mouth = mouthOn(r.head, HR, -0.4, 0.025);
  for (const s of [-1, 1]) { const ear = new THREE.Group(); ear.position.set(s * 0.09, 0.1, -0.02); r.head.add(ear); mesh(sphereGeo(0.035, 8), C(F), ear); ear.userData.base = ear.rotation.clone(); r.ears.push(ear); }
  for (const sx of [-1, 1]) for (const sz of [1, -1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.13, 0.09, sz * 0.15); r.body.add(lg);
    mesh(sphereGeo(0.045, 8), C('#7a5a40'), lg, [0, -0.05, 0.02], null, [1, 0.7, 1.3]);
    r.legs.push(lg);
  }
  r.hand = new THREE.Group(); r.hand.position.set(0, -0.06, 0.2); r.head.add(r.hand);
  r.params = { gait: 'scurry', stepLen: 0.1, walk: 0.55, run: 1.2, height: 0.45, armRest: [0, 0], sitDrop: 0.04, voice: 'hedgehog', quad: true };
  return r;
}
