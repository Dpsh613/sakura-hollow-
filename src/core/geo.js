import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { noise3 } from './noise.js';
import { bakedMaterials } from './materials.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);
export const color = (h) => new THREE.Color(h);

/** Remove attributes we never need (uvs etc.). */
export function strip(g, keepNormal = true) {
  for (const k of Object.keys(g.attributes)) {
    if (k === 'position' || k === 'color' || k === 'aSway') continue;
    if (k === 'normal' && keepNormal) continue;
    g.deleteAttribute(k);
  }
  return g;
}

const _unitSpheres = new Map();
/** Welded unit sphere (cached) - cloned for every use. */
export function unitSphere(w, h) {
  const k = w + 'x' + h;
  if (!_unitSpheres.has(k)) _unitSpheres.set(k, soft(new THREE.SphereGeometry(1, w, h)));
  return _unitSpheres.get(k).clone();
}

/** Weld seams and recompute smooth normals - every clay piece is soft. */
export function soft(g) {
  strip(g, false);
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

/** Hand-pressed imperfection: low frequency displacement by a 3D noise field. */
export function jitter(g, amt = 0.02, freq = 2, s = 0) {
  g = soft(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(
      i,
      x + amt * noise3(x * freq + s, y * freq, z * freq),
      y + amt * noise3(x * freq, y * freq + s + 13.1, z * freq),
      z + amt * noise3(x * freq + 7.7, y * freq, z * freq + s),
    );
  }
  g.computeVertexNormals();
  return g;
}

export function colorize(g, base, fn) {
  const p = g.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const b = base instanceof THREE.Color ? base : new THREE.Color(base);
  for (let i = 0; i < p.count; i++) {
    _c.copy(b);
    if (fn) fn(p.getX(i), p.getY(i), p.getZ(i), _c, i);
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function swayAttr(g, fn) {
  const p = g.attributes.position;
  const arr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) arr[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  g.setAttribute('aSway', new THREE.BufferAttribute(arr, 1));
  return g;
}

export function rbox(w, h, d, r = 0.035, seg = 1) {
  r = Math.min(r, Math.min(w, h, d) * 0.45);
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

export function mesh(geo, mat, parent, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale !== undefined) {
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale[0], scale[1], scale[2]);
  }
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

/** Make an object's local +Y point along dir. */
export function alignY(obj, dir) {
  obj.quaternion.setFromUnitVectors(UP, _v.copy(dir).normalize());
  return obj;
}

/** Matrix from position + basis where local Y = dirY and local Z ~ hintZ. */
export function basis(pos, dirY, hintZ, scale = 1) {
  const Y = dirY.clone().normalize();
  let Z = hintZ.clone().addScaledVector(Y, -hintZ.dot(Y));
  if (Z.lengthSq() < 1e-6) Z = new THREE.Vector3(1, 0, 0).cross(Y);
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  if (typeof scale === 'number') m.scale(new THREE.Vector3(scale, scale, scale));
  else m.scale(scale);
  m.setPosition(pos);
  return m;
}

/**
 * Tapered, optionally ridged/twisting tube. Used for branches, roots, tails,
 * clay coils and ropes. Caps both ends so pieces read as solid objects.
 */
export function taperedTube(input, rFn, o = {}) {
  const curve = Array.isArray(input) ? new THREE.CatmullRomCurve3(input, false, 'centripetal') : input;
  const seg = o.segments ?? 24, rad = o.radial ?? 8;
  const ridge = o.ridge ?? 0, ridgeN = o.ridgeN ?? 6, twist = o.twist ?? 0, bumpy = o.bumpy ?? 0;
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], cols = [], sway = [], idx = [];
  const P = new THREE.Vector3(), D = new THREE.Vector3();
  const wantCol = !!o.color, wantSway = !!o.sway;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = rFn(t);
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      let k = 1;
      let rv = 0;
      if (ridge) { rv = Math.sin(a * ridgeN + t * twist); k *= 1 + ridge * rv; }
      if (bumpy) k *= 1 + bumpy * noise3(P.x * 2.7 + Math.cos(a) * 0.7, P.y * 2.7 + Math.sin(a) * 0.7, P.z * 2.7);
      D.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(P.x + D.x * r * k, P.y + D.y * r * k, P.z + D.z * r * k);
      if (wantCol) { o.color(t, rv, _c); cols.push(_c.r, _c.g, _c.b); }
      if (wantSway) sway.push(o.sway(t));
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad);
      idx.push(a, b, c, b, d, c);
    }
  }
  const pushCap = (t, sign) => {
    curve.getPointAt(t, P);
    const T = curve.getTangentAt(t);
    const r = rFn(t);
    pos.push(P.x + T.x * r * 0.7 * sign, P.y + T.y * r * 0.7 * sign, P.z + T.z * r * 0.7 * sign);
    if (wantCol) { o.color(t, 0, _c); cols.push(_c.r, _c.g, _c.b); }
    if (wantSway) sway.push(o.sway(t));
    return pos.length / 3 - 1;
  };
  if (o.capEnd !== false) {
    const apex = pushCap(1, 1);
    const base = seg * rad;
    for (let j = 0; j < rad; j++) idx.push(base + j, base + ((j + 1) % rad), apex);
  }
  if (o.capStart) {
    const apex = pushCap(0, -1);
    for (let j = 0; j < rad; j++) idx.push(j, apex, (j + 1) % rad);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (wantCol) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  if (wantSway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Plump sculpted leaf (with thickness, midrib groove, bend and cup). Base at origin, points +Y, front faces +Z. */
export function leafGeo(o = {}) {
  const {
    length = 1, width = 0.4, thick = 0.09, bend = 0.15, cup = 0.12, groove = 0.35,
    wSeg = 8, hSeg = 9, c1 = '#8fa35a', c2 = null, sway = 0, pinch = 0.75, blunt = 0,
  } = o;
  let g = unitSphere(wSeg, hSeg);
  const p = g.attributes.position;
  const ca = new THREE.Color(c1), cb = new THREE.Color(c2 ?? c1);
  const cols = new Float32Array(p.count * 3), sw = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + 1) / 2;
    const s = Math.sqrt(Math.max(1e-6, 1 - y * y));
    const nx = x / s, nz = z / s;
    let prof = Math.pow(Math.sin(Math.PI * Math.pow(t, pinch)), 0.85);
    if (blunt) prof = Math.max(prof, blunt * Math.sin(Math.PI * t) ** 0.3 * (t > 0.5 ? 1 : 0));
    const X = nx * width * 0.5 * prof;
    let Z = nz * thick * 0.5 * prof;
    if (nz > 0) Z -= groove * thick * Math.exp(-(nx * nx) / 0.02) * prof;
    Z += bend * t * t * length + cup * nx * nx * width * 0.5 * prof;
    p.setXYZ(i, X, t * length, Z);
    _c.copy(ca).lerp(cb, t);
    cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b;
    sw[i] = Math.pow(t, 1.5) * sway;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.computeVertexNormals();
  return g;
}

/** Sakura petal: parametric grid so it can cup and curl; notched tip. Base at origin, points +Y, faces +Z. */
export function petalGeo(o = {}) {
  const { L = 0.13, W = 0.07, cup = 0.35, curl = 0.18, notch = 0.12, NU = 6, NV = 7, c1 = '#ef9fb0', c2 = '#fde6ec' } = o;
  const pos = [], cols = [], idx = [];
  const ca = new THREE.Color(c1), cb = new THREE.Color(c2);
  for (let iv = 0; iv <= NV; iv++) {
    const v = iv / NV;
    const wv = W * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * v)), 0.6) * (0.3 + 0.7 * Math.min(1, v / 0.35));
    for (let iu = 0; iu <= NU; iu++) {
      const u = (iu / NU) * 2 - 1;
      const x = u * wv;
      const y = v * L - notch * L * (1 - u * u) * Math.pow(v, 6);
      const z = cup * u * u * wv + curl * v * v * L;
      pos.push(x, y, z);
      _c.copy(ca).lerp(cb, Math.min(1, v * 1.4 + Math.abs(u) * 0.2));
      cols.push(_c.r, _c.g, _c.b);
    }
  }
  const row = NU + 1;
  for (let iv = 0; iv < NV; iv++)
    for (let iu = 0; iu < NU; iu++) {
      const a = iv * row + iu, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Egg / pear shaped body - narrower on top. */
export function eggGeo(rx, ry, rz, k = 0.15, seg = 28) {
  const g = unitSphere(seg, Math.round(seg * 0.75));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const s = 1 - k * y;
    p.setXYZ(i, p.getX(i) * s * rx, y * ry, p.getZ(i) * s * rz);
  }
  g.computeVertexNormals();
  return g;
}

