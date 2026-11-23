import * as THREE from 'three';
import { smoothstep, rand, clamp } from '../core/noise.js';
import { clay, glowMat } from '../core/materials.js';
import { rbox, mesh, colorize, soft, jitter, basis, taperedTube, leafGeo, sphereGeo } from '../core/geo.js';
import { paperLantern, bell } from './props.js';

export const PAG = { x: 3.6, z: -2.4, deck: 2.6 };

// roof definitions (local y, eave half-size, top half-size, rise, corner upturn...)
const ROOFS = [
  { y: 4.2, e: 2.15, tp: 1.12, H: 0.95, up: 0.4, flare: 0.3, rows: 7, courses: 7 },
  { y: 6.12, e: 1.7, tp: 0.66, H: 0.8, up: 0.34, flare: 0.24, rows: 6, courses: 6 },
  { y: 7.66, e: 1.32, tp: 0.05, H: 1.18, up: 0.3, flare: 0.2, rows: 5, courses: 7, apex: true },
];

const WOOD = '#7a4a2e', WOOD_D = '#56301e', WOOD_L = '#a3693f', PLASTER = '#f0d6aa';
const TILE = '#c25e3a', TILE_UNDER = '#6a3a26', RIDGE = '#93432a';

const hash = (a, b, c) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };

/** Is a world point inside (or too near) the treehouse? Used by the tree generator and particles. */
export function pagodaBlocked(x, y, z, margin = 0.25) {
  const m = Math.max(Math.abs(x - PAG.x), Math.abs(z - PAG.z));
  const lx = x - PAG.x, lz = z - PAG.z;
  // staircase volume
  if (lx > -1.6 - margin && lx < -0.5 + margin && lz > 1.4 && lz < 4.7 + margin && y < 3.4) return true;
  if (y < 2.6) return m < 1.85 + margin;
  if (y < 4.75) return m < 2.5 + margin;
  if (y < 6.5) return m < 2.0 + margin;
  if (y < 7.95) return m < 1.62 + margin;
  if (y < 9.0) return m < 1.5 - (y - 7.95) * 1.05 + margin;
  if (y < 9.9) return m < 0.3 + margin;
  return false;
}

