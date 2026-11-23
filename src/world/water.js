import * as THREE from 'three';
import { rand, pick, lerp } from '../core/noise.js';
import { uniforms, GRADE_GLSL, clay, makeClay } from '../core/materials.js';
import { mesh, leafGeo, sphereGeo, taperedTube, colorize } from '../core/geo.js';
import { POND, WATER_Y, STREAM, pondD, groundHeight, rimR } from './island.js';

// shared water look, driven by the sky / weather each frame
export const waterUniforms = {
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
  uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
  uSky: { value: new THREE.Color('#7fb7e6') },
  uHorizon: { value: new THREE.Color('#f2d7b8') },
  uRain: { value: 0 },
  uIce: { value: 0 },
  uFogColor: { value: new THREE.Color('#ffffff') },
  uFogDensity: { value: 0 },
  uNightW: { value: 0 },
  uRipples: { value: new Array(6).fill(0).map(() => new THREE.Vector4(0, 0, -100, 0)) },
};

const WATER_VERT = /* glsl */ `
  attribute float aDepth;
  attribute vec2 aFlow;
  varying vec3 vWorld;
  varying float vDepth;
  varying vec2 vFlow;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz; vDepth = aDepth; vFlow = aFlow;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uHorizon;
  uniform float uRain; uniform float uIce; uniform vec3 uFogColor; uniform float uFogDensity;
  uniform float uNightW; uniform float uGradeOn; uniform float uMode; uniform float uWind;
  uniform vec3 uDeep; uniform vec3 uShallow; uniform float uAlpha;
  uniform vec4 uRipples[6];
  varying vec3 vWorld; varying float vDepth; varying vec2 vFlow;
  ${GRADE_GLSL}
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 rainRing(vec2 p, float scale, float speed) {
    vec2 cell = floor(p / scale);
    vec2 g = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float r = h21(c);
      vec2 ctr = (c + 0.2 + 0.6 * vec2(h21(c + 7.1), h21(c + 3.3))) * scale;
      float ph = fract(uTime * speed + r);
      vec2 d = p - ctr; float dl = length(d) + 1e-4;
      float rad = ph * scale * 1.1;
      float ring = sin((dl - rad) * 70.0) * exp(-abs(dl - rad) * 60.0) * (1.0 - ph);
      g += d / dl * ring * step(r, uRain * 1.2);
    }
    return g;
  }
  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    vec2 g = vec2(0.0);
    if (uMode < 0.5) {
      float wnd = 0.4 + uWind * 0.6;
      g += vec2(cos(p.x * 3.1 + t * 1.3), cos(p.y * 2.7 - t * 1.1)) * 0.035 * wnd;
      g += vec2(cos(p.x * 7.3 - p.y * 2.1 + t * 2.1), cos(p.y * 6.1 + p.x * 1.7 + t * 1.7)) * 0.018 * wnd;
      if (uRain > 0.01) { g += rainRing(p, 0.33, 1.3) * 0.12; g += rainRing(p + 5.3, 0.21, 1.7) * 0.08; }
      for (int k = 0; k < 6; k++) {
        vec4 rp = uRipples[k];
        float age = t - rp.z;
        if (age > 0.0 && age < 3.0) {
          vec2 d = p - rp.xy; float dl = length(d) + 1e-4;
          float rad = age * 0.55;
          g += d / dl * sin((dl - rad) * 30.0) * exp(-abs(dl - rad) * 8.0) * (1.0 - age / 3.0) * 0.25 * rp.w;
        }
      }
    } else {
      // flowing water (stream / waterfall)
      float s = vFlow.y * 6.0 - t * 2.4;
      g += vec2(sin(vFlow.x * 18.0 + s * 3.0), cos(s * 4.0 + vFlow.x * 9.0)) * 0.08;
    }
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.8 + 0.1;
    vec3 r = reflect(-v, n);
    vec3 refl = mix(uHorizon, uSky, clamp(r.y * 1.4, 0.0, 1.0));
    vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.32, vDepth));
    vec3 col = mix(base, refl, fres);
    float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 140.0);
    col += uSunColor * spec * 1.6;
    float foam = 0.0;
    if (uMode < 0.5) {
      foam = smoothstep(0.05, 0.0, vDepth) * (0.5 + 0.5 * sin(p.x * 13.0 + p.y * 11.0 + t * 1.5));
    } else {
      float streak = fract(vFlow.y * 7.0 - t * 2.6 + sin(vFlow.x * 25.0) * 0.15);
      foam = smoothstep(0.82, 1.0, streak) * 0.6 + smoothstep(0.85, 1.0, abs(vFlow.x * 2.0 - 1.0)) * 0.5;
    }
    col = mix(col, vec3(0.93, 0.96, 0.98), foam * 0.55);
    // night: deepen and pick up moonlight sheen
    col = mix(col, col * vec3(0.45, 0.55, 0.8), uNightW * 0.5);
    // ice
    vec3 ice = mix(vec3(0.78, 0.88, 0.95), vec3(0.95, 0.98, 1.0), fres) + uSunColor * spec * 0.6;
    col = mix(col, ice, uIce * (1.0 - step(0.5, uMode)));
    float alpha = mix(uAlpha, 0.97, max(smoothstep(0.0, 0.35, vDepth), uIce));
    if (uMode > 0.5) alpha = uAlpha * smoothstep(0.0, 0.08, min(vFlow.x, 1.0 - vFlow.x) + 0.04) * (1.0 - smoothstep(0.75, 1.0, vFlow.y * step(1.5, uMode)));
    float fd = length(cameraPosition - vWorld);
    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * fd * fd);
    col = mix(col, uFogColor, fogF);
    if (uGradeOn > 0.5) col = clayGrade(col);
    gl_FragColor = vec4(col, alpha);
  }
`;

