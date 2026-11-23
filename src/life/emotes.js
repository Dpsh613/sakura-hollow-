import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../core/noise.js';
import { glowMat } from '../core/materials.js';
import { sphereGeo, strip } from '../core/geo.js';

const ext = (shape, depth = 0.04) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 10 });
  g.center();
  return strip(g);
};

function heart() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.09);
  s.bezierCurveTo(-0.02, -0.05, -0.12, -0.02, -0.11, 0.04);
  s.bezierCurveTo(-0.1, 0.1, -0.03, 0.11, 0, 0.05);
  s.bezierCurveTo(0.03, 0.11, 0.1, 0.1, 0.11, 0.04);
  s.bezierCurveTo(0.12, -0.02, 0.02, -0.05, 0, -0.09);
  return ext(s);
}
function star(points = 5, r1 = 0.1, r2 = 0.045) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return ext(s, 0.03);
}
function note() {
  const head = new THREE.Shape(); head.absellipse(0, 0, 0.045, 0.034, 0, Math.PI * 2, false, 0.4);
  const stem = new THREE.Shape(); stem.moveTo(0.032, 0); stem.lineTo(0.05, 0); stem.lineTo(0.05, 0.16); stem.lineTo(0.032, 0.16);
  const flag = new THREE.Shape(); flag.moveTo(0.05, 0.16); flag.quadraticCurveTo(0.1, 0.12, 0.09, 0.07); flag.quadraticCurveTo(0.08, 0.11, 0.05, 0.12);
  const g = mergeGeometries([head, stem, flag].map((s) => strip(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false, curveSegments: 10 }))), false);
  g.center();
  return g;
}
function zed() {
  const s = new THREE.Shape();
  s.moveTo(-0.06, 0.06); s.lineTo(0.06, 0.06); s.lineTo(0.06, 0.035); s.lineTo(-0.02, -0.035); s.lineTo(0.06, -0.035); s.lineTo(0.06, -0.06);
  s.lineTo(-0.06, -0.06); s.lineTo(-0.06, -0.035); s.lineTo(0.02, 0.035); s.lineTo(-0.06, 0.035);
  return ext(s, 0.025);
}
function bang() {
  const bar = new THREE.Shape(); bar.moveTo(-0.022, -0.02); bar.lineTo(0.022, -0.02); bar.lineTo(0.032, 0.12); bar.lineTo(-0.032, 0.12);
  const dot = new THREE.Shape(); dot.absarc(0, -0.065, 0.025, 0, Math.PI * 2, false);
  const g = mergeGeometries([bar, dot].map((s) => strip(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 }))), false);
  g.center();
  return g;
}
function question() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, 0.06, 0), new THREE.Vector3(-0.02, 0.1, 0), new THREE.Vector3(0.04, 0.09, 0), new THREE.Vector3(0.05, 0.04, 0), new THREE.Vector3(0.0, 0.0, 0), new THREE.Vector3(0.0, -0.035, 0)]);
  const t = strip(new THREE.TubeGeometry(curve, 24, 0.018, 6, false));
  const d = strip(sphereGeo(0.024, 8)); d.translate(0, -0.08, 0);
  return mergeGeometries([t, d], false);
}
function drop() {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.05 * (1 - t * 0.4) + 0.0001, t * 0.13 - 0.06)); }
  return strip(new THREE.LatheGeometry(pts, 12));
}
function puff() {
  const parts = [[0, 0, 0.06], [0.06, 0.01, 0.045], [-0.06, 0.0, 0.045], [0.02, 0.05, 0.045]].map(([x, y, r]) => { const g = strip(sphereGeo(r, 8)); g.translate(x, y, 0); return g; });
  return mergeGeometries(parts, false);
}
function flake() {
  const parts = [];
  for (let i = 0; i < 3; i++) { const b = strip(new THREE.BoxGeometry(0.16, 0.022, 0.022)); b.rotateZ((i / 3) * Math.PI); parts.push(b); }
  return mergeGeometries(parts, false);
}

export function createEmotes(scene) {
  const defs = {
    heart: [heart(), glowMat('#ff5f86', '#ff3f6a', 0.55)],
    love: [heart(), glowMat('#ff8fb0', '#ff6a9a', 0.55)],
    star: [star(), glowMat('#ffd84a', '#ffb81a', 0.6)],
    sparkle: [star(4, 0.09, 0.025), glowMat('#fff6c8', '#ffe27a', 0.8)],
    note: [note(), glowMat('#8a6ae0', '#6a4ac0', 0.45)],
    z: [zed(), glowMat('#9ec8ff', '#6aa0ff', 0.5)],
    bang: [bang(), glowMat('#ff7a3a', '#ff5a1a', 0.6)],
    question: [question(), glowMat('#6ab0ff', '#3a8aff', 0.5)],
    drop: [drop(), glowMat('#8fd0ff', '#4ab0ff', 0.5)],
    puff: [puff(), glowMat('#9a9aa6', '#6a6a76', 0.25)],
    flake: [flake(), glowMat('#ffffff', '#cfe6ff', 0.6)],
  };
  const pool = [];
  const group = new THREE.Group();
  scene.add(group);
  return {
    spawn(type, pos, { delay = 0, drift = null, scale = 1 } = {}) {
      const d = defs[type];
      if (!d) return;
      let e = pool.find((p) => !p.active && p.type === type);
      if (!e) {
        const m = new THREE.Mesh(d[0], d[1]);
        m.castShadow = false;
        group.add(m);
        e = { m, type };
        pool.push(e);
      }
      e.active = true;
      e.t = -delay;
      e.life = type === 'z' ? 2.4 : 1.7;
      e.base = pos.clone();
      e.drift = drift || new THREE.Vector3(rand(-0.1, 0.1), 0.55, rand(-0.1, 0.1));
      e.scale = scale * (type === 'z' ? 0.9 : 1);
      e.ph = rand(0, 6);
      e.m.visible = false;
    },
    update(dt, camera) {
      for (const e of pool) {
        if (!e.active) continue;
        e.t += dt;
        if (e.t < 0) continue;
        const k = e.t / e.life;
        if (k >= 1) { e.active = false; e.m.visible = false; continue; }
        e.m.visible = true;
        const pop = k < 0.15 ? Math.sin((k / 0.15) * Math.PI * 0.75) * 1.25 : k > 0.8 ? (1 - k) / 0.2 : 1;
        e.m.scale.setScalar(Math.max(0.001, pop * e.scale));
        e.m.position.copy(e.base).addScaledVector(e.drift, k);
        e.m.position.x += Math.sin(e.t * 3 + e.ph) * 0.04;
        e.m.quaternion.copy(camera.quaternion);
        e.m.rotateZ(Math.sin(e.t * 2.5 + e.ph) * 0.2);
      }
    },
  };
}
