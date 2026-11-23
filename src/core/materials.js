import * as THREE from 'three';
import { smoothstep } from './noise.js';

// Tiling 32^3 value-noise volume: one smooth texture fetch replaces eight hash evaluations.
function makeNoise3D(N = 32) {
  const data = new Uint8Array(N * N * N);
  let s = 1234567;
  for (let i = 0; i < data.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; data[i] = s >>> 24; }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function blankAO() {
  const t = new THREE.DataTexture(new Uint8Array([96, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/**
 * Global "world state" uniforms shared by every clay material. The weather /
 * time-of-day system writes these each frame, so the whole world reacts at
 * once: wind, wetness, snow, seasonal foliage, blossom, colour grade.
 */
export const uniforms = {
  uTime: { value: 0 },
  uTrunk: { value: new THREE.Vector2(3.8, -4.6) },
  uNoise3D: { value: makeNoise3D() },
  uClayDetail: { value: 1 },
  uWind: { value: 1 },
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uFoliageTint: { value: new THREE.Color(1, 1, 1) },
  uBlossomTint: { value: new THREE.Color(1, 1, 1) },
  uBlossomScale: { value: 1 },
  uAOMap: { value: blankAO() },
  uAOBounds: { value: new THREE.Vector4(-11.5, -11.5, 23, 23) },
  uRim: { value: new THREE.Color(0.35, 0.3, 0.3) },
  uGrade: { value: new THREE.Vector4(1.18, 1.08, 0, 0) }, // saturation, contrast
  uGradeTint: { value: new THREE.Color(1, 1, 1) },
  uGradeLift: { value: new THREE.Color(0, 0, 0) },
  uGradeOn: { value: 0 },
  uNight: { value: 0 },
};

// ---------------------------------------------------------------------------
// Wind: identical on GPU and CPU so lanterns, petals and grass sway together.
// ---------------------------------------------------------------------------
export function windVec(x, y, z, t, out) {
  const s = uniforms.uWind.value;
  const g = 0.65 + 0.35 * Math.sin(t * 0.37 + x * 0.06) * Math.sin(t * 0.23 + 1.7);
  const a = Math.sin(t * 1.3 + x * 0.6 + z * 0.4) + 0.5 * Math.sin(t * 2.7 + z * 1.1 + y * 0.7);
  const b = Math.sin(t * 1.1 + z * 0.5 - x * 0.3) + 0.5 * Math.sin(t * 2.3 + x * 0.9 + y * 0.3);
  return out.set((a * 0.8 + 0.7) * g * s, Math.sin(t * 1.9 + x + z) * 0.15 * g * s, b * 0.6 * g * s);
}

export function treeSwayWeight(x, y, z) {
  const tr = uniforms.uTrunk.value;
  return smoothstep(2.5, 9.5, y) * (0.012 + 0.011 * Math.hypot(x - tr.x, z - tr.y));
}

const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uTrunk;
uniform float uSwayAmp;
uniform float uWind;
uniform float uBlossomScale;
vec3 windVec(vec3 p, float t) {
  float g = 0.65 + 0.35 * sin(t * 0.37 + p.x * 0.06) * sin(t * 0.23 + 1.7);
  float a = sin(t * 1.3 + p.x * 0.6 + p.z * 0.4) + 0.5 * sin(t * 2.7 + p.z * 1.1 + p.y * 0.7);
  float b = sin(t * 1.1 + p.z * 0.5 - p.x * 0.3) + 0.5 * sin(t * 2.3 + p.x * 0.9 + p.y * 0.3);
  return vec3((a * 0.8 + 0.7) * g, sin(t * 1.9 + p.x + p.z) * 0.15 * g, b * 0.6 * g) * uWind;
}
`;

export const GRADE_GLSL = /* glsl */ `
uniform vec4 uGrade;
uniform vec3 uGradeTint;
uniform vec3 uGradeLift;
vec3 clayGrade(vec3 c) {
  c = c * uGradeTint + uGradeLift;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.x);
  c = (c - 0.5) * uGrade.y + 0.5;
  return max(c, 0.0);
}
`;

const NOISE_GLSL = /* glsl */ `
uniform highp sampler3D uNoise3D;
uniform float uClayDetail;
float clayNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return texture(uNoise3D, (i + f + 0.5) / 32.0).r;
}
vec3 clayPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos));
  vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

/**
 * Polymer-clay material: matte standard shading + a soft velvet rim, a
 * world-space fingerprint bump (no UVs), contact darkening from a terrain
 * height map, and reactions to the world (wet, snow, seasons, grade).
 * Flags: foliage, blossom, terrain, noAO, noSnow, wind ('attr' | 'tree').
 */
export function makeClay(o = {}) {
  const {
    color = 0xffffff, vertexColors = false, roughness = 0.82, side = THREE.FrontSide,
    bump = 0.03, bumpFreq = 6.5, wind = null, swayAmp = 0.07, tint = 0.07, kind = 'clay',
    foliage = false, blossom = false, terrain = false, noAO = false, noSnow = false, rim = 1,
    emissive = null, emissiveIntensity = 0, transparent = false, opacity = 1,
  } = o;
  const m = new THREE.MeshStandardMaterial({ color, vertexColors, roughness, metalness: 0, side, transparent, opacity });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  m.userData.kind = kind;
  const defs = [];
  if (foliage) defs.push('#define FOLIAGE');
  if (blossom) defs.push('#define BLOSSOM');
  if (terrain) defs.push('#define TERRAIN');
  if (noAO) defs.push('#define NO_AO');
  if (noSnow) defs.push('#define NO_SNOW');
  const D = defs.join('\n');
  m.onBeforeCompile = (sh) => {
    for (const k of Object.keys(uniforms)) sh.uniforms[k] = uniforms[k];
    sh.uniforms.uSwayAmp = { value: swayAmp };
    sh.uniforms.uBump = { value: bump };
    sh.uniforms.uBumpFreq = { value: bumpFreq };
    sh.uniforms.uTint = { value: tint };
    sh.uniforms.uRimK = { value: rim };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${D}
        varying vec3 vClayPos;
        varying vec3 vClayNrm;
        ${wind === 'attr' ? 'attribute float aSway;' : ''}
        ${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef BLOSSOM
          transformed *= uBlossomScale;
        #endif`)
      .replace('#include <project_vertex>', `
        vec4 wpos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpos = instanceMatrix * wpos;
        #endif
        wpos = modelMatrix * wpos;
        ${wind === 'tree' ? 'wpos.xyz += windVec(wpos.xyz, uTime) * smoothstep(2.5, 9.5, wpos.y) * (0.012 + 0.011 * length(wpos.xz - uTrunk));' : ''}
        ${wind === 'attr' ? 'wpos.xyz += windVec(wpos.xyz, uTime) * aSway * uSwayAmp;' : ''}
        vClayPos = wpos.xyz;
        vClayNrm = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
        vec4 mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;
      `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${D}
        varying vec3 vClayPos;
        varying vec3 vClayNrm;
        uniform float uBump;
        uniform float uBumpFreq;
        uniform float uTint;
        uniform float uRimK;
        uniform float uWet;
        uniform float uSnow;
        uniform vec3 uFoliageTint;
        uniform vec3 uBlossomTint;
        uniform sampler2D uAOMap;
        uniform vec4 uAOBounds;
        uniform vec3 uRim;
        uniform float uGradeOn;
        ${NOISE_GLSL}
        ${GRADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float tn = clayNoise(vClayPos * 1.3) * 0.6 + clayNoise(vClayPos * 4.3 + 11.0) * 0.4 * uClayDetail + 0.2 * (1.0 - uClayDetail);
        diffuseColor.rgb *= 1.0 + (tn - 0.5) * uTint * 2.0;
        #ifdef FOLIAGE
          #ifdef TERRAIN
            diffuseColor.rgb *= mix(vec3(1.0), uFoliageTint, 0.65);
          #else
            diffuseColor.rgb *= uFoliageTint;
          #endif
        #endif
        #ifdef BLOSSOM
          diffuseColor.rgb *= uBlossomTint;
        #endif
        #ifndef NO_AO
        {
          vec2 aoUV = (vClayPos.xz - uAOBounds.xy) / uAOBounds.zw;
          if (aoUV.x > 0.0 && aoUV.x < 1.0 && aoUV.y > 0.0 && aoUV.y < 1.0) {
            vec4 aoS = texture2D(uAOMap, aoUV);
            #ifdef TERRAIN
              diffuseColor.rgb *= 1.0 - aoS.g * 0.6;
            #else
              float th = aoS.r * 4.0 - 1.5;
              diffuseColor.rgb *= mix(0.58, 1.0, smoothstep(-0.05, 0.6, vClayPos.y - th));
            #endif
          }
        }
        #endif
        float snowM = 0.0;
        #ifndef NO_SNOW
          snowM = smoothstep(0.42, 0.85, vClayNrm.y + (tn - 0.5) * 0.5) * uSnow;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.02), snowM);
        #endif
        float wetM = uWet * smoothstep(-0.3, 0.7, vClayNrm.y) * (1.0 - snowM);
        diffuseColor.rgb *= 1.0 - wetM * 0.3;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.22, wetM);
        roughnessFactor = mix(roughnessFactor, 0.95, snowM);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uBump > 0.0) {
          vec3 P = vClayPos * uBumpFreq;
          float hh = clayNoise(P) * 0.55 + clayNoise(P * 2.3 + 7.1) * 0.3;
          if (uClayDetail > 0.5) hh += clayNoise(P * 5.9 + 3.3) * 0.15;
          vec3 dpx = dFdx(vClayPos);
          vec3 dpy = dFdy(vClayPos);
          float px = max(length(dpx), 1e-5);
          float py = max(length(dpy), 1e-5);
          float fadeB = 1.0 - smoothstep(0.12, 0.5, max(px, py) * uBumpFreq);
          vec2 dH = vec2(dFdx(hh) / px, dFdy(hh) / py) * uBump * fadeB * (1.0 - wetM * 0.6);
          normal = clayPerturb(-vViewPosition, normal, dH, faceDirection);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rimF = pow(1.0 - ndv, 2.6);
          outgoingLight += diffuseColor.rgb * uRim * rimF * uRimK;
        }
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        if (uGradeOn > 0.5) gl_FragColor.rgb = clayGrade(gl_FragColor.rgb);`);
  };
  m.customProgramCacheKey = () => `clay2|${wind}|${bump > 0 ? 1 : 0}|${D}`;
  return m;
}

const cache = new Map();
/** Cached solid-colour clay material. */
export function clay(color, o = {}) {
  const key = `${color}|${JSON.stringify(o)}`;
  if (!cache.has(key)) cache.set(key, makeClay({ color, ...o }));
  return cache.get(key);
}

export const eyeMat = new THREE.MeshPhysicalMaterial({
  color: 0x21140f, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
});
export const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xfffaf2 });

/** Emissive "glow" material (windows, lanterns, flames). Optionally graded at tier 0. */
export function glowMat(color, emissive, intensity = 1.6) {
  const m = new THREE.MeshStandardMaterial({
    color, emissive: emissive ?? color, emissiveIntensity: intensity, roughness: 0.95, metalness: 0,
  });
  m.onBeforeCompile = (sh) => {
    for (const k of ['uGrade', 'uGradeTint', 'uGradeLift', 'uGradeOn']) sh.uniforms[k] = uniforms[k];
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uGradeOn;\n${GRADE_GLSL}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\nif (uGradeOn > 0.5) gl_FragColor.rgb = clayGrade(gl_FragColor.rgb);`);
  };
  m.customProgramCacheKey = () => 'glow';
  return m;
}

/** Soft additive glow shell (a real 3D sphere whose edges fade) used for lantern halos. */
export function haloMat(color, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
        gl_FragColor = vec4(uColor * f * uStrength, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// Materials used by merged ("baked") static geometry. Colours live in vertex colours.
export const bakedMaterials = {
  clay: makeClay({ vertexColors: true, wind: 'attr', swayAmp: 0.07 }),
  clay2: makeClay({ vertexColors: true, wind: 'attr', swayAmp: 0.07, side: THREE.DoubleSide }),
  foliage: makeClay({ vertexColors: true, wind: 'attr', swayAmp: 0.07, foliage: true }),
  foliage2: makeClay({ vertexColors: true, wind: 'attr', swayAmp: 0.07, foliage: true, side: THREE.DoubleSide }),
  gloss: makeClay({ vertexColors: true, roughness: 0.42, bump: 0.006 }),
  bark: makeClay({ vertexColors: true, wind: 'tree', bump: 0.05, bumpFreq: 4.5, tint: 0.1 }),
  rock: makeClay({ vertexColors: true, bump: 0.06, bumpFreq: 3.5, tint: 0.12, noAO: true }),
};