export function waterMaterial({ mode = 0, deep = '#1f5a5c', shallow = '#4f9a86', alpha = 0.8 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...waterUniforms,
      uTime: uniforms.uTime, uGradeOn: uniforms.uGradeOn, uGrade: uniforms.uGrade, uGradeTint: uniforms.uGradeTint, uGradeLift: uniforms.uGradeLift,
      uWind: uniforms.uWind,
      uMode: { value: mode }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uAlpha: { value: alpha },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: mode === 2 ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function pondGeometry() {
  const NR = 18, NA = 72;
  const pos = [], depth = [], flow = [], idx = [];
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  pos.push(POND.x, WATER_Y, POND.z); depth.push(WATER_Y - groundHeight(POND.x, POND.z)); flow.push(0, 0);
  for (let i = 1; i <= NR; i++) {
    const k = (i / NR) * 1.32;
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const u = Math.cos(a) * POND.rx * k, v = Math.sin(a) * POND.rz * k;
      let x = POND.x + u * c - v * s, z = POND.z + u * s + v * c;
      // pull outline to the true (wobbly) shoreline
      const d = pondD(x, z) / k;
      x = POND.x + (x - POND.x) / d; z = POND.z + (z - POND.z) / d;
      pos.push(x, WATER_Y, z);
      depth.push(WATER_Y - groundHeight(x, z));
      flow.push(0, 0);
    }
  }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + ((j + 1) % NA), 1 + j);
  for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + ((j + 1) % NA), cc = 1 + i * NA + j, d = 1 + i * NA + ((j + 1) % NA);
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  return g;
}

