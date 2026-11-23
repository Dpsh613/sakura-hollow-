import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, lerp, clamp } from '../core/noise.js';
import { uniforms, GRADE_GLSL, makeClay } from '../core/materials.js';
import { sphereGeo, colorize, strip } from '../core/geo.js';

export const skyUniforms = {
  uTop: { value: new THREE.Color('#4f8fd6') },
  uHorizon: { value: new THREE.Color('#f6d3a8') },
  uBottom: { value: new THREE.Color('#e9c7b0') },
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.85, 0.6) },
  uMoonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.5).normalize() },
  uStars: { value: 0 },
  uCloudy: { value: 0 },
  uFlash: { value: 0 },
};

export function buildSkyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...skyUniforms, uTime: uniforms.uTime, uGradeOn: uniforms.uGradeOn, uGrade: uniforms.uGrade, uGradeTint: uniforms.uGradeTint, uGradeLift: uniforms.uGradeLift },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir;
      uniform float uStars, uCloudy, uTime, uFlash, uGradeOn;
      varying vec3 vDir;
      ${GRADE_GLSL}
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.38));
        col = mix(col, uBottom, smoothstep(0.0, -0.45, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        float clear = 1.0 - uCloudy * 0.75;
        col += uSunColor * (pow(sd, 1600.0) * 8.0 * clear + pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.18) ;
        float md = max(dot(d, normalize(uMoonDir)), 0.0);
        col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9998, md) * 1.6 + pow(md, 60.0) * 0.12) * uStars * clear;
        if (uStars > 0.01 && h > -0.05) {
          vec3 sp = d * 260.0;
          vec3 cell = floor(sp);
          float r = h31(cell);
          if (r > 0.982) {
            vec3 c = cell + 0.5 + (vec3(h31(cell + 1.3), h31(cell + 2.7), h31(cell + 5.1)) - 0.5) * 0.6;
            float dd = length(sp - c);
            float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 3.0) + r * 90.0);
            vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h31(cell + 9.0));
            col += sc * smoothstep(0.45, 0.0, dd) * tw * uStars * clear * smoothstep(-0.05, 0.25, h) * 1.4;
          }
        }
        col += vec3(0.8, 0.85, 1.0) * uFlash;
        if (uGradeOn > 0.5) col = clayGrade(col);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

function cloudGeo(n, spread, seedY = 0) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const r = rand(0.8, 1.6) * (1 - Math.abs(i / n - 0.5) * 0.7);
    const g = sphereGeo(r, 14);
    g.translate(((i / (n - 1)) - 0.5) * spread + rand(-0.4, 0.4), rand(0, 0.5) * r + seedY, rand(-0.7, 0.7));
    parts.push(strip(g));
  }
  const m = mergeGeometries(parts, false);
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.35);
  m.computeVertexNormals();
  colorize(m, '#ffffff', (x, y, z, c) => c.setRGB(0.86, 0.86, 0.95).lerp(new THREE.Color(1, 1, 1), Math.min(1, (y + 0.3) / 1.6)));
  return m;
}

/**
 * Sculpted clay clouds: a drifting ring of fair-weather clouds, storm clouds
 * that roll in over the island, and a soft sea of clouds far below.
 */