/** Highest roof / deck surface below a point (for resting petals). Returns -Infinity if none. */
export function pagodaSurfaceY(x, z) {
  const m = Math.max(Math.abs(x - PAG.x), Math.abs(z - PAG.z));
  let best = -Infinity;
  if (m < 1.7) best = PAG.deck;
  for (const R of ROOFS) {
    if (m <= R.e && m >= R.tp * 0.9) {
      const v = clamp((R.e - m) / (R.e - R.tp), 0, 1);
      best = Math.max(best, R.y + R.H * Math.pow(v, 1.6) + 0.06);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Curved Japanese roof: concave hip roof with upturned flaring corners, real
// geometric tile rows/courses, a thick underside, hip ridges, round tile ends
// along the eaves and exposed rafters.
// ---------------------------------------------------------------------------
function buildRoof(R, parts) {
  const { y, e, tp, H, up, flare, rows, courses, apex } = R;
  const thick = 0.11, tileH = 0.05, step = 0.035;
  const NU = rows * 2 * 3, NV = courses * 3;
  const prof = (v) => H * Math.pow(v, 1.6);
  const rad = (v) => e + (tp - e) * v;
  const cTile = new THREE.Color(TILE), cUnder = new THREE.Color(TILE_UNDER);
  const tmp = new THREE.Color();

  function P(u, v, mode, out = new THREE.Vector3()) {
    const r = rad(v), au = Math.abs(u);
    const f = flare * au ** 3 * (1 - v);
    let Y = prof(v) + up * au ** 3 * (1 - v) ** 2;
    if (mode === 'top') {
      const fadeT = apex ? 1 - smoothstep(0.7, 1, v) : 1;
      const rip = 0.5 - 0.5 * Math.cos(2 * Math.PI * u * rows);
      const c = (v * courses) % 1;
      Y += (tileH * (0.35 + 0.65 * rip) + step * (1 - c)) * fadeT;
    } else if (mode === 'under') Y -= thick;
    else if (mode === 'ridge') Y += tileH * 0.6 + step;
    return out.set(u * r + Math.sign(u) * f, Y + y, r + f);
  }

  const faceGeos = [];
  for (let face = 0; face < 4; face++) {
    const pos = [], cols = [], idx = [];
    const v3 = new THREE.Vector3();
    // top grid
    for (let iv = 0; iv <= NV; iv++) {
      const v = iv / NV;
      for (let iu = 0; iu <= NU; iu++) {
        const u = (iu / NU) * 2 - 1;
        P(u, v, 'top', v3);
        pos.push(v3.x, v3.y, v3.z);
        const rip = 0.5 - 0.5 * Math.cos(2 * Math.PI * u * rows);
        const j = hash(Math.floor((u + 1) * rows), Math.floor(v * courses), face);
        const c = (v * courses) % 1;
        tmp.copy(cTile).multiplyScalar((0.9 + 0.16 * j) * (0.84 + 0.16 * rip) * (0.92 + 0.08 * (1 - c)));
        cols.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const row = NU + 1;
    const topCount = (NV + 1) * row;
    for (let iv = 0; iv < NV; iv++)
      for (let iu = 0; iu < NU; iu++) {
        const a = iv * row + iu, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    // underside grid
    for (let iv = 0; iv <= NV; iv++) {
      const v = iv / NV;
      for (let iu = 0; iu <= NU; iu++) {
        const u = (iu / NU) * 2 - 1;
        P(u, v, 'under', v3);
        pos.push(v3.x, v3.y, v3.z);
        tmp.copy(cUnder).multiplyScalar(0.92 + 0.1 * hash(iu, iv, face + 9));
        cols.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let iv = 0; iv < NV; iv++)
      for (let iu = 0; iu < NU; iu++) {
        const a = topCount + iv * row + iu, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    // eave edge strip (connect top row 0 and underside row 0) - separate verts for crisp edge
    const stripStart = pos.length / 3;
    for (let iu = 0; iu <= NU; iu++) {
      const u = (iu / NU) * 2 - 1;
      P(u, 0, 'top', v3); pos.push(v3.x, v3.y, v3.z);
      P(u, 0, 'under', v3); pos.push(v3.x, v3.y, v3.z);
      tmp.copy(cTile).multiplyScalar(0.78); cols.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    }
    for (let iu = 0; iu < NU; iu++) {
      const T0 = stripStart + iu * 2, U0 = T0 + 1, T1 = T0 + 2, U1 = T0 + 3;
      idx.push(T0, U0, T1, T1, U0, U1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    faceGeos.push(g);

    // --- per-face details (built in front-face space then rotated) ---
    const rot = new THREE.Matrix4().makeRotationY((face * Math.PI) / 2);
    const add = (geo, col, m) => { colorize(geo, col); geo.applyMatrix4(m); geo.applyMatrix4(rot); parts.push(geo); };

    // hip ridge (u = +1 of this face)
    const ridgePts = [];
    for (let i = 0; i <= 14; i++) ridgePts.push(P(1, i / 14, 'ridge'));
    const ridgeGeo = taperedTube(ridgePts, (t) => 0.062 * (1 - 0.15 * t), { segments: 28, radial: 7, capStart: true });
    add(ridgeGeo, RIDGE, new THREE.Matrix4());
    // curled ornament at the corner tip
    const tip = P(1, 0, 'ridge');
    const curl = taperedTube(
      [tip.clone(), tip.clone().add(new THREE.Vector3(0.1, 0.1, 0.1)), tip.clone().add(new THREE.Vector3(0.13, 0.22, 0.13)), tip.clone().add(new THREE.Vector3(0.07, 0.27, 0.07))],
      (t) => 0.07 * (1 - t * 0.6), { segments: 12, radial: 7, capStart: true },
    );
    add(curl, RIDGE, new THREE.Matrix4());

    // round tile ends along the eave
    for (let k = -rows; k < rows; k++) {
      const u = (k + 0.5) / rows;
      const p = P(u, 0, 'top');
      const disc = soft(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 7, 1));
      disc.rotateX(Math.PI / 2);
      add(disc, '#a84a2c', new THREE.Matrix4().makeTranslation(p.x, p.y - 0.035, p.z + 0.01));
    }
    // exposed rafters underneath
    for (let k = 0; k < rows * 2; k++) {
      const u = -1 + (k + 0.5) / rows;
      if (Math.abs(u) > 0.93) continue;
      const a = P(u, 0.0, 'under'), b = P(u, 0.33, 'under');
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y -= 0.045;
      const dir = b.clone().sub(a);
      add(rbox(0.07, len, 0.075, 0.02), WOOD_D, basis(mid, dir, new THREE.Vector3(0, 1, 0)));
    }
  }
  for (let face = 0; face < 4; face++) faceGeos[face].applyMatrix4(new THREE.Matrix4().makeRotationY((face * Math.PI) / 2));
  parts.push(...faceGeos);

  return {
    corner: (sx, sz) => {
      // world-local position of the eave corner (sx,sz = ±1)
      const f = flare, r = e;
      return new THREE.Vector3(sx * (r + f), y + up, sz * (r + f));
    },
  };
}

// ---------------------------------------------------------------------------
function addWindow(g, { x, y, w, h, d, arch = true, round = false, glow, flowerBox = false }) {
  const shape = new THREE.Shape();
  if (round) {
    shape.absarc(0, h / 2, w / 2, 0, Math.PI * 2, false);
  } else if (arch) {
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h - w / 2);
    shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
  } else {
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.lineTo(-w / 2, 0);
  }
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(shape, 14), glow);
  pane.position.set(x, y, d + 0.004);
  pane.userData.keep = true;
  g.add(pane);
  // recessed dark reveal behind the frame
  const pts = shape.getSpacedPoints(56).slice(0, -1).map((p) => new THREE.Vector3(x + p.x, y + p.y, d + 0.03));
  const frame = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.034, 5, true);
  mesh(frame, clay(WOOD), g);
  // lattice
  const lw = 0.024;
  if (round) {
    mesh(rbox(lw, w * 0.95, lw, 0.01), clay(WOOD_D), g, [x, y + h / 2, d + 0.022]);
    mesh(rbox(w * 0.95, lw, lw, 0.01), clay(WOOD_D), g, [x, y + h / 2, d + 0.022]);
  } else {
    mesh(rbox(lw, h * 0.96, lw, 0.01), clay(WOOD_D), g, [x, y + h * 0.48, d + 0.022]);
    mesh(rbox(w * 0.96, lw, lw, 0.01), clay(WOOD_D), g, [x, y + (arch ? h * 0.42 : h * 0.5), d + 0.022]);
  }
  if (!round) mesh(rbox(w + 0.16, 0.05, 0.11, 0.02), clay(WOOD_L), g, [x, y - 0.035, d + 0.05]);
  if (flowerBox) {
    mesh(rbox(w + 0.08, 0.11, 0.14, 0.03), clay('#a7724f'), g, [x, y - 0.13, d + 0.1]);
    for (let i = 0; i < 9; i++) {
      const fx = x - w / 2 + (i + 0.5) * (w / 9) + rand(-0.02, 0.02);
      const c = ['#f2b3bd', '#f7d5d8', '#f4c08f', '#fff1e3'][i % 4];
      mesh(sphereGeo(0.038, 10), clay(c), g, [fx, y - 0.05 + rand(-0.01, 0.025), d + 0.12 + rand(-0.03, 0.03)]);
      if (i % 2 === 0) mesh(sphereGeo(0.03, 8), clay('#8ea65e'), g, [fx + 0.02, y - 0.08, d + 0.17], null, [1.2, 0.6, 1]);
    }
  }
}

function storey(group, { y0, h, top, half, windows, glow, door }) {
  const d = half - 0.06;
  // plaster core (rises into the roof so no gaps show under the eaves)
  mesh(jitter(rbox(2 * d, top - y0, 2 * d, 0.05, 2), 0.008, 3), clay(PLASTER, { bump: 0.02 }), group, [0, (y0 + top) / 2, 0]);
  // corner posts
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      mesh(rbox(0.17, top - y0 + 0.02, 0.17, 0.05), clay(WOOD), group, [sx * (half - 0.04), (y0 + top) / 2, sz * (half - 0.04)]);
  for (let s = 0; s < 4; s++) {
    const side = new THREE.Group();
    side.rotation.y = (s * Math.PI) / 2;
    group.add(side);
    // sill + beams
    mesh(rbox(2 * half - 0.05, 0.12, 0.1, 0.035), clay(WOOD_D), side, [0, y0 + 0.06, d + 0.02]);
    mesh(rbox(2 * half - 0.05, 0.12, 0.1, 0.035), clay(WOOD), side, [0, y0 + h - 0.02, d + 0.025]);
    if (h > 1.2) mesh(rbox(2 * half - 0.05, 0.06, 0.06, 0.02), clay(WOOD_L), side, [0, y0 + h * 0.86, d + 0.015]);
    const list = windows[s] || [];
    for (const wdef of list) addWindow(side, { d, glow, ...wdef });
    if (s === 0 && door) door(side, d);
  }
}

function buildDoor(side, d, glow) {
  const w = 0.56, h = 1.06;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - w / 2);
  shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); shape.lineTo(-w / 2, 0);
  const door = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 16 });
  mesh(door, clay('#9c6646'), side, [0, 2.6 + 0.12, d - 0.01]);
  for (const gx of [-0.13, 0, 0.13]) mesh(rbox(0.014, h * 0.7, 0.02, 0.006), clay(WOOD_D), side, [gx, 2.72 + h * 0.36, d + 0.06]);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), glow);
  win.position.set(0, 2.72 + h - 0.27, d + 0.068);
  win.userData.keep = true;
  side.add(win);
  mesh(new THREE.TorusGeometry(0.095, 0.022, 6, 22), clay(WOOD_D), side, [0, 2.72 + h - 0.27, d + 0.07]);
  mesh(sphereGeo(0.035, 10), clay('#d9b26e'), side, [0.19, 2.72 + 0.48, d + 0.085]);
  const pts = shape.getSpacedPoints(48).slice(0, -1).map((p) => new THREE.Vector3(p.x * 1.08, 2.7 + p.y * 1.04, d + 0.03));
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false), 36, 0.04, 5, false), clay(WOOD), side);
  // tiny doormat
  mesh(rbox(0.5, 0.025, 0.24, 0.012), clay('#d8a6a0'), side, [0, 2.61, d + 0.25]);
}

