import * as THREE from 'three';
import { rand, damp, clamp, lerp, noise1, chance } from '../core/noise.js';
import { walkHeight } from '../world/island.js';
import { bakeLocal } from '../core/geo.js';
import { makeClay, eyeMat, sparkleMat } from '../core/materials.js';

const rigClay = makeClay({ vertexColors: true, bump: 0.028, bumpFreq: 7, roughness: 0.78, noSnow: true, rim: 1.3 });
function mergeRig(r) {
  const live = (m) => { if (m) m.userData.live = true; };
  for (const e of r.eyes) { live(e.happy); live(e.closed); }
  live(r.mouth); r.cheeks.forEach(live); live(r.extras.throat);
  bakeLocal(r.root, (m) => (m === eyeMat ? eyeMat : m === sparkleMat ? sparkleMat : m.isMeshStandardMaterial && !m.emissive?.getHex() ? rigClay : null));
}

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// arm poses: [x (forward raise, negative = up/forward), out (sideways, + = away from body)]
const ARM_POSES = {
  rest: null,
  hold: [[-1.25, -0.45], [-1.25, -0.45]],
  hug: [[-1.45, -0.05], [-1.45, -0.05]],
  cheer: [[-0.6, 2.5], [-0.6, 2.5]],
  warm: [[-1.15, -0.25], [-1.15, -0.25]],
  cover: [[-2.55, -0.62], [-2.55, -0.62]],
  stretch: [[-2.95, 0.35], [-2.95, 0.35]],
  shrug: [[-0.35, 0.95], [-0.35, 0.95]],
  stomp: [[0.25, 0.2], [0.25, 0.2]],
  point: [null, [-1.55, 0.15]],
  wave: [null, [-0.35, 2.55]],
  water: [null, [-0.95, -0.15]],
  offer: [[-1.35, -0.3], [-1.35, -0.3]],
  rod: [[-1.0, -0.35], [-1.0, -0.35]],
};

export class Character {
  constructor(world, def) {
    this.world = world;
    this.def = def;
    this.name = def.name;
    this.species = def.species;
    this.rig = def.rig;
    this.p = def.rig.params;
    this.traits = def.traits;
    this.scale = def.scale ?? 1;
    mergeRig(this.rig);
    this.rig.root.scale.setScalar(this.scale);
    this.pos = def.start.clone();
    this.yaw = def.yaw ?? 0;
    this.targetYaw = this.yaw;
    this.speed = 0;
    this.path = null; this.moving = false; this.arrived = false; this.run = false; this.stopDist = 0.15;
    this.yOverride = null; this.direct = null;
    this.flight = null;
    this.phase = 0; this.lastStep = 0;
    this.sit = 0; this.sitT = 0; this.lie = 0; this.lieT = 0; this.back = 0; this.backT = 0; this.curl = 0; this.curlT = 0;
    this.jump = 0; this.jumpT = -1;
    this.gesture = 'rest'; this.gestureT = 0;
    this.lookTarget = null; this.lookT = 0;
    this.headYaw = 0; this.headPitch = 0; this.headRoll = 0; this.nod = 0; this.shake = 0; this.tilt = 0;
    this.talkT = 0; this.talkKind = 'chat';
    this.eyeMode = null; this.emotion = 'neutral'; this.emotionT = 0;
    this.blinkT = rand(1, 4); this.blink = 0;
    this.blush = 0;
    this.arms = (this.rig.arms || []).map(() => ({ x: 0, out: 0 }));
    this.earLag = 0; this.prevHeadYaw = 0; this.earTwitch = 0; this.earTwitchSide = 0; this.twitchT = rand(2, 6);
    this.needs = { energy: rand(0.7, 1), social: rand(0.2, 0.6), fun: rand(0.2, 0.6), hunger: rand(0.1, 0.4) };
    this.activity = null; this.label = 'wandering about'; this.mood = 0.4;
    this.held = null;
    this.inside = false;
    this.paused = 0;
    this.greetCD = rand(5, 15);
    this.stuckT = 0; this.lastPos = this.pos.clone();
    this.swayPh = rand(0, 6);
    this.wet = 0;
    this.home = def.home;
    this.root = this.rig.root;
    this.root.position.copy(this.pos);
    this.root.traverse((o) => { if (o.isMesh) o.userData.character = this; });
  }

