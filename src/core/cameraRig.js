import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, easeInOut, lerp } from './noise.js';

const VIEWS = {
  overview: { target: [0.4, 2.6, 0.2], theta: -0.18, phi: 1.18, radius: 'fit' },
  treehouse: { target: [3.4, 5.0, -2.3], theta: 0.52, phi: 1.2, radius: 11.5 },
  pond: { target: [-4.6, 0.6, 4.4], theta: 0.35, phi: 1.12, radius: 8.5 },
  village: { target: [0.2, 0.9, 3.4], theta: 0.15, phi: 1.2, radius: 9 },
  garden: { target: [6.4, 0.9, -0.2], theta: 1.05, phi: 1.15, radius: 7.5 },
  beneath: { target: [0, -2.6, 0], theta: 0.6, phi: 1.78, radius: 'fit' },
};

export function createRig(camera, dom, { collide, pickables, onView, onPick, onHover }) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 46;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 2.05;
  controls.autoRotateSpeed = 0.3;

  let tween = null;
  let lastInteract = performance.now();
  let drift = false;
  let follow = null;

  const fitRadius = () => {
    const vhalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hhalf = Math.atan(Math.tan(vhalf) * camera.aspect);
    const w = camera.aspect < 1 ? 12.5 : 14.2;
    return Math.max(w / Math.tan(hhalf), 9.6 / Math.tan(vhalf));
  };
  const sphOf = (pos, target) => {
    const s = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    return { theta: s.theta, phi: s.phi, radius: s.radius };
  };
  function killMomentum() {
    if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
    if (controls._panOffset) controls._panOffset.set(0, 0, 0);
    if (controls._scale !== undefined) controls._scale = 1;
  }

  function goTo(nameOrView, dur = 2.4) {
    const v = typeof nameOrView === 'string' ? VIEWS[nameOrView] : nameOrView;
    if (typeof nameOrView === 'string') follow = null;
    const from = { target: controls.target.clone(), ...sphOf(camera.position, controls.target) };
    const to = {
      target: v.target.isVector3 ? v.target.clone() : new THREE.Vector3(...v.target),
      theta: v.theta ?? from.theta, phi: v.phi ?? from.phi,
      radius: v.radius === 'fit' ? fitRadius() : v.radius ?? from.radius,
    };
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    to.theta = from.theta + dTheta;
    controls.maxDistance = Math.max(controls.maxDistance, to.radius * 1.4);
    killMomentum();
    tween = { from, to, t: 0, dur };
    if (typeof nameOrView === 'string') onView?.(nameOrView);
  }

  function setImmediate(name, radiusMul = 1, thetaOff = 0, phiOff = 0) {
    const v = VIEWS[name];
    const target = new THREE.Vector3(...v.target);
    const r = (v.radius === 'fit' ? fitRadius() : v.radius) * radiusMul;
    controls.target.copy(target);
    camera.position.setFromSpherical(new THREE.Spherical(r, v.phi + phiOff, v.theta + thetaOff)).add(target);
    controls.maxDistance = Math.max(46, fitRadius() * 1.5);
    controls.update();
  }

  function startFollow(c) {
    follow = c;
    const head = c.headWorld();
    const s = sphOf(camera.position, controls.target);
    goTo({ target: head.add(new THREE.Vector3(0, -0.2, 0)), theta: s.theta, phi: clamp(s.phi, 0.7, 1.3), radius: 4.2 + c.scale * 1.2 }, 1.4);
    onView?.(null);
  }

  controls.addEventListener('start', () => {
    tween = null;
    lastInteract = performance.now();
    if (!drift) controls.autoRotate = false;
    onView?.(null);
  });

  // click (not drag) to interact, double-click to follow / inspect
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const pick = (e) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables(), false)[0];
  };
  dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  dom.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 6 && performance.now() - down.t < 450) {
      const h = pick(e);
      if (h) onPick?.(h, false);
    }
    down = null;
  });
  dom.addEventListener('dblclick', (e) => {
    const h = pick(e);
    if (!h) return;
    const c = h.object.userData.character;
    if (c) { startFollow(c); onPick?.(h, true); return; }
    follow = null;
    const s = sphOf(camera.position, controls.target);
    goTo({ target: h.point.clone(), theta: s.theta, phi: clamp(s.phi, 0.6, 1.3), radius: clamp(camera.position.distanceTo(h.point) * 0.55, 3.2, 9) }, 1.6);
    lastInteract = performance.now();
  });
  let hoverT = 0;
  dom.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - hoverT < 90 || down) return;
    hoverT = now;
    const h = pick(e);
    onHover?.(h?.object.userData.character || null, e.clientX, e.clientY);
  });
  dom.addEventListener('pointerleave', () => onHover?.(null));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { follow = null; onView?.(null); } });

  const tmpT = new THREE.Vector3();
  function update(dt) {
    if (tween) {
      tween.t += dt / tween.dur;
      const k = easeInOut(Math.min(1, tween.t));
      const { from, to } = tween;
      if (follow) to.target.copy(follow.headWorld()).add(new THREE.Vector3(0, -0.2, 0));
      tmpT.lerpVectors(from.target, to.target, k);
      const lift = Math.sin(Math.PI * k) * Math.min(0.25, Math.abs(to.theta - from.theta) * 0.08);
      const sph = new THREE.Spherical(lerp(from.radius, to.radius, k), lerp(from.phi, to.phi, k) - lift, lerp(from.theta, to.theta, k));
      controls.target.copy(tmpT);
      camera.position.setFromSpherical(sph).add(tmpT);
      camera.lookAt(tmpT);
      if (tween.t >= 1) { tween = null; killMomentum(); }
    } else {
      if (follow) {
        if (follow.inside) follow = null;
        else {
          const want = follow.headWorld().add(new THREE.Vector3(0, -0.2, 0));
          const delta = want.sub(controls.target).multiplyScalar(1 - Math.exp(-4 * dt));
          controls.target.add(delta);
          camera.position.add(delta);
        }
      }
      const idle = performance.now() - lastInteract > 45000;
      controls.autoRotate = (drift || idle) && !follow;
      controls.update(dt);
      const tg = controls.target;
      const h = Math.hypot(tg.x, tg.z);
      if (h > 11) { tg.x *= 11 / h; tg.z *= 11 / h; }
      tg.y = clamp(tg.y, -5, 10);
    }
    if (collide(camera.position)) camera.lookAt(controls.target);
  }

  return {
    controls, goTo, setImmediate, update, fitRadius, startFollow,
    get following() { return follow; },
    stopFollow() { follow = null; },
    setDrift(v) { drift = v; controls.autoRotate = v; lastInteract = performance.now(); },
    get drifting() { return drift; },
    refit() { controls.maxDistance = Math.max(46, fitRadius() * 1.5); },
  };
}