export function sphereGeo(r = 1, seg = 20) {
  return unitSphere(seg, Math.max(6, Math.round(seg * 0.7))).scale(r, r, r);
}

/** Ensure all attributes required for merging exist. */
function normalizeForMerge(g, mat, matrix) {
  g = g.index ? g.clone() : g.clone();
  strip(g);
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const mc = mat.color || new THREE.Color(1, 1, 1);
  const cols = new Float32Array(n * 3);
  const src = g.attributes.color;
  for (let i = 0; i < n; i++) {
    const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
    cols[i * 3] = r * mc.r; cols[i * 3 + 1] = gg * mc.g; cols[i * 3 + 2] = b * mc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (!g.attributes.aSway) g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1));
  else if (!(g.attributes.aSway.array instanceof Float32Array)) g.setAttribute('aSway', new THREE.BufferAttribute(Float32Array.from(g.attributes.aSway.array), 1));
  // make sure every attribute is a plain float32 non-interleaved attribute
  for (const k of ['position', 'normal']) {
    const a = g.attributes[k];
    if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) {
      const arr = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
    }
  }
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  // convert index to Uint32 for safe merging
  if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Merge every static mesh under `root` into a handful of meshes (one per
 * material kind). Objects (or ancestors) flagged userData.keep stay live.
 */