/** Ribbon along a list of centre points (each [x,y,z]) with width per point. */
function ribbon(points, widths, side = new THREE.Vector3(0, 1, 0), vertical = false) {
  const pos = [], depth = [], flow = [], idx = [];
  let acc = 0;
  const total = points.reduce((s, p, i) => (i ? s + p.distanceTo(points[i - 1]) : 0), 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const nxt = points[Math.min(points.length - 1, i + 1)], prv = points[Math.max(0, i - 1)];
    const tan = nxt.clone().sub(prv).normalize();
    const across = vertical ? side.clone() : new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    if (i) acc += p.distanceTo(points[i - 1]);
    for (const k of [0, 1]) {
      const q = p.clone().addScaledVector(across, (k - 0.5) * widths[i]);
      pos.push(q.x, q.y, q.z);
      depth.push(0.2);
      flow.push(k, acc / total);
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  return g;
}

export function buildWater() {
  const group = new THREE.Group();
  const pondMat = waterMaterial({ mode: 0 });
  const pond = new THREE.Mesh(pondGeometry(), pondMat);
  pond.renderOrder = 2;
  pond.userData.pickable = true;
  pond.userData.water = true;
  group.add(pond);

  // stream ribbon following the channel
  const curve = new THREE.CatmullRomCurve3(STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const sp = [], sw = [];
  for (let i = 0; i <= 40; i++) {
    const p = curve.getPointAt(i / 40);
    p.y = Math.max(groundHeight(p.x, p.z) + 0.08, -0.2);
    if (i === 0) p.y = WATER_Y;
    sp.push(p); sw.push(0.42 + 0.06 * Math.sin(i * 0.7));
  }
  const streamMat = waterMaterial({ mode: 1, alpha: 0.85, deep: '#2a6a68', shallow: '#5fae98' });
  const stream = new THREE.Mesh(ribbon(sp, sw), streamMat);
  stream.renderOrder = 2;
  group.add(stream);

  // waterfall pouring off the rim into the clouds
  const last = sp[sp.length - 1];
  const dirOut = new THREE.Vector3(last.x, 0, last.z).normalize();
  const lipR = rimR(Math.atan2(last.z, last.x)) + 0.25;
  const lip = new THREE.Vector3(dirOut.x * lipR, last.y - 0.04, dirOut.z * lipR);
  const fp = [], fw = [];
  for (let i = 0; i <= 30; i++) {
    const s = i / 30;
    fp.push(lip.clone().addScaledVector(dirOut, 0.25 + s * 1.1).add(new THREE.Vector3(0, -s * s * 7.5 - s * 0.3, 0)));
    fw.push(0.45 + s * 0.7);
  }
  const across = new THREE.Vector3(-dirOut.z, 0, dirOut.x);
  const fallMat = waterMaterial({ mode: 2, alpha: 0.8, deep: '#4a8f92', shallow: '#9fd2cc' });
  const fall = new THREE.Mesh(ribbon(fp, fw, across, true), fallMat);
  fall.renderOrder = 3;
  group.add(fall);
  // connect stream end to lip
  const joinGeo = ribbon([last, lip.clone().addScaledVector(dirOut, 0.26)], [0.46, 0.46]);
  const join = new THREE.Mesh(joinGeo, streamMat);
  join.renderOrder = 2;
  group.add(join);

  // mist at the foot of the falls (soft translucent clay puffs)
  const mist = [];
  const mistMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, roughness: 1, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const foot = fp[fp.length - 1];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(sphereGeo(1, 10), mistMat);
    m.userData.base = foot.clone().add(new THREE.Vector3(rand(-0.8, 0.8), rand(-0.6, 0.4), rand(-0.8, 0.8)));
    m.userData.ph = rand(0, 6);
    m.userData.s = rand(0.5, 1.1);
    m.renderOrder = 4;
    group.add(m);
    mist.push(m);
  }

  // lily pads + lotus
  const padMat = clay('#4f8a3a', { foliage: true });
  const pads = [];
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), k = rand(0.2, 0.75);
    const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
    const u = Math.cos(a) * POND.rx * k, v = Math.sin(a) * POND.rz * k;
    const x = POND.x + u * c - v * s, z = POND.z + u * s + v * c;
    const r = rand(0.18, 0.32);
    const geo = new THREE.CylinderGeometry(r, r, 0.03, 18, 1, false, 0.35, Math.PI * 2 - 0.35);
    const pad = mesh(geo, padMat, group, [x, WATER_Y + 0.02, z], [0, rand(0, 6), 0]);
    pad.castShadow = false;
    pad.userData.keep = true;
    pad.userData.ph = rand(0, 6);
    pads.push(pad);
    if (i < 3) {
      const lotus = new THREE.Group();
      lotus.position.set(0, 0.02, 0);
      pad.add(lotus);
      for (let k2 = 0; k2 < 8; k2++) {
        const lg = leafGeo({ length: 0.12, width: 0.07, thick: 0.03, cup: 0.3, c1: '#f2a1b8', c2: '#fde4ea', wSeg: 5, hSeg: 6 });
        const pm = mesh(lg, clay('#ffffff'), lotus, null, [k2 < 4 ? -0.5 : -1.0, (k2 / 4) * Math.PI * 2 + (k2 < 4 ? 0 : 0.4), 0]);
        pm.rotation.order = 'YXZ';
      }
      mesh(sphereGeo(0.03, 8), clay('#f2c84b'), lotus, [0, 0.03, 0]);
    }
  }
  // reeds and cattails around the shore
  const reedGroup = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2);
    const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
    const k = rand(1.02, 1.22);
    const u = Math.cos(a) * POND.rx * k, v = Math.sin(a) * POND.rz * k;
    const x = POND.x + u * c - v * s, z = POND.z + u * s + v * c;
    if (x > -3.0 && z > 3.4 && z < 4.8) continue; // keep the dock clear
    const y = groundHeight(x, z);
    const n = 3 + Math.floor(rand(0, 4));
    for (let j = 0; j < n; j++) {
      const h = rand(0.45, 0.95);
      const ox = x + rand(-0.08, 0.08), oz = z + rand(-0.08, 0.08);
      const lean = new THREE.Vector3(rand(-0.08, 0.08), 0, rand(-0.08, 0.08));
      const pts = [new THREE.Vector3(ox, y - 0.05, oz), new THREE.Vector3(ox + lean.x * 0.4, y + h * 0.5, oz + lean.z * 0.4), new THREE.Vector3(ox + lean.x, y + h, oz + lean.z)];
      mesh(taperedTube(pts, (t) => 0.014 * (1 - t * 0.6), { segments: 6, radial: 4, color: (t, r, cc) => cc.set('#5f8a3a').lerp(new THREE.Color('#9db35a'), t), sway: (t) => t * t }), clay('#ffffff', { kind: 'foliage' }), reedGroup);
      if (j === 0) {
        const cg = sphereGeo(1, 8);
        colorize(cg, '#7a4a2e');
        const top = new THREE.Vector3(ox + lean.x, y + h + 0.06, oz + lean.z);
        const ct = mesh(cg, clay('#ffffff', { kind: 'foliage' }), reedGroup, top.toArray(), null, [0.035, 0.09, 0.035]);
        ct.geometry = cg.clone();
        const sw = new Float32Array(cg.attributes.position.count).fill(1);
        ct.geometry.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
      }
    }
  }
  group.add(reedGroup);

  let rippleIdx = 0;
  return {
    group, pond, pondMat, fall, mist, pads, reedGroup, fallFoot: foot.clone(), lip,
    ripple(x, z, strength = 1) {
      const r = waterUniforms.uRipples.value[rippleIdx++ % 6];
      r.set(x, z, uniforms.uTime.value, strength);
    },
    update(t, env) {
      for (const m of mist) {
        const ph = m.userData.ph;
        m.position.copy(m.userData.base).add(new THREE.Vector3(Math.sin(t * 0.3 + ph) * 0.4, Math.sin(t * 0.5 + ph * 2) * 0.3, Math.cos(t * 0.25 + ph) * 0.4));
        const s = m.userData.s * (1 + 0.15 * Math.sin(t * 0.7 + ph));
        m.scale.setScalar(s * (1 - env.ice * 0.6));
      }
      for (const p of pads) p.position.y = WATER_Y + 0.02 + Math.sin(t * 0.8 + p.userData.ph) * 0.006 * (1 - env.ice);
      fall.visible = env.ice < 0.85;
    },
  };
}

