import * as THREE from 'three';
import { rand, pick, noise3, clamp, lerp } from '../core/noise.js';
import { makeClay, windVec, uniforms } from '../core/materials.js';
import { petalGeo, sphereGeo } from '../core/geo.js';
import { floorHeight, groundHeight, onIsland } from './island.js';
import { pagodaSurfaceY } from './pagoda.js';

// ---------------------------------------------------------------------------
// Precipitation: positions computed entirely on the GPU (no per-frame CPU work)
// ---------------------------------------------------------------------------
function precipitation({ count, geo, color, speed, swirl = 0, opacity = 0.5 }) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  g.attributes.position = geo.attributes.position;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * 15;
    seeds.set([Math.cos(a) * r, Math.sin(a) * r, rand(0, 1), rand(0, 1)], i * 4);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime, uAmount: { value: 0 }, uSpeed: { value: speed }, uWindXZ: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSwirl: { value: swirl },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uAmount, uSpeed, uSwirl; uniform vec2 uWindXZ;
      varying float vVis;
      void main() {
        float r = aSeed.w;
        vec2 xz = aSeed.xy;
        float inside = step(length(xz), 10.2);
        float bottom = mix(-10.0, 0.0, inside);
        float top = 14.0;
        float H = top - bottom;
        float y = bottom + mod(aSeed.z * H - uTime * uSpeed * (0.75 + 0.5 * r), H);
        float drop = top - y;
        xz += uWindXZ * drop * 0.07;
        xz += uSwirl * vec2(sin(uTime * 0.9 + r * 40.0 + y * 0.6), cos(uTime * 0.7 + r * 23.0 + y * 0.5)) * 0.35;
        vec3 p = position;
        p.xz += uWindXZ * 0.07 * p.y;
        float vis = step(r, uAmount);
        vVis = vis * smoothstep(top, top - 2.0, y);
        vec3 w = vec3(xz.x, y, xz.y) + p * vis;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vVis;
      void main() { if (vVis < 0.01) discard; gl_FragColor = vec4(uColor, uOpacity * vVis); }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

export function buildWeatherFX(scene) {
  const rain = precipitation({ count: 1800, geo: new THREE.BoxGeometry(0.01, 0.3, 0.01), color: '#c9d6e6', speed: 10, opacity: 0.42 });
  const snow = precipitation({ count: 1400, geo: new THREE.IcosahedronGeometry(0.035, 0), color: '#ffffff', speed: 1.1, swirl: 1, opacity: 0.9 });
  scene.add(rain, snow);

  // splash crowns where drops land
  const N = 70;
  const crownGeo = new THREE.TorusGeometry(1, 0.18, 4, 10);
  crownGeo.rotateX(Math.PI / 2);
  const crownMat = new THREE.MeshBasicMaterial({ color: '#dfe9f2', transparent: true, opacity: 0.6, depthWrite: false });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, N);
  crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crowns.frustumCulled = false;
  scene.add(crowns);
  const pool = Array.from({ length: N }, () => ({ life: 1, x: 0, y: 0, z: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let acc = 0, idx = 0;
  const W = new THREE.Vector3();
  return {
    spawnSplash(x, y, z) { const c = pool[idx++ % N]; c.life = 0; c.x = x; c.y = y; c.z = z; },
    update(dt, t, env, brightness) {
      windVec(0, 5, 0, t, W);
      rain.material.uniforms.uAmount.value = env.rain;
      rain.material.uniforms.uWindXZ.value.set(W.x, W.z);
      rain.material.uniforms.uColor.value.setRGB(0.75, 0.8, 0.88).multiplyScalar(0.5 + brightness * 0.7);
      snow.material.uniforms.uAmount.value = env.snow;
      snow.material.uniforms.uWindXZ.value.set(W.x * 0.5, W.z * 0.5);
      snow.material.uniforms.uColor.value.setRGB(1, 1, 1).multiplyScalar(0.55 + brightness * 0.6);
      rain.visible = env.rain > 0.01;
      snow.visible = env.snow > 0.01;
      acc += dt * env.rain * 55;
      while (acc > 1) {
        acc -= 1;
        const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * 9.6;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const roof = pagodaSurfaceY(x, z);
        this.spawnSplash(x, Math.max(groundHeight(x, z), roof > -10 ? roof : -99) + 0.02, z);
      }
      for (let i = 0; i < N; i++) {
        const c = pool[i];
        c.life += dt / 0.35;
        const k = Math.min(1, c.life);
        const sc = k < 1 ? 0.03 + k * 0.12 : 0;
        p.set(c.x, c.y + k * 0.03, c.z);
        s.set(sc, (1 - k) * 0.8 * sc + 0.0001, sc);
        m4.compose(p, q, s);
        crowns.setMatrixAt(i, m4);
      }
      crowns.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Fireflies: GPU-animated glowing motes with soft halos
// ---------------------------------------------------------------------------
export function buildFireflies(scene, homes) {
  const count = homes.length;
  const mk = (geo, frag, additive) => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index;
    g.attributes.position = geo.attributes.position;
    g.attributes.normal = geo.attributes.normal;
    const h = new Float32Array(count * 4);
    homes.forEach((v, i) => h.set([v.x, v.y, v.z, rand(0, 100)], i * 4));
    g.setAttribute('aHome', new THREE.InstancedBufferAttribute(h, 4));
    g.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uVis: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aHome; uniform float uTime; uniform float uVis;
        varying float vB; varying vec3 vN; varying vec3 vV;
        void main() {
          float s = aHome.w;
          vec3 c = aHome.xyz + vec3(sin(uTime * 0.37 + s) + 0.5 * sin(uTime * 0.83 + s * 2.1), sin(uTime * 0.29 + s * 1.7) * 0.5, cos(uTime * 0.31 + s * 1.3) + 0.5 * cos(uTime * 0.71 + s)) * 0.7;
          float blink = smoothstep(0.35, 1.0, sin(uTime * (0.9 + fract(s) * 0.8) + s * 7.0));
          vB = blink * uVis * step(fract(s * 0.37), uVis);
          vec4 mv = viewMatrix * vec4(c + position * (0.4 + 0.6 * vB), 1.0);
          vN = normalize(mat3(viewMatrix) * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: frag,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  };
  const core = mk(new THREE.IcosahedronGeometry(0.022, 1), /* glsl */ `
    varying float vB; void main() { if (vB < 0.02) discard; gl_FragColor = vec4(vec3(1.6, 1.9, 0.7) * vB + vec3(0.3, 0.35, 0.1), vB); }`, false);
  const halo = mk(new THREE.IcosahedronGeometry(0.16, 2), /* glsl */ `
    varying float vB; varying vec3 vN; varying vec3 vV;
    void main() { float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.5); gl_FragColor = vec4(vec3(0.75, 0.95, 0.3) * f * vB * 0.7, 1.0); }`, true);
  scene.add(core, halo);
  return {
    update(env) {
      const v = env.night * env.fireflies * (1 - env.rain * 0.8) * (1 - env.snow);
      core.material.uniforms.uVis.value = v;
      halo.material.uniforms.uVis.value = v;
      core.visible = halo.visible = v > 0.02;
    },
  };
}

// ---------------------------------------------------------------------------
// Butterflies flitting between flowers, landing to rest
// ---------------------------------------------------------------------------
export function buildButterflies(scene, flowerPoints) {
  const N = 10;
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(-0.05, 0.12, -0.2, 0.14, -0.2, 0.04);
  wingShape.bezierCurveTo(-0.2, -0.04, -0.12, -0.02, -0.1, -0.06);
  wingShape.bezierCurveTo(-0.14, -0.14, -0.04, -0.14, 0, -0.03);
  const wl = new THREE.ShapeGeometry(wingShape, 6);
  wl.rotateX(-Math.PI / 2);
  const wr = wl.clone();
  wr.scale(-1, 1, 1);
  const mat = makeClay({ side: THREE.DoubleSide, noAO: true, noSnow: true, bump: 0, roughness: 0.7 });
  const L = new THREE.InstancedMesh(wl, mat, N), R = new THREE.InstancedMesh(wr, mat, N);
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), makeClay({ color: '#3a2a22', noAO: true, bump: 0 }), N);
  for (const m of [L, R, body]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  const palette = ['#f6a23c', '#f7d34a', '#8fc6f0', '#f28bb4', '#ffffff', '#b98ef0', '#f26a4a'];
  const bs = Array.from({ length: N }, (_, i) => {
    const c = new THREE.Color(pick(palette));
    L.setColorAt(i, c); R.setColorAt(i, c);
    return { p: pick(flowerPoints).clone().add(new THREE.Vector3(0, 1, 0)), v: new THREE.Vector3(), target: pick(flowerPoints), land: 0, ph: rand(0, 6), yaw: 0 };
  });
  const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), rot = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  return {
    update(dt, t, env, avoid) {
      const vis = env.butterflies * (1 - env.night) * (1 - env.rain) * (1 - env.snow) * clamp(1.4 - env.wind * 0.5, 0, 1);
      const n = Math.round(N * vis);
      L.count = R.count = body.count = n;
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        let flap;
        if (b.land > 0) {
          b.land -= dt;
          flap = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + b.ph));
          for (const a of avoid) if (a.distanceToSquared(b.p) < 0.5) b.land = 0;
          if (b.land <= 0) { b.target = pick(flowerPoints); b.v.set(0, 1.2, 0); }
        } else {
          tmp.copy(b.target).sub(b.p);
          const d = tmp.length();
          tmp.normalize();
          b.v.lerp(tmp.multiplyScalar(1.1), dt * 1.5);
          b.v.x += Math.sin(t * 3.1 + b.ph) * dt * 3;
          b.v.y += Math.sin(t * 4.3 + b.ph * 2) * dt * 4;
          b.v.z += Math.cos(t * 2.7 + b.ph) * dt * 3;
          b.p.addScaledVector(b.v, dt);
          if (d < 0.08) { b.land = rand(2, 7); b.p.copy(b.target); b.v.set(0, 0, 0); }
          b.yaw = Math.atan2(b.v.x, b.v.z);
          flap = Math.sin(t * 22 + b.ph) * 0.95;
        }
        e.set(b.land > 0 ? 0 : -0.3, b.yaw, 0);
        q.setFromEuler(e);
        base.compose(b.p, q, one);
        body.setMatrixAt(i, m4.copy(base).multiply(rot.makeRotationX(Math.PI / 2)));
        L.setMatrixAt(i, m4.copy(base).multiply(rot.makeRotationZ(-flap)));
        R.setMatrixAt(i, m4.copy(base).multiply(rot.makeRotationZ(flap)));
      }
      for (const m of [L, R, body]) m.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Smoke puffs + sparks (campfire)
// ---------------------------------------------------------------------------
export function buildFire(scene, origin) {
  const NS = 22, NK = 26;
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#b8b0aa', transparent: true, opacity: 0.32, roughness: 1, depthWrite: false });
  const smoke = new THREE.InstancedMesh(sphereGeo(1, 8), smokeMat, NS);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.5) });
  const sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.015, 0), sparkMat, NK);
  for (const m of [smoke, sparks]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  smoke.renderOrder = 6;
  const sp = Array.from({ length: NS }, (_, i) => ({ life: i / NS, ox: rand(-0.1, 0.1), oz: rand(-0.1, 0.1) }));
  const kp = Array.from({ length: NK }, (_, i) => ({ life: rand(0, 1), ox: rand(-0.15, 0.15), oz: rand(-0.15, 0.15), sp: rand(0.6, 1.4) }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const W = new THREE.Vector3();
  return {
    update(dt, t, lit) {
      windVec(origin.x, 1, origin.z, t, W);
      for (let i = 0; i < NS; i++) {
        const o = sp[i];
        o.life += dt / 5;
        if (o.life > 1) { o.life -= 1; o.ox = rand(-0.1, 0.1); o.oz = rand(-0.1, 0.1); }
        const k = o.life;
        p.set(origin.x + o.ox + W.x * k * 1.2 + Math.sin(t + i) * 0.1 * k, origin.y + 0.45 + k * 3.2, origin.z + o.oz + W.z * k * 1.2);
        const sc = lit * (0.1 + k * 0.45) * Math.sin(Math.PI * Math.min(1, k * 1.1));
        s.setScalar(Math.max(0.0001, sc));
        m4.compose(p, q, s);
        smoke.setMatrixAt(i, m4);
      }
      for (let i = 0; i < NK; i++) {
        const o = kp[i];
        o.life += (dt / 1.6) * o.sp;
        if (o.life > 1) { o.life -= 1; o.ox = rand(-0.15, 0.15); o.oz = rand(-0.15, 0.15); }
        const k = o.life;
        p.set(origin.x + o.ox + Math.sin(t * 5 + i) * 0.08 * k + W.x * k * 0.4, origin.y + 0.3 + k * 1.8, origin.z + o.oz + Math.cos(t * 4 + i) * 0.08 * k + W.z * k * 0.4);
        s.setScalar(lit > 0.5 ? (1 - k) * 1.3 + 0.0001 : 0.0001);
        m4.compose(p, q, s);
        sparks.setMatrixAt(i, m4);
      }
      smoke.instanceMatrix.needsUpdate = sparks.instanceMatrix.needsUpdate = true;
      smoke.visible = sparks.visible = lit > 0.01;
    },
  };
}

// ---------------------------------------------------------------------------
// Falling sakura petals (spring) / autumn leaves, landing on ground and roofs
// ---------------------------------------------------------------------------
export function buildFalling(scene, sources, count = 140) {
  const geo = petalGeo({ L: 0.13, W: 0.075, cup: 0.35, curl: 0.2 });
  const mat = makeClay({ vertexColors: true, side: THREE.DoubleSide, bump: 0.005, roughness: 0.75, noAO: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const pink = [new THREE.Color(1, 1, 1), new THREE.Color(1, 0.82, 0.88)];
  const autumn = ['#ff9a3a', '#e8572e', '#ffcf45', '#c9402c', '#f07a2a'].map((h) => new THREE.Color(h).multiplyScalar(1.6));
  const P = [];
  const col = new THREE.Color();
  const spawn = (p, initial, leafMode) => {
    const s = pick(sources);
    p.pos.copy(s).add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.1, 0.05), rand(-0.15, 0.15)));
    if (initial) p.pos.y -= rand(0, p.pos.y);
    p.vel.set(rand(-0.05, 0.05), -rand(0.15, 0.3), rand(-0.05, 0.05));
    p.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    p.spin = rand(1.5, 4) * (Math.random() < 0.5 ? -1 : 1);
    p.ang = rand(0, 6); p.flut = rand(0, 100); p.state = 0; p.rest = 0;
    p.leaf = leafMode;
    p.scale = rand(0.8, 1.15) * (leafMode ? 1.6 : 1);
    col.copy(leafMode ? pick(autumn) : pink[0]).lerp(leafMode ? col : pink[1], leafMode ? 0 : rand(0, 1));
    mesh.setColorAt(p.i, col);
    mesh.instanceColor.needsUpdate = true;
  };
  for (let i = 0; i < count; i++) {
    const p = { i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(), q: new THREE.Quaternion(), delay: rand(0, 14) };
    mesh.setColorAt(i, col.set('#ffffff'));
    spawn(p, true, false);
    P.push(p);
  }
  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), w = new THREE.Vector3(), qq = new THREE.Quaternion();
  const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  return {
    mesh,
    update(dt, t, env) {
      const rate = Math.max(env.petals, env.leaves) * (1 + env.wind * 0.5);
      const active = Math.round(count * Math.min(1, rate));
      const leafMode = env.leaves > env.petals;
      for (let i = 0; i < count; i++) {
        const p = P[i];
        let s = p.scale;
        if (i >= active && p.state === 0 && p.delay <= 0 && p.pos.y > 8) s = 0;
        if (p.delay > 0) { p.delay -= dt; s = 0; if (p.delay <= 0 && i >= active) p.delay = rand(2, 6); }
        else if (p.state === 0) {
          windVec(p.pos.x, p.pos.y, p.pos.z, t, w);
          const f = p.flut + t;
          p.vel.x += (w.x * 0.08 + Math.sin(f * 2.3) * 0.25 - p.vel.x) * dt * 1.5;
          p.vel.z += (w.z * 0.08 + Math.cos(f * 1.9) * 0.25 - p.vel.z) * dt * 1.5;
          p.vel.y += (-0.32 + Math.sin(f * 3.1) * 0.12 - p.vel.y) * dt * 2;
          p.pos.addScaledVector(p.vel, dt);
          p.ang += p.spin * dt;
          p.q.setFromAxisAngle(p.axis, p.ang);
          const roof = pagodaSurfaceY(p.pos.x, p.pos.z);
          const fl = Math.max(floorHeight(p.pos.x, p.pos.z) + 0.03, roof > p.pos.y - 0.3 && roof < p.pos.y + 0.05 ? roof : -99);
          if (p.pos.y <= fl) {
            p.pos.y = fl; p.state = 1; p.rest = rand(5, 11);
            qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6));
            p.q.copy(qq).multiply(flatQ);
          }
        } else {
          p.rest -= dt;
          if (p.rest < 1) s *= Math.max(0, p.rest);
          if (p.rest <= 0) { spawn(p, false, leafMode); p.delay = i < active ? rand(0, 3) : rand(3, 8); }
        }
        sc.setScalar(Math.max(0.0001, s));
        m4.compose(p.pos, p.q, sc);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
