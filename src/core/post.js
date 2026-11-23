import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { uniforms as U, GRADE_GLSL } from './materials.js';

// Gentle miniature-photography finish: tilt-shift falloff, warm grade, vignette, grain.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBlur: { value: 1 },
    uGrade: U.uGrade, uGradeTint: U.uGradeTint, uGradeLift: U.uGradeLift,
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uBlur;
    varying vec2 vUv;
    ${GRADE_GLSL}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      float d = abs(uv.y - 0.5);
      float amt = smoothstep(0.3, 0.75, d) * uBlur;
      if (amt > 0.001) {
        vec3 acc = col;
        float wsum = 1.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = fi * 2.39996;
          float r = sqrt(fi + 0.5) / sqrt(12.0);
          vec2 o = vec2(cos(a), sin(a)) * r * amt * 5.0 / uRes;
          acc += texture2D(tDiffuse, uv + o).rgb;
          wsum += 1.0;
        }
        col = acc / wsum;
      }
      // warm, soft grade
      col = clayGrade(col);
      // vignette
      vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float v = smoothstep(1.25, 0.25, length(q));
      col *= mix(0.8, 1.0, v);
      // grain
      col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * 0.016;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.5, 1.18);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.uRes.value.copy(size);
  composer.addPass(finish);

  return {
    composer, gtao, bloom, finish,
    setSize(w, h) {
      composer.setSize(w, h);
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      finish.uniforms.uRes.value.copy(s);
    },
    setPixelRatio(pr) { composer.setPixelRatio(pr); },
    render(t) { finish.uniforms.uTime.value = t; composer.render(); },
  };
}
