import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, randInt, lerp, pick } from '../core/noise.js';
import { clay, makeClay } from '../core/materials.js';
import { taperedTube, petalGeo, sphereGeo, colorize, soft, mesh } from '../core/geo.js';
import { pagodaBlocked } from './pagoda.js';
import { groundHeight } from './island.js';

const BARK = new THREE.Color('#6b432f'), BARK_D = new THREE.Color('#45281b'), BARK_L = new THREE.Color('#8f6448');
const TWIG = new THREE.Color('#7a4f3a');

function barkColor(base) {
  return (t, rv, c) => c.copy(base).lerp(rv < 0 ? BARK_D : BARK_L, Math.abs(rv) * 0.55);
}

/** A single 5-petal sakura blossom (facing +Y) with stamens. */
function blossomGeo() {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const p = petalGeo({ L: 0.14, W: 0.084, cup: 0.4, curl: 0.12, NU: 3, NV: 3, c1: '#e3567a', c2: '#fbbccc' });
    p.rotateX(-Math.PI / 2 + 0.42);
    p.translate(0, 0.006, -0.012);
    p.rotateY((k / 5) * Math.PI * 2 + 0.1);
    parts.push(p);
  }
  const center = colorize(soft(new THREE.SphereGeometry(0.024, 6, 4)), '#e27f97');
  center.scale(1, 0.6, 1);
  center.translate(0, 0.012, 0);
  parts.push(center);
  // stamen crown: a flared open cone, pale at the base and golden at the rim
  const crown = new THREE.CylinderGeometry(0.036, 0.01, 0.045, 7, 1, true);
  crown.translate(0, 0.035, 0);
  colorize(crown, '#f6d3da', (x, y, z, c) => { if (y > 0.04) c.set('#f0c063'); });
  parts.push(crown);
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); }
  return mergeGeometries(parts.map((g) => (g.index ? g : g)), false);
}

function budGeo() {
  const b = soft(new THREE.SphereGeometry(1, 7, 5));
  const p = b.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const s = 1 - 0.35 * Math.max(0, y);
    p.setXYZ(i, p.getX(i) * 0.034 * s, y * 0.05 + 0.04, p.getZ(i) * 0.034 * s);
  }
  b.computeVertexNormals();
  colorize(b, '#e5869c', (x, y, z, c) => { if (y < 0.012) c.set('#9c7a55'); else c.lerp(new THREE.Color('#f5b9c6'), y * 8); });
  return b;
}