  // ---- intentions --------------------------------------------------------
  goTo(target, { run = false, stop = 0.15 } = {}) {
    this.direct = null;
    const path = this.world.nav.find(this.pos, target);
    this.path = path && path.length ? path : [target.clone().setY(0)];
    this.moving = true; this.arrived = false; this.run = run; this.stopDist = stop;
    this.stuckT = 0;
  }
  goDirect(points, { run = false } = {}) {
    this.direct = points.map((p) => p.clone());
    this.directStartY = this.yOverride ?? walkHeight(this.pos.x, this.pos.z);
    this.path = this.direct.map((p) => p.clone());
    this.moving = true; this.arrived = false; this.run = run; this.stopDist = 0.06;
  }
  stop() { this.path = null; this.moving = false; }
  flyTo(target, { height = 1.5, speed = 2.6 } = {}) {
    const from = this.root.position.clone();
    const dist = from.distanceTo(target);
    this.flight = { from, to: target.clone(), t: 0, dur: Math.max(0.8, dist / speed), apex: Math.max(from.y, target.y) + height + dist * 0.15 };
    this.moving = false; this.path = null;
  }
  face(p) { this.targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  look(t, dur = 2) { this.lookTarget = t; this.lookT = dur; }
  setGesture(g, dur = 0) { this.gesture = g; this.gestureT = dur; }
  setEmotion(e, dur = 4) { this.emotion = e; this.emotionT = dur; }
  say(kind, dur = rand(0.8, 1.6)) {
    this.talkT = dur; this.talkKind = kind;
    this.world.audio?.speak(this, kind, dur);
  }
  emote(type, opts) {
    const h = this.headWorld();
    h.y += 0.32 * this.scale + 0.15;
    this.world.emotes.spawn(type, h, opts);
  }
  hop() { this.jumpT = 0; }
  headWorld() { return this.rig.head.getWorldPosition(new THREE.Vector3()); }
  hold(item) {
    this.drop();
    if (!item) return;
    this.held = item;
    this.rig.hand.add(item);
    item.position.set(0, 0, 0);
    item.scale.setScalar(1 / Math.max(0.6, this.scale));
    this.world.audio?.sfx('pop', this.pos);
  }
  drop() {
    if (this.held) { this.held.parent?.remove(this.held); this.held = null; }
  }
  get busySocial() { return this.activity?.social; }
  get asleep() { return this.eyeMode === 'closed' && this.lie > 0.5; }

  // ---- per frame -----------------------------------------------------------------------
  update(dt, t) {
    if (this.paused > 0) {
      this.paused -= dt;
      this.speed = damp(this.speed, 0, 8, dt);
    } else if (this.activity) {
      const r = this.activity.gen.next(dt);
      if (r.done) this.world.director.finish(this);
    }
    this.updateNeeds(dt);
    if (this.flight) this.updateFlight(dt);
    else if (this.moving && this.paused <= 0) this.followPath(dt);
    else this.speed = damp(this.speed, 0, 6, dt);
    this.animate(dt, t);
  }

  updateNeeds(dt) {
    const n = this.needs, T = this.traits;
    const sleeping = this.asleep;
    n.energy = clamp(n.energy + (sleeping ? 0.03 : -0.0035 * (this.run ? 2.5 : 1)) * dt, 0, 1);
    n.social = clamp(n.social + (this.busySocial ? -0.04 : 0.006 * T.social) * dt, 0, 1);
    n.fun = clamp(n.fun + (this.activity?.fun ? -0.035 : 0.005 * T.playful) * dt, 0, 1);
    n.hunger = clamp(n.hunger + 0.0025 * dt, 0, 1);
    this.emotionT -= dt;
    if (this.emotionT <= 0 && this.emotion !== 'neutral') this.emotion = 'neutral';
    this.greetCD -= dt;
    const w = this.world.env;
    const exposed = !this.inside && !this.sheltered;
    this.wet = clamp(this.wet + (w.rain > 0.2 && exposed ? 0.05 : -0.01) * dt, 0, 1);
  }

  followPath(dt) {
    const wp = this.path?.[0];
    if (!wp) { this.moving = false; this.arrived = true; return; }
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const last = this.path.length === 1;
    if (dist < (last ? this.stopDist : 0.22)) {
      if (this.direct) this.directStartY = wp.y;
      this.path.shift();
      if (!this.path.length) {
        this.moving = false; this.arrived = true;
        if (!this.direct) this.yOverride = this.yOverride; // keep
        return;
      }
      return;
    }
    const want = Math.atan2(dx, dz);
    const diff = wrap(want - this.yaw);
    const turnRate = this.run ? 7 : 5;
    this.yaw += clamp(diff, -turnRate * dt, turnRate * dt);
    this.targetYaw = this.yaw;
    const align = Math.max(0, Math.cos(diff));
    let target = (this.run ? this.p.run : this.p.walk) * (0.2 + 0.8 * align * align) * (this.traits.pace ?? 1);
    if (last && dist < 0.5) target *= 0.4 + dist;
    this.speed = damp(this.speed, target, 5, dt);
    let sp = this.speed;
    if (this.p.gait === 'hop' || this.p.gait === 'birdhop') sp *= 0.35 + 1.5 * Math.max(0, Math.sin(this.phase));
    const step = Math.min(sp * dt, dist);
    this.pos.x += Math.sin(this.yaw) * step;
    this.pos.z += Math.cos(this.yaw) * step;
    if (this.direct) {
      const segLen = Math.max(0.001, Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) + step);
      this.yOverride = lerp(this.directStartY ?? wp.y, wp.y, clamp(1 - (dist - step) / Math.max(0.001, segLen), 0, 1));
    }
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      if (this.pos.distanceTo(this.lastPos) < 0.15 && !this.direct) {
        // nudge and re-plan
        this.pos.x += rand(-0.15, 0.15); this.pos.z += rand(-0.15, 0.15);
        const goal = this.path[this.path.length - 1];
        this.goTo(goal, { run: this.run, stop: this.stopDist });
      }
      this.stuckT = 0;
      this.lastPos.copy(this.pos);
    }
  }

  updateFlight(dt) {
    const f = this.flight;
    f.t += dt / f.dur;
    const k = Math.min(1, f.t);
    const e = k * k * (3 - 2 * k);
    const a = f.from, b = f.to;
    const x = lerp(a.x, b.x, e), z = lerp(a.z, b.z, e);
    const y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * f.apex + e * e * b.y;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.set(x, 0, z);
    if (Math.hypot(x - px, z - pz) > 1e-4) { this.yaw = Math.atan2(x - px, z - pz); this.targetYaw = this.yaw; }
    this.yOverride = y;
    this.flying = k < 1;
    if (k >= 1) { this.flight = null; this.flying = false; this.yOverride = b.y; this.arrived = true; }
  }

  // ---- animation ---------------------------------------------------------------
  animate(dt, t) {
    const r = this.rig, P = this.p;
    this.root.visible = !this.inside;
    if (this.inside) return;
    // root
    const ground = walkHeight(this.pos.x, this.pos.z);
    const y = this.yOverride ?? ground;
    if (!this.moving && !this.flight) this.yaw += clamp(wrap(this.targetYaw - this.yaw), -4 * dt, 4 * dt);
    this.root.position.set(this.pos.x, y, this.pos.z);
    this.root.rotation.y = this.yaw;
    // smoothed pose weights
    this.sit = damp(this.sit, this.sitT, 6, dt);
    this.lie = damp(this.lie, this.lieT, 3, dt);
    this.back = damp(this.back, this.backT, 3, dt);
    this.curl = damp(this.curl, this.curlT, 7, dt);
    const k = clamp(this.speed / P.walk, 0, 1.8);
    const gaitMul = { hop: 0.55, walk: 1, trot: 1.2, waddle: 1.3, scurry: 1.6, birdhop: 0.9 }[P.gait] ?? 1;
    const prevPhase = this.phase;
    this.phase += (this.speed / P.stepLen) * dt * Math.PI * gaitMul;
    if (this.speed > 0.1 && Math.floor(this.phase / Math.PI) !== Math.floor(prevPhase / Math.PI) && !this.flight) {
      this.world.audio?.step(this);
      if (this.world.onStep) this.world.onStep(this);
    }
    const s = Math.sin(this.phase);
    r.body.position.set(0, 0, 0);
    r.body.rotation.set(0, 0, 0);
    r.torso.rotation.set(0, 0, 0);
    let legX = [0, 0, 0, 0];
    const wobble = Math.sin(t * 0.7 + this.swayPh) * 0.02;
    switch (P.gait) {
      case 'hop': {
        const lift = Math.max(0, s) * (P.hopHeight ?? 0.15) * Math.min(1, k);
        r.body.position.y += lift;
        legX = [s > 0 ? -0.55 * k : 0.25 * k, s > 0 ? -0.55 * k : 0.25 * k];
        r.torso.rotation.x += 0.1 * Math.min(1, k) * s;
        break;
      }
      case 'birdhop': r.body.position.y += Math.max(0, s) * 0.06 * Math.min(1, k); break;
      case 'trot':
        legX = [s * 0.6 * k, -s * 0.6 * k, -s * 0.6 * k, s * 0.6 * k];
        r.body.position.y += Math.abs(Math.sin(this.phase * 2)) * 0.02 * k;
        break;
      case 'waddle':
        legX = [s * 0.4 * k, -s * 0.4 * k];
        r.body.rotation.z += s * 0.13 * Math.min(1, k);
        break;
      default: // walk / scurry
        legX = [s * 0.65 * k, -s * 0.65 * k, -s * 0.5 * k, s * 0.5 * k];
        r.body.position.y += Math.abs(s) * 0.035 * k;
        r.body.rotation.z += s * 0.05 * k;
    }
    r.torso.rotation.x += 0.08 * Math.min(1, k) * (this.run ? 1.6 : 1);
    // poses: sit / loaf-sleep / lie on back / curl / jump
    const drop = this.sit * P.sitDrop + this.lie * P.sitDrop * 1.4 + this.back * P.sitDrop * 1.2;
    r.body.position.y -= drop;
    r.torso.rotation.x += -0.08 * this.sit + 0.22 * this.lie - 1.2 * this.back;
    r.torso.rotation.z += wobble * (1 - k);
    if (this.jumpT >= 0) {
      this.jumpT += dt / 0.45;
      r.body.position.y += Math.sin(Math.min(1, this.jumpT) * Math.PI) * 0.28;
      if (this.jumpT >= 1) this.jumpT = -1;
    }
    for (let i = 0; i < r.legs.length; i++) {
      const L = r.legs[i];
      const seatFold = P.quad ? 0.9 * (this.sit + this.lie) : -1.35 * this.sit - 1.0 * this.lie - 0.6 * this.back;
      L.rotation.x = legX[i] ?? 0;
      L.rotation.x += seatFold * (P.quad && i > 1 ? -1 : 1);
      L.scale.setScalar(1 - this.curl);
    }
    // breathing + curl
    const br = Math.sin(t * (1.8 - this.lie * 0.9) + this.swayPh);
    const breath = 0.012 * (1 + this.lie * 1.5);
    r.torso.scale.set(1 - br * breath * 0.5 + this.curl * 0.15, 1 + br * breath - this.curl * 0.25, 1 - br * breath * 0.5 + this.curl * 0.1);
    r.body.position.y -= this.curl * 0.05;
    // flight wings
    if (r.wings.length) {
      const flap = this.flight ? Math.sin(t * 22) * 1.0 + 0.4 : 0;
      const ruffle = this.gesture === 'cheer' ? 0.9 + Math.sin(t * 14) * 0.3 : this.gesture === 'shrug' ? 0.5 : 0;
      r.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (flap + ruffle); });
      if (this.flight) { r.body.rotation.x = 0.25; r.torso.rotation.x += 0.2; }
    }
    // arms
    if (r.arms.length && !r.wings.length) {
      const pose = ARM_POSES[this.gesture];
      this.arms.forEach((a, i) => {
        let tx = (P.armRest[0] ?? -0.3) + (i ? -1 : 1) * s * 0.45 * Math.min(1, k);
        let to = P.armRest[1] ?? 0.2;
        if (this.sit > 0.5) tx -= 0.35;
        const pi = pose && pose[i];
        if (pi) { tx = pi[0]; to = pi[1]; }
        if (this.gesture === 'wave' && i === 1) to += Math.sin(t * 13) * 0.35;
        if (this.gesture === 'cheer') to += Math.sin(t * 9 + i * 3) * 0.25;
        if (this.gesture === 'warm') tx += Math.sin(t * 3 + i * 2) * 0.12;
        if (this.gesture === 'eat') { tx = -1.3 - Math.max(0, Math.sin(t * 5)) * 0.6; to = -0.45; }
        if (this.gesture === 'clap') { tx = -1.3; to = -0.55 + Math.abs(Math.sin(t * 9)) * 0.5; }
        if (this.talkT > 0 && this.gesture === 'rest') { tx = -0.55 + Math.sin(t * 4.3 + i * 2.1) * 0.35; to = 0.35 + Math.sin(t * 3.1 + i) * 0.25; }
        if (this.gesture === 'stomp') { tx = 0.25; to = 0.2; }
        a.x = damp(a.x, tx, 10, dt); a.out = damp(a.out, to, 10, dt);
        const arm = r.arms[i];
        arm.rotation.x = a.x;
        arm.rotation.z = (i === 0 ? -1 : 1) * a.out;
      });
    }
    if (this.gesture === 'stomp') r.body.position.y += Math.abs(Math.sin(t * 10)) * 0.05;
    if (this.gestureT > 0) { this.gestureT -= dt; if (this.gestureT <= 0) this.gesture = 'rest'; }
    // head look
    let wantYaw = noise1(t * 0.23, this.swayPh) * 0.35, wantPitch = noise1(t * 0.19, this.swayPh + 3) * 0.12;
    if (this.lookT > 0) this.lookT -= dt; else this.lookTarget = null;
    if (this.lookTarget) {
      const tp = this.lookTarget.isVector3 ? this.lookTarget : this.lookTarget.headWorld?.() ?? this.lookTarget.pos;
      const hp = r.head.getWorldPosition(tmp);
      const dx = tp.x - hp.x, dz = tp.z - hp.z;
      const range = P.headRange ?? 1.25;
      const rel = wrap(Math.atan2(dx, dz) - this.yaw);
      wantYaw = clamp(rel, -range, range);
      wantPitch = clamp(-Math.atan2(tp.y - hp.y, Math.hypot(dx, dz)), -0.6, 0.5);
      if (Math.abs(rel) > range * 0.85 && !this.moving && this.sit < 0.3 && this.lie < 0.3 && !this.flight) this.targetYaw = Math.atan2(dx, dz);
    }
    if (this.talkT > 0) {
      this.talkT -= dt;
      wantPitch += Math.sin(t * 9) * 0.05;
      if (this.talkKind === 'laugh') { wantPitch -= 0.15; r.body.position.y += Math.abs(Math.sin(t * 16)) * 0.03; }
    }
    wantPitch += this.lie * 0.3 - this.back * 0.4 + Math.sin(t * 8) * 0.18 * this.nod;
    wantYaw += Math.sin(t * 9) * 0.4 * this.shake;
    this.nod = damp(this.nod, 0, 2, dt); this.shake = damp(this.shake, 0, 2, dt);
    const hl = this.lookTarget ? 5 : 2.5;
    this.headYaw = damp(this.headYaw, wantYaw, hl, dt);
    this.headPitch = damp(this.headPitch, wantPitch, hl, dt);
    this.headRoll = damp(this.headRoll, this.tilt + (this.emotion === 'curious' ? 0.25 : 0), 4, dt);
    r.head.rotation.set(this.headPitch, this.headYaw, this.headRoll);
    const headVel = (this.headYaw - this.prevHeadYaw) / Math.max(dt, 1e-3);
    this.prevHeadYaw = this.headYaw;
    // ears: spring lag + twitches
    this.earLag = damp(this.earLag, clamp(-headVel * 0.08, -0.4, 0.4) + r.body.position.y * 1.2, 6, dt);
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = rand(2, 7); this.earTwitch = 1; this.earTwitchSide = chance(0.5) ? 0 : 1; }
    this.earTwitch = damp(this.earTwitch, 0, 6, dt);
    r.ears.forEach((e, i) => {
      const b = e.userData.base;
      if (!b) return;
      const tw = this.earTwitchSide === i ? Math.sin(t * 40) * this.earTwitch * 0.25 : 0;
      const droop = (this.emotion === 'sad' ? 0.5 : 0) + this.lie * 0.4 + this.wet * 0.35;
      e.rotation.z = b.z + (i ? 1 : -1) * (this.earLag * 0.6 + tw + droop * 0.5);
      e.rotation.x = b.x - this.earLag * 0.4 + droop * 0.3;
    });
    // tail
    if (r.tail) {
      const happy = this.emotion === 'happy' || this.talkKind === 'laugh' && this.talkT > 0;
      const amp = (P.tailWag ?? 0.15) * (happy ? 2.2 : 1) * (1 - this.lie * 0.7);
      r.tail.rotation.y = Math.sin(t * (happy ? 9 : 2.2) + this.swayPh) * amp;
      if (P.quad) r.tail.rotation.z = Math.sin(t * (happy ? 14 : 3)) * 0.3;
    }
    // eyes
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = rand(2, 6); this.blink = 1; if (chance(0.2)) this.blinkT = 0.25; }
    this.blink = Math.max(0, this.blink - dt * 7);
    let mode = this.eyeMode || (this.emotion === 'happy' || (this.talkKind === 'laugh' && this.talkT > 0) ? 'happy' : 'open');
    if (this.curl > 0.6) mode = 'closed';
    const bl = Math.sin(Math.min(1, this.blink) * Math.PI);
    for (const e of r.eyes) {
      e.open.visible = mode === 'open' || mode === 'wide';
      e.happy.visible = mode === 'happy';
      e.closed.visible = mode === 'closed';
      const wide = mode === 'wide' ? 1.25 : 1;
      e.open.scale.set(wide, Math.max(0.08, (1 - bl * 0.92)) * wide, 1);
    }
    // mouth
    if (r.mouth) {
      const b = r.mouth.userData.base;
      let open = this.emotion === 'happy' ? 0.5 : 0.1;
      if (this.talkT > 0) open = 0.6 + 0.9 * Math.abs(Math.sin(t * (this.talkKind === 'laugh' ? 22 : 14) + noise1(t * 3, this.swayPh) * 2));
      if (this.eyeMode === 'closed' && this.lie > 0.5) open = 0.3 + 0.3 * Math.sin(t * 1.2);
      if (this.emotion === 'surprised') open = 1.6;
      r.mouth.scale.set(b.x * (1 + open * 0.2), b.y * (1 + open * 3.2), b.z);
    }
    // cheeks + frog throat
    const blushT = (this.emotion === 'shy' ? 1 : this.emotion === 'happy' ? 0.5 : 0);
    this.blush = damp(this.blush, blushT, 3, dt);
    for (const c of r.cheeks) { if (!c.userData.base) c.userData.base = c.scale.clone(); c.scale.copy(c.userData.base).multiplyScalar(1 + this.blush * 0.5); }
    if (r.extras.throat) { const th = this.talkT > 0 ? 1 + Math.abs(Math.sin(t * 7)) * 0.9 : 1; r.extras.throat.scale.set(th, 0.6 * th, 0.9 * th); }
    if (r.extras.whiskers) r.extras.whiskers.rotation.z = Math.sin(t * 17) * 0.05 * (this.talkT > 0 ? 2 : 0.6);
    // wet shake: a little shiver when soaked
    if (this.wet > 0.6 && !this.moving && Math.sin(t * 0.7 + this.swayPh) > 0.97) r.body.rotation.y = Math.sin(t * 40) * 0.15;
  }
}