/** Rain puddles that swell in wet weather (characters love to splash in them). */
export const PUDDLE_SPOTS = [[0.85, 3.35], [-2.2, 2.55], [2.0, 7.7], [5.1, 5.05], [-0.9, 7.5], [4.6, 1.4]];
export function buildPuddles() {
  const mat = waterMaterial({ mode: 0, deep: '#3c5b5a', shallow: '#6d8f86', alpha: 0.75 });
  const list = PUDDLE_SPOTS.map(([x, z]) => {
    const NA = 24, pos = [x, 0, z], dep = [0.15], flow = [0, 0], idx = [];
    const k = rand(0.85, 1.2);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const r = (0.42 + 0.08 * Math.sin(a * 3 + x) + 0.05 * Math.sin(a * 5 + z)) * k;
      const px = x + Math.cos(a) * r * 1.2, pz = z + Math.sin(a) * r;
      pos.push(px, 0, pz); dep.push(0.0); flow.push(0, 0);
    }
    for (let j = 0; j < NA; j++) idx.push(0, 1 + ((j + 1) % NA), 1 + j);
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(pos);
    for (let i = 0; i < P.length; i += 3) P[i + 1] = groundHeight(x, z) + 0.022;
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.translate(-x, 0, -z);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, 0, z);
    m.renderOrder = 1;
    m.visible = false;
    return { mesh: m, x, z };
  });
  return {
    list,
    meshes: list.map((p) => p.mesh),
    update(level) {
      for (const p of list) {
        p.mesh.visible = level > 0.04;
        p.mesh.scale.set(level, 1, level);
      }
    },
  };
}