function railing(group, segs, y, height = 0.52, every = 0.4) {
  const post = rbox(0.075, height, 0.075, 0.025);
  for (const [a, b] of segs) {
    const A = new THREE.Vector3(a[0], y, a[1]), B = new THREE.Vector3(b[0], y, b[1]);
    const len = A.distanceTo(B);
    const n = Math.max(1, Math.round(len / every));
    for (let i = 0; i <= n; i++) {
      const p = A.clone().lerp(B, i / n);
      mesh(post, clay(WOOD), group, [p.x, y + height / 2, p.z]);
      mesh(sphereGeo(0.05, 8), clay(WOOD_L), group, [p.x, y + height + 0.03, p.z]);
    }
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const ang = Math.atan2(B.x - A.x, B.z - A.z);
    mesh(rbox(0.07, 0.06, len + 0.06, 0.025), clay(WOOD_L), group, [mid.x, y + height - 0.03, mid.z], [0, ang, 0]);
    mesh(rbox(0.04, 0.04, len, 0.015), clay(WOOD), group, [mid.x, y + height * 0.45, mid.z], [0, ang, 0]);
  }
}

function pottedPlant(group, x, y, z, flower = '#f2b3bd') {
  const prof = [[0, 0], [0.1, 0], [0.12, 0.02], [0.15, 0.2], [0.165, 0.22], [0.16, 0.25], [0.13, 0.24], [0, 0.22]].map((p) => new THREE.Vector2(p[0], p[1]));
  mesh(soft(new THREE.LatheGeometry(prof, 18)), clay('#c47a5a'), group, [x, y, z]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
    const lg = leafGeo({ length: rand(0.2, 0.28), width: 0.11, thick: 0.035, bend: 0.08, c1: '#7f9a52', c2: '#a9bd78', sway: 0.6 });
    const m = mesh(lg, clay('#ffffff'), group, [x, y + 0.22, z], [rand(-0.9, -0.5), a, 0]);
    m.rotation.order = 'YXZ';
  }
  for (let i = 0; i < 5; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.03, 0.1);
    mesh(sphereGeo(0.04, 10), clay(flower), group, [x + Math.cos(a) * r, y + rand(0.36, 0.44), z + Math.sin(a) * r]);
  }
}