export function buildTree() {
  const group = new THREE.Group();
  const barkMat = clay('#ffffff', { kind: 'bark' });
  const twigs = [];
  const spots = []; // blossom transforms
  const buds = [];

  const trunkPts = [
    [3.6, -0.25, -2.4], [3.62, 0.6, -2.62], [3.76, 1.45, -3.2], [3.96, 2.7, -4.42],
    [4.1, 4.2, -5.5], [3.9, 5.8, -5.62], [3.5, 7.35, -5.12], [3.22, 8.45, -4.72],
  ].map((p) => new THREE.Vector3(...p));
  const trunk = new THREE.CatmullRomCurve3(trunkPts, false, 'centripetal');
  const trunkR = (t) => lerp(0.64, 0.25, t) + 0.42 * Math.exp(-t * 16);
  mesh(taperedTube(trunk, trunkR, { segments: 90, radial: 18, ridge: 0.075, ridgeN: 7, twist: 11, bumpy: 0.09, color: barkColor(BARK), capStart: true }), barkMat, group);

  const trunkAtY = (y) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 200; i++) { const t = i / 200; const d = Math.abs(trunk.getPointAt(t).y - y); if (d < bd) { bd = d; best = t; } }
    return best;
  };

  const blocked = (p, margin = 0.32) =>
    pagodaBlocked(p.x, p.y, p.z, margin) || p.y < 1.4 || Math.hypot(p.x, p.z) > 11.2;

  const UPV = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  function addBranch(curve, r0, r1, depth, maxDepth) {
    const radial = depth === 0 ? 11 : depth === 1 ? 8 : depth === 2 ? 6 : 5;
    const len = curve.getLength();
    const seg = Math.max(5, Math.min(40, Math.round(len * (depth < 2 ? 9 : 7))));
    const rf = (t) => lerp(r0, r1, Math.pow(t, 0.85));
    mesh(taperedTube(curve, rf, {
      segments: seg, radial, ridge: depth < 2 ? 0.06 : 0.02, ridgeN: 5, twist: 6,
      bumpy: depth < 2 ? 0.06 : 0, color: barkColor(depth >= 2 ? TWIG : BARK),
    }), barkMat, group);
    if (depth >= maxDepth) { twigs.push(curve); return; }
    if (depth >= 2) twigs.push(curve); // older branches also carry some blossom
    const n = depth === 0 ? randInt(4, 6) : depth === 1 ? randInt(2, 4) : randInt(2, 3);
    for (let k = 0; k < n; k++) {
      const t = 0.22 + 0.74 * ((k + rand(0.15, 0.85)) / n);
      const P0 = curve.getPointAt(t);
      const T = curve.getTangentAt(t);
      const rp = rf(t);
      const childLen = len * (depth === 0 ? rand(0.42, 0.62) : rand(0.4, 0.62)) * (depth === 0 ? 1 : 1.05);
      const L = Math.max(0.35, Math.min(childLen, depth === 0 ? 3.2 : 1.8));
      for (let attempt = 0; attempt < 7; attempt++) {
        const rnd = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        const perp = rnd.addScaledVector(T, -rnd.dot(T)).normalize();
        const out = new THREE.Vector3(P0.x - 3.8, 0, P0.z + 4.6).normalize();
        let d = new THREE.Vector3().addScaledVector(T, 0.55).addScaledVector(perp, 0.8).addScaledVector(UPV, 0.32).addScaledVector(out, 0.3).normalize();
        const pts = [P0.clone().addScaledVector(d, -rp * 0.4)];
        let p = P0.clone();
        let ok = true;
        for (let s = 0; s < 3; s++) {
          d = d.clone().add(new THREE.Vector3(rand(-0.35, 0.35), rand(-0.25, 0.35), rand(-0.35, 0.35))).normalize();
          p = p.clone().addScaledVector(d, L / 3);
          pts.push(p);
          tmp.lerpVectors(pts[pts.length - 2], p, 0.5);
          if (blocked(p) || blocked(tmp)) { ok = false; break; }
        }
        if (!ok) continue;
        const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const cr0 = Math.min(rp * 0.66, r0 * 0.7);
        const last = depth + 1 >= maxDepth;
        addBranch(c, cr0, last ? 0.013 : cr0 * 0.42, depth + 1, maxDepth);
        break;
      }
    }
  }

  const LIMBS = [
    { y: 5.7, pts: [[2.4, 6.3, -5.0], [0.8, 6.75, -3.9], [-0.8, 7.2, -3.2], [-1.9, 7.75, -2.9]], r0: 0.3 },
    { y: 5.0, pts: [[5.6, 5.6, -5.0], [7.0, 6.0, -3.8], [8.0, 6.55, -2.4]], r0: 0.28 },
    { y: 8.2, pts: [[2.9, 8.9, -4.3], [2.2, 9.8, -3.3], [1.4, 10.4, -2.2]], r0: 0.2 },
    { y: 8.1, pts: [[4.5, 8.9, -4.4], [5.5, 9.6, -3.4], [6.3, 10.0, -2.3]], r0: 0.2 },
    { y: 3.3, pts: [[5.6, 3.5, -4.75], [6.9, 4.0, -3.6], [7.8, 4.6, -2.2]], r0: 0.22 },
    { y: 3.6, pts: [[2.4, 4.0, -5.6], [1.0, 4.6, -5.4], [0.0, 5.4, -4.8]], r0: 0.21 },
    { y: 6.5, pts: [[3.9, 7.0, -6.7], [4.2, 7.8, -7.4], [4.0, 8.6, -7.7]], r0: 0.2 },
    { y: 4.6, pts: [[5.6, 5.15, -4.5], [6.6, 5.3, -3.2], [7.3, 5.4, -1.5], [7.6, 5.8, -0.1]], r0: 0.2 },
  ];
  const limbCurves = [];
  for (const L of LIMBS) {
    const t = trunkAtY(L.y);
    const start = trunk.getPointAt(t);
    const pts = [start, ...L.pts.map((p) => new THREE.Vector3(...p))];
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    limbCurves.push(c);
    addBranch(c, L.r0, L.r0 * 0.38, 0, 3);
  }
  // crown continuation of the trunk
  addBranch(new THREE.CatmullRomCurve3([trunk.getPointAt(0.97), new THREE.Vector3(3.0, 9.4, -4.6), new THREE.Vector3(2.9, 10.4, -4.0)]), 0.2, 0.08, 1, 3);

  // roots
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.25, 0.25);
    if (Math.abs(a - 2.1) < 0.45) continue; // keep stair foot clear
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const base = new THREE.Vector3(3.6, 0, -2.4);
    const len = rand(1.4, 2.2);
    const pts = [0.3, 0.75, 1.2, len].map((s, j) => {
      const p = base.clone().addScaledVector(d, s);
      p.y = groundHeight(p.x, p.z) + [0.55, 0.22, 0.06, -0.08][j];
      return p;
    });
    mesh(taperedTube(pts, (t) => 0.3 * (1 - t * 0.82), { segments: 16, radial: 9, ridge: 0.05, ridgeN: 4, bumpy: 0.08, color: barkColor(BARK) }), barkMat, group);
  }
  // natural struts propping the deck
  for (const end of [[2.35, 2.43, -1.05], [4.9, 2.43, -1.0]]) {
    const pts = [trunk.getPointAt(0.12), new THREE.Vector3(lerp(3.7, end[0], 0.55), 1.75, -2.1), new THREE.Vector3(...end)];
    mesh(taperedTube(pts, (t) => 0.2 * (1 - t * 0.45), { segments: 18, radial: 9, ridge: 0.05, color: barkColor(BARK) }), barkMat, group);
  }
  // moss tufts on the root flare
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(0.55, 0.85);
    const x = 3.6 + Math.cos(a) * r, z = -2.4 + Math.sin(a) * r;
    mesh(sphereGeo(rand(0.06, 0.12), 10), clay(pick(['#8ea25a', '#a3b56c', '#7d954e'])), group, [x, groundHeight(x, z) + rand(0.1, 0.35), z], null, [1, 0.55, 1]);
  }

  // ---- blossoms -----------------------------------------------------------
  const Q = new THREE.Quaternion();
  for (const c of twigs) {
    const len = c.getLength();
    const stepLen = 0.32;
    const n = Math.max(2, Math.floor((len * 0.75) / stepLen));
    for (let i = 0; i < n; i++) {
      const t = 0.25 + 0.75 * (i / (n - 1 || 1));
      const P = c.getPointAt(t);
      const T = c.getTangentAt(t);
      const k = randInt(1, 3);
      for (let j = 0; j < k; j++) {
        const rnd = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize();
        const off = rnd.clone().addScaledVector(T, -rnd.dot(T)).normalize();
        const pos = P.clone().addScaledVector(off, rand(0.04, 0.12));
        if (pagodaBlocked(pos.x, pos.y, pos.z, 0.05)) continue;
        const nrm = off.clone().multiplyScalar(0.8).add(new THREE.Vector3(rand(-0.3, 0.3), 0.55, rand(-0.3, 0.3))).normalize();
        Q.setFromUnitVectors(UPV, nrm);
        const spin = new THREE.Quaternion().setFromAxisAngle(UPV, rand(0, Math.PI * 2));
        const s = rand(0.78, 1.25);
        spots.push(new THREE.Matrix4().compose(pos, Q.clone().multiply(spin), new THREE.Vector3(s, s, s)));
      }
      if (rand() < 0.3) {
        const rnd = new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize();
        const pos = P.clone().addScaledVector(rnd, 0.06);
        Q.setFromUnitVectors(UPV, rnd.add(UPV).normalize());
        buds.push(new THREE.Matrix4().compose(pos, Q.clone(), new THREE.Vector3(1, 1, 1).multiplyScalar(rand(0.8, 1.2))));
      }
    }
    // bud at the tip
    const tip = c.getPointAt(1);
    Q.setFromUnitVectors(UPV, c.getTangentAt(1));
    buds.push(new THREE.Matrix4().compose(tip, Q.clone(), new THREE.Vector3(1.1, 1.1, 1.1)));
  }

  // shuffle so a lower quality tier can draw a uniform subset
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const bMat = makeClay({ vertexColors: true, side: THREE.DoubleSide, wind: 'tree', bump: 0.008, roughness: 0.72, tint: 0.05, blossom: true, noSnow: true, rim: 1.4 });
  const blossoms = new THREE.InstancedMesh(blossomGeo(), bMat, spots.length);
  const tint = new THREE.Color();
  const blossomPoints = [];
  spots.forEach((m, i) => {
    blossoms.setMatrixAt(i, m);
    tint.setRGB(0.97, 0.95, 0.96).lerp(new THREE.Color(0.98, 0.8, 0.86), rand(0, 1) ** 1.2);
    if (rand() < 0.12) tint.setRGB(1, 0.96, 0.96);
    blossoms.setColorAt(i, tint);
    blossomPoints.push(new THREE.Vector3().setFromMatrixPosition(m));
  });
  blossoms.castShadow = true;
  blossoms.receiveShadow = true;
  blossoms.userData.pickable = true;
  blossoms.computeBoundingSphere();

  const budMat = makeClay({ vertexColors: true, wind: 'tree', bump: 0.01, roughness: 0.7, blossom: true, noSnow: true });
  const budMesh = new THREE.InstancedMesh(budGeo(), budMat, buds.length);
  buds.forEach((m, i) => budMesh.setMatrixAt(i, m));
  budMesh.castShadow = false;
  budMesh.computeBoundingSphere();

  const at = (ci, t) => { const p = limbCurves[ci].getPointAt(t); p.y -= 0.06; return p; };
  const raw = (ci, t) => limbCurves[ci].getPointAt(t);
  const anchors = {
    swing: raw(1, 0.56),
    owlPerch: raw(0, 0.3).add(new THREE.Vector3(0, 0.22, 0)),
    perches: [raw(5, 0.8).add(new THREE.Vector3(0, 0.1, 0)), raw(7, 0.75).add(new THREE.Vector3(0, 0.08, 0)), raw(4, 0.7).add(new THREE.Vector3(0, 0.08, 0))],
    lanterns: [at(0, 0.42), at(1, 0.3), at(7, 0.62), at(5, 0.7), at(0, 0.78)],
    bunting: at(0, 0.55).add(new THREE.Vector3(0, 0.08, 0)),
  };

  return { group, blossoms, buds: budMesh, blossomPoints, anchors, counts: { blossoms: spots.length, buds: buds.length, twigs: twigs.length } };
}