export function bakeInto(root, target) {
  root.updateMatrixWorld(true);
  const buckets = {};
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) if (p.userData.keep) return;
    const kind = o.material.userData?.kind || 'clay';
    if (!bakedMaterials[kind]) return;
    (buckets[kind] ||= []).push(normalizeForMerge(o.geometry, o.material, o.matrixWorld));
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const out = [];
  for (const kind in buckets) {
    // merge in chunks to keep individual buffers reasonable
    const list = buckets[kind];
    const chunk = 400;
    for (let i = 0; i < list.length; i += chunk) {
      const merged = mergeGeometries(list.slice(i, i + chunk), false);
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, bakedMaterials[kind]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.pickable = true;
      target.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * Merge the static meshes inside an animated rig *per parent node*, in that
 * parent's local space. Animated joints (Groups) and meshes flagged
 * userData.live keep moving; draw calls drop dramatically.
 */
export function bakeLocal(root, materialFor) {
  const parents = new Set();
  root.traverse((o) => { if (o.isMesh && !o.userData.live && o.parent) parents.add(o.parent); });
  for (const parent of parents) {
    const buckets = new Map();
    for (const o of [...parent.children]) {
      if (!o.isMesh || o.userData.live) continue;
      const target = materialFor(o.material);
      if (!target) continue;
      o.updateMatrix();
      if (!buckets.has(target)) buckets.set(target, []);
      buckets.get(target).push(normalizeForMerge(o.geometry, o.material, o.matrix));
      parent.remove(o);
    }
    for (const [mat, list] of buckets) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = mat.userData.noShadow ? false : true;
      m.receiveShadow = true;
      parent.add(m);
    }
  }
}