// ---------------------------------------------------------------------------
export function buildPagoda() {
  const root = new THREE.Group();
  root.position.set(PAG.x, 0, PAG.z);
  const glow = glowMat('#ffd59a', '#ff9440', 1.0);
  const lanterns = [];
  const swingers = [];
  const lights = [];

  // ---- deck -------------------------------------------------------------
  const deck = new THREE.Group();
  root.add(deck);
  const DH = 1.7;
  for (let i = 0; i < 12; i++) {
    const z = -DH + (i + 0.5) * ((2 * DH) / 12);
    const len = 2 * DH + rand(-0.04, 0.06);
    const c = new THREE.Color(WOOD_L).multiplyScalar(rand(0.9, 1.06));
    mesh(rbox(len, 0.1, 0.27, 0.03), clay('#' + c.getHexString()), deck, [rand(-0.03, 0.03), PAG.deck - 0.05, z]);
  }
  for (const s of [-1, 1]) {
    mesh(rbox(2 * DH + 0.12, 0.16, 0.13, 0.04), clay(WOOD), deck, [0, PAG.deck - 0.16, s * (DH + 0.02)]);
    mesh(rbox(0.13, 0.16, 2 * DH + 0.12, 0.04), clay(WOOD), deck, [s * (DH + 0.02), PAG.deck - 0.16, 0]);
  }
  for (const x of [-1.1, 0, 1.1]) mesh(rbox(0.14, 0.14, 2 * DH, 0.04), clay(WOOD_D), deck, [x, PAG.deck - 0.24, 0]);
  // support posts at the front corners + braces
  for (const sx of [-1, 1]) {
    const px = sx * 1.52, pz = 1.5;
    mesh(jitter(rbox(0.17, PAG.deck - 0.2, 0.17, 0.05, 2), 0.01, 2), clay(WOOD_D), deck, [px, (PAG.deck - 0.2) / 2, pz]);
    mesh(rbox(0.26, 0.12, 0.26, 0.04), clay('#a69a8b'), deck, [px, 0.04, pz]);
    const a = new THREE.Vector3(px, 1.55, pz), b = new THREE.Vector3(px - sx * 0.7, PAG.deck - 0.25, pz);
    mesh(rbox(0.08, a.distanceTo(b), 0.08, 0.025), clay(WOOD), deck, null).applyMatrix4(basis(a.clone().add(b).multiplyScalar(0.5), b.clone().sub(a), new THREE.Vector3(0, 0, 1)));
    const c2 = new THREE.Vector3(px, PAG.deck - 0.25, pz - 0.7);
    mesh(rbox(0.08, a.distanceTo(c2), 0.08, 0.025), clay(WOOD), deck, null).applyMatrix4(basis(a.clone().add(c2).multiplyScalar(0.5), c2.clone().sub(a), new THREE.Vector3(1, 0, 0)));
  }
  // railing (opening for the stairs at front-left, gap where the trunk passes at the back)
  const RI = 1.62;
  railing(deck, [
    [[-0.56, RI], [RI, RI]],
    [[RI, RI], [RI, -RI]],
    [[RI, -RI], [0.98, -RI]],
    [[-0.28, -RI], [-RI, -RI]],
    [[-RI, -RI], [-RI, RI]],
  ], PAG.deck);

  // ---- storeys ------------------------------------------------------------
  storey(root, {
    y0: PAG.deck, h: 1.66, top: 4.98, half: 1.2, glow,
    windows: {
      0: [{ x: -0.74, y: 3.0, w: 0.36, h: 0.66, flowerBox: true }, { x: 0.74, y: 3.0, w: 0.36, h: 0.66, flowerBox: true }],
      1: [{ x: -0.45, y: 3.0, w: 0.34, h: 0.62 }, { x: 0.45, y: 3.0, w: 0.34, h: 0.62 }],
      2: [{ x: -0.45, y: 3.0, w: 0.34, h: 0.62 }, { x: 0.45, y: 3.0, w: 0.34, h: 0.62 }],
      3: [{ x: -0.45, y: 3.0, w: 0.34, h: 0.62 }, { x: 0.45, y: 3.0, w: 0.34, h: 0.62 }],
    },
    door: (side, d) => buildDoor(side, d, glow),
  });
  storey(root, {
    y0: 5.04, h: 1.14, top: 6.6, half: 0.9, glow,
    windows: {
      0: [{ x: -0.36, y: 5.32, w: 0.3, h: 0.46, arch: false }, { x: 0.36, y: 5.32, w: 0.3, h: 0.46, arch: false }],
      1: [{ x: 0, y: 5.32, w: 0.32, h: 0.48, arch: true }],
      2: [{ x: 0, y: 5.32, w: 0.32, h: 0.48, arch: true }],
      3: [{ x: 0, y: 5.32, w: 0.32, h: 0.48, arch: true }],
    },
  });
  storey(root, {
    y0: 6.82, h: 0.86, top: 8.22, half: 0.58, glow,
    windows: {
      0: [{ x: 0, y: 6.98, w: 0.34, h: 0.34, round: true }],
      1: [{ x: 0, y: 6.98, w: 0.3, h: 0.3, round: true }],
      2: [{ x: 0, y: 6.98, w: 0.3, h: 0.3, round: true }],
      3: [{ x: 0, y: 6.98, w: 0.3, h: 0.3, round: true }],
    },
  });
  // ledges closing the tops of roofs 1 and 2
  mesh(rbox(2.3, 0.1, 2.3, 0.04), clay(TILE_UNDER), root, [0, 5.1, 0]);
  mesh(rbox(1.42, 0.08, 1.42, 0.03), clay(TILE_UNDER), root, [0, 6.86, 0]);
  // little balcony rail on level 2
  railing(root, [[[-1.04, 1.04], [1.04, 1.04]], [[1.04, 1.04], [1.04, -1.04]], [[1.04, -1.04], [-1.04, -1.04]], [[-1.04, -1.04], [-1.04, 1.04]]], 5.14, 0.3, 0.35);

  // ---- roofs --------------------------------------------------------------
  const roofParts = [];
  const roofs = ROOFS.map((R) => buildRoof(R, roofParts));
  const white = clay('#ffffff');
  for (const g of roofParts) mesh(g, white, root);

  // finial (sorin)
  const fy = ROOFS[2].y + ROOFS[2].H;
  const bronze = clay('#9b7452', { roughness: 0.6 });
  mesh(soft(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 14)), bronze, root, [0, fy + 0.02, 0]);
  for (let i = 0; i < 5; i++) mesh(new THREE.TorusGeometry(0.075 - i * 0.006, 0.024, 8, 16), bronze, root, [0, fy + 0.14 + i * 0.08, 0], [Math.PI / 2, 0, 0]);
  mesh(sphereGeo(0.085, 14), bronze, root, [0, fy + 0.6, 0]);
  mesh(soft(new THREE.ConeGeometry(0.05, 0.3, 10)), bronze, root, [0, fy + 0.8, 0]);
  mesh(sphereGeo(0.045, 10), clay('#e8b75f'), root, [0, fy + 0.96, 0]);

  // ---- staircase ----------------------------------------------------------
  const st = new THREE.Group();
  root.add(st);
  const sx = -1.05, sw = 0.86, z0 = DH, run = 2.8 / 13, rise = 0.2;
  for (let i = 0; i < 12; i++) {
    const yTop = PAG.deck - (i + 1) * rise;
    const z = z0 + (i + 0.5) * run + run * 0.5;
    const c = new THREE.Color(WOOD_L).multiplyScalar(rand(0.9, 1.05));
    mesh(rbox(sw, 0.07, run + 0.05, 0.025), clay('#' + c.getHexString()), st, [sx + rand(-0.01, 0.01), yTop - 0.035, z]);
  }
  const SL = Math.hypot(2.8, 2.6), ang = Math.atan2(2.6, 2.8);
  for (const s of [-1, 1]) {
    mesh(rbox(0.07, 0.2, SL, 0.03), clay(WOOD), st, [sx + s * (sw / 2 + 0.03), 1.3 - 0.08, z0 + 1.4], [ang, 0, 0]);
    // railing
    for (const i of [0, 4, 8, 11]) {
      const yTop = PAG.deck - (i + 1) * rise;
      const z = z0 + (i + 1) * run;
      mesh(rbox(0.07, 0.62, 0.07, 0.025), clay(WOOD), st, [sx + s * (sw / 2 + 0.03), yTop + 0.31, z]);
    }
    mesh(rbox(0.065, 0.06, SL - 0.25, 0.025), clay(WOOD_L), st, [sx + s * (sw / 2 + 0.03), 1.3 + 0.52, z0 + 1.35], [ang, 0, 0]);
    mesh(sphereGeo(0.055, 10), clay(WOOD_L), st, [sx + s * (sw / 2 + 0.03), 0.2 + 0.66, z0 + 12 * run]);
  }
  mesh(jitter(new THREE.CylinderGeometry(0.5, 0.56, 0.1, 16), 0.03, 2), clay('#b9ad9d'), st, [sx, 0.02, z0 + 13 * run + 0.25], null, [1, 1, 0.75]);

  // ---- potted plants and pumpkins on the deck ------------------------------
  pottedPlant(deck, 1.3, PAG.deck, 1.3, '#f2b3bd');
  pottedPlant(deck, 1.32, PAG.deck, -1.25, '#fbe6cf');
  pottedPlant(deck, -1.3, PAG.deck, -1.28, '#f4c08f');

  // ---- lanterns -----------------------------------------------------------
  const r1 = roofs[0];
  for (const sxx of [-1, 1]) {
    const c = r1.corner(sxx, 1);
    c.x -= sxx * 0.14; c.z -= 0.14; c.y -= 0.06;
    const L = paperLantern({ color: sxx < 0 ? '#f6c9b2' : '#f4b8bd', size: 0.17, drop: 0.42 });
    L.group.position.copy(c);
    root.add(L.group);
    lanterns.push(L);
    swingers.push({ obj: L.group, amp: 0.05, freq: 1.1 + rand(0, 0.4), phase: rand(0, 6), wind: 0.06 });
  }
  // bells on roof2 corners + roof1 back corners
  const bellCorners = [];
  for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bellCorners.push(roofs[1].corner(sx2, sz2));
  bellCorners.push(r1.corner(-1, -1), r1.corner(1, -1));
  for (const c of bellCorners) {
    const s = Math.sign(c.x), t = Math.sign(c.z);
    c.x -= s * 0.12; c.z -= t * 0.12; c.y -= 0.04;
    const b = bell();
    b.position.copy(c);
    root.add(b);
    swingers.push({ obj: b, amp: 0.08, freq: 1.6 + rand(0, 0.6), phase: rand(0, 6), wind: 0.1 });
  }
  // post lantern at the stair foot
  mesh(jitter(rbox(0.11, 0.85, 0.11, 0.035), 0.008, 3), clay(WOOD_D), root, [-0.3, 0.42, 4.5]);
  mesh(rbox(0.3, 0.05, 0.3, 0.02), clay(WOOD), root, [-0.3, 0.87, 4.5]);
  const boxGlow = glowMat('#ffe3c2', '#ffa654', 1.8);
  const lb = new THREE.Mesh(rbox(0.2, 0.24, 0.2, 0.03), boxGlow);
  lb.position.set(-0.3, 1.02, 4.5);
  lb.userData.keep = true;
  root.add(lb);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(rbox(0.035, 0.26, 0.035, 0.012), clay(WOOD_D), root, [-0.3 + dx * 0.1, 1.02, 4.5 + dz * 0.1]);
  mesh(soft(new THREE.ConeGeometry(0.22, 0.14, 4)), clay(TILE), root, [-0.3, 1.2, 4.5], [0, Math.PI / 4, 0]);
  lanterns.push({ mat: boxGlow, base: 1.8 });

  // warm light spilling from the windows
  // (window warmth comes from emissive panes + bloom; real point lights are too costly on modest GPUs)

  return { group: root, glow, lanterns, swingers, lights };
}