export function buildClouds() {
  const group = new THREE.Group();
  const fairMat = makeClay({ vertexColors: true, roughness: 0.95, bump: 0.02, bumpFreq: 2, noAO: true, noSnow: true, rim: 1.6 });
  const stormMat = makeClay({ vertexColors: true, roughness: 0.95, bump: 0.02, bumpFreq: 2, noAO: true, noSnow: true, rim: 1.2 });
  const seaMat = makeClay({ vertexColors: true, roughness: 1, bump: 0.015, bumpFreq: 1.5, noAO: true, noSnow: true, rim: 1.8 });
  const fair = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(cloudGeo(Math.floor(rand(4, 8)), rand(2.5, 5)), fairMat);
    const s = rand(0.8, 1.6);
    m.scale.set(s, s * 0.85, s);
    m.userData = { a: (i / 12) * Math.PI * 2 + rand(-0.2, 0.2), r: rand(19, 34), y: rand(-3, 10), sp: rand(0.006, 0.014), th: rand(0, 1), s };
    m.castShadow = false;
    group.add(m);
    fair.push(m);
  }
  const storm = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(cloudGeo(7, 5.5), stormMat);
    const s = rand(1.2, 1.7);
    m.scale.set(s, s * 0.7, s);
    m.userData = { a: (i / 5) * Math.PI * 2, r: rand(3, 7), y: rand(12.5, 14), s };
    m.castShadow = true;
    m.visible = false;
    group.add(m);
    storm.push(m);
  }
  const sea = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(cloudGeo(6, 7, 0), seaMat);
    const s = rand(2.4, 3.6);
    m.scale.set(s, s * 0.45, s);
    const a = (i / 16) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(12, 40);
    m.position.set(Math.cos(a) * r, rand(-15, -11), Math.sin(a) * r);
    m.rotation.y = rand(0, 6);
    m.userData = { ph: rand(0, 6), base: m.position.clone() };
    group.add(m);
    sea.push(m);
  }
  const stormColor = new THREE.Color();
  return {
    group,
    pickables: [...fair, ...storm],
    update(t, env) {
      const cover = env.cloud;
      for (const c of fair) {
        const u = c.userData;
        const a = u.a + t * u.sp;
        c.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 0.2 + u.th * 6) * 0.4, Math.sin(a) * u.r);
        c.rotation.y = -a;
        const show = clamp((cover + 0.55 - u.th * 0.5) * 2, 0.25, 1);
        c.scale.set(u.s * show, u.s * 0.85 * show, u.s * show);
      }
      const rainy = clamp((cover - 0.55) / 0.4, 0, 1);
      for (const c of storm) {
        const u = c.userData;
        c.visible = rainy > 0.02;
        const a = u.a + t * 0.02;
        const r = lerp(28, u.r, rainy);
        c.position.set(Math.cos(a) * r, u.y + Math.sin(t * 0.3 + u.a) * 0.3, Math.sin(a) * r);
        c.rotation.y = a;
      }
      stormColor.setRGB(1, 1, 1).lerp(new THREE.Color(0.55, 0.57, 0.66), env.rain * 0.9 + env.storm * 0.3);
      stormMat.color.copy(stormColor);
      fairMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.75, 0.76, 0.82), cover * 0.4);
      for (const c of sea) c.position.y = c.userData.base.y + Math.sin(t * 0.15 + c.userData.ph) * 0.5;
    },
  };
}

export function buildRainbow() {
  const geo = new THREE.TorusGeometry(26, 2.2, 10, 80, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying vec2 vUv;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
      void main(){
        float v = vUv.y; // around the tube
        float band = abs(v - 0.5) * 2.0; // 0 outer edge .. 1 inner
        vec3 c = hue(0.8 * (1.0 - band));
        float a = smoothstep(0.0, 0.25, band) * smoothstep(1.0, 0.75, band) * uOpacity;
        a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(c * a * 0.6, a * 0.6);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(1, 1, 0.05);
  m.visible = false;
  return { mesh: m, mat };
}

/** Occasional shooting stars streaking over the night sky. */
export function buildShootingStars() {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4), transparent: true, opacity: 0, depthWrite: false });
  const geo = new THREE.CylinderGeometry(0.015, 0.09, 6, 6);
  geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  let tNext = 20, active = null;
  return {
    mesh: m,
    update(t, dt, env, onStar) {
      if (!active && env.stars > 0.6 && env.cloud < 0.6 && t > tNext) {
        const a = rand(0, Math.PI * 2);
        const start = new THREE.Vector3(Math.cos(a) * 60, rand(30, 50), Math.sin(a) * 60);
        const dir = new THREE.Vector3(-Math.sin(a) + rand(-0.3, 0.3), -rand(0.25, 0.45), Math.cos(a)).normalize();
        active = { start, dir, life: 0 };
        m.visible = true;
        m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().negate());
        onStar?.();
      }
      if (active) {
        active.life += dt;
        const k = active.life / 1.4;
        m.position.copy(active.start).addScaledVector(active.dir, active.life * 45);
        mat.opacity = Math.sin(Math.min(1, k) * Math.PI);
        if (k >= 1) { active = null; m.visible = false; tNext = t + rand(14, 40); }
      }
    },
  };
}
