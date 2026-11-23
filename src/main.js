import * as THREE from 'three';
import { seed, rand, pick, chance, noise1, clamp } from './core/noise.js';
import { uniforms, windVec, treeSwayWeight, haloMat, bakedMaterials } from './core/materials.js';
import { bakeInto, sphereGeo } from './core/geo.js';
import { createPost } from './core/post.js';
import { createRig } from './core/cameraRig.js';
import { createEnvironment, applyEnvironment, SEASONS } from './env/weather.js';
import {
  buildIsland, buildUnderside, buildIslets, buildAOMap, groundHeight, walkHeight, onIsland, addZone, rimR,
  BOTTOM, POND, WATER_Y, STREAM, BRIDGE, pondD,
} from './world/island.js';
import { buildPagoda, PAG, pagodaBlocked } from './world/pagoda.js';
import { buildTree } from './world/tree.js';
import { buildFlowerWall, WALL } from './world/flowerWall.js';
import { cart, stump, pumpkin, bunting, beadStrand, paperLantern } from './world/props.js';
import { buildVegetation } from './world/vegetation.js';
import { buildWater, buildPuddles, waterUniforms, PUDDLE_SPOTS } from './world/water.js';
import { buildSkyDome, buildClouds, buildRainbow, buildShootingStars, skyUniforms } from './world/sky.js';
import { buildWeatherFX, buildFireflies, buildButterflies, buildFire, buildFalling } from './world/fx.js';
import { campfire, garden, swing, dock, picnic, bench, signpost, birdhouse, rootDoor, hollowLog, fairyRing, bridge, bigMushroom, makeItem } from './world/places.js';
import { createNav } from './life/nav.js';
import { createEmotes } from './life/emotes.js';
import { createLife } from './life/director.js';
import { createAudio } from './audio/engine.js';

const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- renderer ---------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#cddcea', 0.004);
const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 46 : 34, Math.max(1, innerWidth) / Math.max(1, innerHeight), 0.1, 320);

const hemi = new THREE.HemisphereLight('#9fc7ee', '#7e6e4a', 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 3);
sun.target.position.set(0.5, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 70 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

const env = createEnvironment();

// ---- world ------------------------------------------------------------------
const swingers = [], flags = [], glows = [], halos = [];
let ctx, life, water, puddles, clouds, sky, rainbow, stars, islets, wfx, fireflies, butterflies, fire, falling, emotes, audio = null;
let blossomMesh = null, blossomTotal = 0, pickables = [], places, fishing, boat, fish, underside;

function build() {
  seed(20261123);
  scene.add(sky = buildSkyDome());
  const island = buildIsland();
  scene.add(island);
  underside = buildUnderside();
  islets = buildIslets();
  for (const d of islets.list) scene.add(d.group);
  clouds = buildClouds();
  scene.add(clouds.group);
  rainbow = buildRainbow();
  scene.add(rainbow.mesh);
  stars = buildShootingStars();
  scene.add(stars.mesh);

  // ---- landmarks & places --------------------------------------------------------------------
  const FIRE = [-0.9, 5.2], GARDEN = [7.0, -0.6], PICNIC = [3.3, 6.7], LOOK = [5.95, 7.75], BENCH2 = [-2.7, -3.5];
  addZone(PAG.x, PAG.z, 2.35);
  for (const z of [-0.5, 0.3, 1.1, 1.9, 2.4]) addZone(2.55, z, 0.62);
  addZone(WALL.c.x, WALL.c.z, 2.0);
  addZone(-4.6, -2.0, 1.2);
  addZone(6.1, 2.3, 1.45); addZone(7.0, 2.8, 0.7);
  addZone(-4.3, 1.4, 0.75);
  addZone(FIRE[0], FIRE[1], 1.7);
  addZone(GARDEN[0], GARDEN[1], 1.7);
  addZone(PICNIC[0], PICNIC[1], 1.1);
  addZone(LOOK[0], LOOK[1], 0.7); addZone(BENCH2[0], BENCH2[1], 0.7);
  addZone(1.75, 3.2, 0.3); addZone(8.3, 1.6, 0.35);
  addZone(-1.6, -7.5, 1.0); addZone(-7.2, -0.3, 1.1); addZone(-1.6, 1.3, 1.3);
  for (const [x, z] of PUDDLE_SPOTS) addZone(x, z, 0.55);

  const statics = new THREE.Group();
  scene.add(statics);
  statics.add(underside.group);

  const pag = buildPagoda();
  statics.add(pag.group);
  swingers.push(...pag.swingers);
  glows.push({ mat: pag.glow, day: 0.25, night: 1.7, speed: 0.6, depth: 0.4 });
  for (const L of pag.lanterns) glows.push({ mat: L.mat, day: 0.35, night: (L.base ?? 1.7) * 1.1 });

  const tree = buildTree();
  statics.add(tree.group);
  scene.add(tree.blossoms, tree.buds);
  blossomMesh = tree.blossoms; blossomTotal = tree.blossoms.count;
  statics.add(buildFlowerWall());

  const props = new THREE.Group();
  statics.add(props);
  const cartG = cart();
  cartG.position.set(6.1, groundHeight(6.1, 2.3) - 0.02, 2.3);
  cartG.rotation.y = -0.42;
  props.add(cartG);
  const st = stump();
  const sy = groundHeight(-4.3, 1.4);
  st.position.set(-4.3, sy - 0.04, 1.4);
  props.add(st);
  const pk = (x, z, r, col, o = {}) => pumpkin(props, [x, groundHeight(x, z) - 0.03, z], r, col, { rot: rand(0, 6), ...o });
  pk(3.35, 2.75, 0.24, '#e8833a', { leaf: true }); pk(3.8, 2.45, 0.15, '#f1d6a6'); pk(4.95, 3.55, 0.27, '#eb8a3a');
  pk(7.6, 2.0, 0.18, '#8fa65a', { ribs: 7 }); pk(-3.85, -1.95, 0.2, '#e89a5a'); pk(-6.9, 0.9, 0.16, '#e3742f');

  const fireP = campfire(...FIRE); statics.add(fireP.group);
  const gardenP = garden(GARDEN[0], GARDEN[1], Math.atan2(-GARDEN[0], -GARDEN[1])); statics.add(gardenP.group);
  const swingP = swing(tree.anchors.swing); statics.add(swingP.group);
  const dockP = dock([-2.05, 4.78], [-3.3, 4.38]); statics.add(dockP.group);
  const picnicP = picnic(PICNIC[0], PICNIC[1], 0.3); statics.add(picnicP.group);
  const lookP = bench(LOOK[0], LOOK[1], Math.atan2(LOOK[0], LOOK[1])); statics.add(lookP.group);
  const bench2 = bench(BENCH2[0], BENCH2[1], Math.atan2(-BENCH2[0], -BENCH2[1])); statics.add(bench2.group);
  statics.add(signpost(1.75, 3.2));
  const birdP = birdhouse(8.3, 1.6); statics.add(birdP.group);
  const rootP = rootDoor(4.55, -2.0, 1.22); statics.add(rootP.group);
  const logP = hollowLog(-1.6, -7.5, 0.3); statics.add(logP.group);
  const fairyP = fairyRing(-7.2, -0.3); statics.add(fairyP.group);
  statics.add(bridge());
  const shroom = bigMushroom(-1.6, 1.3); statics.add(shroom.group);
  glows.push({ mat: rootP.lampMat, day: 0.15, night: 2.2 });
  for (const m of fairyP.mats) glows.push({ mat: m, day: 0.05, night: 1.6, speed: 0.4, depth: 0.6 });
  for (const m of underside.crystals) glows.push({ mat: m, day: 0.12, night: 1.4, speed: 0.3, depth: 0.5 });

  // bunting from the flower tower to the cherry branch
  const A = V(-4.85, 5.15, -2.6), B = tree.anchors.bunting.clone();
  const bt = bunting(A, B, 0.5, 13, ['#f07a8a', '#fbe9d6', '#f5c84a', '#f2945a', '#c96aa0', '#8fc46a']);
  statics.add(bt.group);
  flags.push(...bt.flags);
  statics.add(beadStrand(A.clone().add(V(0.1, -0.3, 0.05)), B.clone().add(V(0, -0.22, 0)), 1.0, ['#fbeee0', '#f39a6a', '#f2788a', '#fbeee0', '#e8b23a']));

  // lanterns on the branches
  const lcols = [['#f6b08a', '#ff8a3a'], ['#f49aa8', '#ff6a5a'], ['#fbe0b0', '#ffa83a'], ['#f6b08a', '#ff8a3a'], ['#f49aa8', '#ff6a5a']];
  tree.anchors.lanterns.forEach((a, i) => {
    const L = paperLantern({ color: lcols[i][0], glow: lcols[i][1], size: 0.16 + rand(0, 0.04), drop: rand(0.3, 0.55) });
    L.group.position.copy(a);
    scene.add(L.group);
    swingers.push({ obj: L.group, amp: 0.06, freq: rand(0.9, 1.3), phase: rand(0, 6), wind: 0.07, follow: a.clone() });
    glows.push({ mat: L.mat, day: 0.35, night: 2.0 });
  });
  // soft glow shells around every lantern at night
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isMesh && o.material?.emissive && o.material.emissiveIntensity >= 1.5 && o.parent?.userData.keep && o.geometry.type === 'LatheGeometry') {
      const h = new THREE.Mesh(sphereGeo(1, 12), haloMat('#ff9a4a', 0));
      h.scale.setScalar(0.55);
      o.add(h);
      halos.push(h);
    }
  });

  water = buildWater();
  scene.add(water.group);
  water.group.remove(water.reedGroup);
  statics.add(water.reedGroup);
  puddles = buildPuddles();
  for (const m of puddles.meshes) scene.add(m);

  const veg = buildVegetation();
  statics.add(veg.staticGroup);
  scene.add(veg.live);

  const baked = bakeInto(statics, scene);

  // contact occlusion map
  buildAOMap([
    { box: true, x: PAG.x, z: PAG.z, hx: 1.6, hz: 1.6, s: 0.55, soft: 0.7 },
    { x: 3.65, z: -2.75, r: 1.5, s: 0.45 },
    { x: WALL.c.x, z: WALL.c.z, r: 2.0, s: 0.55 },
    { x: 6.1, z: 2.3, r: 1.2, s: 0.35 },
    { x: FIRE[0], z: FIRE[1], r: 1.5, s: 0.22 },
    { x: GARDEN[0], z: GARDEN[1], r: 1.5, s: 0.25 },
    { x: -4.3, z: 1.4, r: 0.8, s: 0.35 },
    { x: -1.6, z: 1.3, r: 1.4, s: 0.5 },
    { x: LOOK[0], z: LOOK[1], r: 0.6, s: 0.3 }, { x: BENCH2[0], z: BENCH2[1], r: 0.6, s: 0.3 },
    { x: -1.6, z: -7.5, r: 0.9, s: 0.35 },
  ]);

  // ---- effects ---------------------------------------------------------------------------------------
  wfx = buildWeatherFX(scene);
  const fireflyHomes = [];
  for (let i = 0; i < 80; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    fireflyHomes.push(V(x, groundHeight(x, z) + rand(0.3, 1.6), z));
  }
  for (let i = 0; i < 20; i++) fireflyHomes.push(V(POND.x + rand(-2, 2), 0.4 + rand(0, 1), POND.z + rand(-1.5, 1.5)));
  fireflies = buildFireflies(scene, fireflyHomes);
  const flowerPts = [
    ...veg.flowerSpots.map((p) => V(p.x - 0.35, groundHeight(p.x, p.z) + 0.55, p.z - 0.2)),
    V(-4.6, 2.5, -1.9), V(-5.0, 4.2, -2.1), V(-6.4, 3.0, -2.0), V(-4.9, 1.4, -1.9),
    ...gardenP.plots.filter((_, i) => i % 3 === 0).map((p) => gardenP.worldOf(p).add(V(0, 0.3, 0))),
    ...water.pads.slice(0, 3).map((p) => p.position.clone().add(V(0, 0.1, 0))),
  ];
  butterflies = buildButterflies(scene, flowerPts);
  fire = buildFire(scene, fireP.center);
  falling = buildFalling(scene, tree.blossomPoints, isMobile ? 90 : 140);
  emotes = createEmotes(scene);

  // fishing line + bobber, the paper boat, and a fish that sometimes leaps
  const bobber = new THREE.Group();
  const bobMesh = new THREE.Mesh(sphereGeo(0.05, 10), new THREE.MeshStandardMaterial({ color: '#e8453a', roughness: 0.5 }));
  const bobTop = new THREE.Mesh(sphereGeo(0.035, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
  bobTop.position.y = 0.04;
  bobber.add(bobMesh, bobTop);
  bobber.visible = false;
  scene.add(bobber);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 3), new THREE.MeshBasicMaterial({ color: '#f2f2f2' }));
  line.visible = false;
  scene.add(line);
  fishing = {
    bobber, caster: null, biteT: -1,
    cast(c) {
      this.caster = c;
      bobber.position.set(dockP.end.x + Math.sin(dockP.face) * 0.9, WATER_Y + 0.02, dockP.end.z + Math.cos(dockP.face) * 0.9);
      bobber.visible = line.visible = true;
      water.ripple(bobber.position.x, bobber.position.z, 0.6);
    },
    bite() { this.biteT = 0; },
    reel() { bobber.visible = line.visible = false; this.caster = null; },
    hide() { bobber.visible = line.visible = false; this.caster = null; },
    update(t, dt) {
      if (!bobber.visible) return;
      let y = WATER_Y + 0.02 + Math.sin(t * 2.2) * 0.008;
      if (this.biteT >= 0) { this.biteT += dt; y -= Math.abs(Math.sin(this.biteT * 18)) * 0.05; if (this.biteT > 1) this.biteT = -1; }
      bobber.position.y = y;
      const c = this.caster;
      if (c?.held?.userData.tip) {
        const tip = c.held.localToWorld(c.held.userData.tip.clone());
        const mid = tip.clone().add(bobber.position).multiplyScalar(0.5);
        line.position.copy(mid);
        line.scale.set(1, tip.distanceTo(bobber.position), 1);
        line.quaternion.setFromUnitVectors(V(0, 1, 0), tip.clone().sub(bobber.position).normalize());
      }
    },
  };
  const boatMesh = makeItem('boat');
  boatMesh.scale.setScalar(1.4);
  boatMesh.visible = false;
  scene.add(boatMesh);
  boat = {
    mesh: boatMesh, active: false, t: 0, from: V(), dir: V(),
    launch(from, toward) {
      this.active = true; this.t = 0;
      this.from.set(from.x, WATER_Y + 0.03, from.z);
      this.dir.copy(toward).sub(from).setY(0).normalize();
      boatMesh.visible = true;
    },
    update(t, dt) {
      if (!this.active) return;
      this.t += dt;
      const p = this.from.clone().addScaledVector(this.dir, Math.min(this.t * 0.16, 2.6));
      p.x += Math.sin(this.t * 0.7) * 0.15;
      p.y = WATER_Y + 0.03 + Math.sin(t * 2) * 0.006;
      if (pondD(p.x, p.z) > 0.95) this.t -= dt;
      boatMesh.position.copy(p);
      boatMesh.rotation.set(Math.sin(t * 1.7) * 0.06, this.t * 0.3, Math.sin(t * 1.3) * 0.08);
      if (this.t > 30) { boatMesh.scale.multiplyScalar(0.97); if (boatMesh.scale.x < 0.05) { this.active = false; boatMesh.visible = false; boatMesh.scale.setScalar(1.4); } }
    },
  };
  const fishMesh = makeItem('fish');
  fishMesh.scale.setScalar(1.4);
  fishMesh.visible = false;
  scene.add(fishMesh);
  fish = {
    t: -1, nextT: rand(20, 50), p: V(), dir: V(),
    jump(x, z) {
      this.t = 0;
      this.p.set(x ?? POND.x + rand(-1, 1), WATER_Y, z ?? POND.z + rand(-0.6, 0.6));
      const a = rand(0, Math.PI * 2);
      this.dir.set(Math.cos(a), 0, Math.sin(a));
      fishMesh.visible = true;
      water.ripple(this.p.x, this.p.z, 1);
      audio?.sfx('splash', this.p, { small: true });
    },
    update(t, dt) {
      if (this.t < 0) { if (t > this.nextT && env.ice < 0.5) { this.jump(); this.nextT = t + rand(25, 70); } return; }
      this.t += dt / 0.9;
      const k = Math.min(1, this.t);
      fishMesh.position.copy(this.p).addScaledVector(this.dir, k * 0.7).add(V(0, Math.sin(k * Math.PI) * 0.55, 0));
      fishMesh.rotation.set(-Math.cos(k * Math.PI) * 1.1, Math.atan2(this.dir.x, this.dir.z), 0);
      if (k >= 1) { this.t = -1; fishMesh.visible = false; const e = this.p.clone().addScaledVector(this.dir, 0.7); water.ripple(e.x, e.z, 1); audio?.sfx('plop', e, { small: true }); }
    },
  };

  // ---- navigation + places for the inhabitants --------------------------------------------------------------
  const logs = [];
  for (const a of [0.4, 2.3, 4.2]) {
    const cx = FIRE[0] + Math.cos(a) * 1.15, cz = FIRE[1] + Math.sin(a) * 1.15;
    const tx = -Math.sin(a), tz = Math.cos(a);
    for (const k of [-0.35, 0, 0.35]) logs.push({ x: cx + tx * k, z: cz + tz * k, r: 0.17 });
  }
  const dockDir = V(-3.3 + 2.05, 0, 4.38 - 4.78).normalize();
  const nav = createNav({
    obstacles: [
      { x: 3.65, z: -2.75, r: 1.55 }, { x: 2.08, z: -0.9, r: 0.12 }, { x: 5.12, z: -0.9, r: 0.12 },
      { box: [2.1, -0.75, 3.0, 2.0] },
      { x: WALL.c.x, z: WALL.c.z, r: 1.6 },
      { x: 6.1, z: 2.3, r: 1.05 }, { x: 6.85, z: 2.95, r: 0.35 },
      { x: -4.3, z: 1.4, r: 0.55 },
      { x: FIRE[0], z: FIRE[1], r: 0.5 }, ...logs,
      { x: GARDEN[0], z: GARDEN[1], r: 1.3 },
      { x: LOOK[0], z: LOOK[1], r: 0.42 }, { x: BENCH2[0], z: BENCH2[1], r: 0.42 },
      { x: 1.75, z: 3.2, r: 0.1 }, { x: 8.3, z: 1.6, r: 0.1 },
      { x: -1.6, z: -7.5, r: 0.68 }, { x: -1.6, z: 1.3, r: 0.25 },
    ],
    walkable: [{ x: (-2.05 - 3.3) / 2, z: (4.78 + 4.38) / 2, len: 1.35, wid: 0.5, dir: [dockDir.x, dockDir.z] }],
  });
  const shore = [];
  for (let k = 0; k < 16 && shore.length < 7; k++) {
    const a = (k / 16) * Math.PI * 2;
    const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
    const u = Math.cos(a) * POND.rx * 1.3, v = Math.sin(a) * POND.rz * 1.3;
    const x = POND.x + u * c - v * s, z = POND.z + u * s + v * c;
    if (nav.walkableAt(x, z)) shore.push(V(x, 0, z));
  }
  const gy = (x, z) => groundHeight(x, z);
  places = {
    campfire: fireP, garden: gardenP, swing: swingP, picnic: picnicP, lookout: lookP,
    dock: { start: V(-1.8, 0, 4.86), end: dockP.end, deckY: dockP.deckY, face: dockP.face },
    cart: { front: V(5.15, 0, 2.95) },
    rootDoor: rootP, hollowLog: logP, birdhouse: birdP, fairyRing: fairyP,
    owlPerch: tree.anchors.owlPerch,
    puddles: PUDDLE_SPOTS.map(([x, z]) => ({ x, z })),
    lilyPads: water.pads,
    pondShore: shore, pondCentre: V(POND.x, 0, POND.z),
    stairs: {
      foot: V(2.55, 0, 2.45),
      up: [V(2.55, 0.22, 1.9), V(2.55, 2.42, -0.47), V(2.55, 2.6, -0.85), V(3.0, 2.6, -1.0), V(3.6, 2.6, -1.1)],
      down: [V(3.0, 2.6, -1.0), V(2.55, 2.6, -0.85), V(2.55, 2.42, -0.47), V(2.55, 0.22, 1.9), V(2.55, gy(2.55, 2.45), 2.45)],
      door: V(3.6, 2.6, -1.1),
    },
    shelterSpots: [V(3.5, 0, -0.85), V(4.25, 0, -0.9), V(4.85, 0, -1.0), ...shroom.shelter],
    napSpots: [V(5.5, 0, -3.35), V(-3.7, 0, -1.95), V(-3.5, 0, 0.9), V(1.5, 0, 1.4), V(6.2, 0, 4.8), V(-6.4, 0, 2.3), V(-0.5, 0, -4.5)],
    pigletBeds: [V(3.5, 0, -0.85), V(4.25, 0, -0.9), V(-1.3, 0, 1.0), V(-1.9, 0, 1.7)],
    flowerSpots: [...veg.flowerSpots, V(-4.1, 0, -1.7), V(-6.8, 0, -1.4), V(-4.3, 0, -4.7), V(-6.6, 0, 0.4)],
    interest: [V(1.75, 0, 3.55), V(8.0, 0, 1.9), V(5.0, 0, 2.9), V(-2.4, 0, 4.3), V(-6.6, 0, -0.3), V(-7.0, 0, 5.4), V(-1.2, 0, -6.8), V(5.4, 0, 7.2), V(0.2, 0, 8.6), V(-3.2, 0, -1.5), V(4.6, 0, -1.4), V(-1.6, 0, 2.3)],
    watchSeats: [...lookP.seats, ...bench2.seats],
    birdPerches: [birdP.perch, ...tree.anchors.perches, V(3.6, 9.85, -2.4), V(-4.3, sy + 0.6, 1.4), V(1.75, gy(1.75, 3.2) + 1.06, 3.2), gardenP.group.localToWorld(V(1.0, 1.32, -0.77))],
    swingBusy: () => false,
  };
  ctx = {
    env, nav, emotes, fx: wfx, water, fishing, boat, places,
    get audio() { return audio; },
    story: (txt) => showCaption(txt),
  };
  places.swingBusy = () => !!ctx.swingLock;
  life = createLife(ctx);
  ctx.director = life;
  for (const c of life.chars) scene.add(c.root);

  // ---- pickables & clickable surprises --------------------------------------------------------------------
  pickables = [island, ...baked, tree.blossoms, water.pond, ...clouds.pickables, ...puddles.meshes];
  for (const c of life.chars) c.root.traverse((o) => { if (o.isMesh) pickables.push(o); });
  fireP.group.traverse((o) => { if (o.isMesh) { o.userData.place = 'campfire'; pickables.push(o); } });
  fairyP.group.traverse((o) => { if (o.isMesh && o.userData.fairy) pickables.push(o); });
  swingP.pivot.traverse((o) => { if (o.isMesh) { o.userData.place = 'swing'; pickables.push(o); } });
  for (const s of swingers) s.obj.traverse((o) => { if (o.isMesh) { o.userData.place = 'chime'; pickables.push(o); } });
  tree.blossoms.userData.place = 'tree';
  water.pond.userData.place = 'pond';
  clouds.pickables.forEach((c) => { c.userData.place = 'cloud'; });

  // cache world positions for wind sampling
  scene.updateMatrixWorld(true);
  for (const s of swingers) s.wpos = s.obj.getWorldPosition(V());
  for (const f of flags) f.wpos = f.obj.getWorldPosition(V());

  // react to the sky
  env.on('thunder', (k) => audio?.thunder(k));
  env.on('weather', (name) => syncUI());
  if (env.night > 0.5) fireP.want = 1;
}

// ---- interactions ---------------------------------------------------------------
function onPick(hit, dbl) {
  const o = hit.object;
  const c = o.userData.character;
  ensureAudio();
  if (c) {
    if (!dbl) life.poke(c, camera.position);
    return;
  }
  const place = o.userData.place;
  const p = hit.point;
  if (place === 'pond' || o.userData.water) {
    water.ripple(p.x, p.z, 1.2);
    audio?.sfx('plop', p);
    if (chance(0.4)) fish.jump(p.x + rand(-0.4, 0.4), p.z + rand(-0.4, 0.4));
  } else if (place === 'campfire') {
    places.campfire.want = places.campfire.want > 0.5 ? 0 : 1;
    audio?.sfx('whoosh', p);
  } else if (place === 'cloud') {
    if (env.rain < 0.2 && env.snow < 0.2) { env.autoWeather = true; env.setWeather(env.season === 3 ? 'snow' : 'rain'); showCaption('You tickled a cloud... and it began to rain'); }
    else { env.setWeather('clear'); showCaption('The clouds drift apart'); }
    syncUI();
  } else if (place === 'tree') {
    audio?.sfx('rustle', p);
    for (let i = 0; i < 6; i++) emotes.spawn(i % 2 ? 'sparkle' : 'love', p.clone().add(V(rand(-0.4, 0.4), rand(-0.2, 0.3), rand(-0.4, 0.4))), { delay: i * 0.08, scale: 0.7 });
  } else if (o.userData.fairy) {
    audio?.sfx('sparkle', p);
    for (let i = 0; i < 9; i++) emotes.spawn('sparkle', places.fairyRing.center.clone().add(V(Math.cos(i * 0.7) * 0.75, 0.3 + i * 0.05, Math.sin(i * 0.7) * 0.75)), { delay: i * 0.07 });
    fairyBoost = 4;
    if (!fairyFound) { fairyFound = true; showCaption('The fairy ring shimmers... something magical lives here'); }
  } else if (place === 'swing') {
    places.swing.vel += 1.2;
    audio?.sfx('chime', p, { f: 300 });
  } else if (place === 'chime') {
    audio?.sfx('chime', p, { f: pick([1046, 1318, 1568]) });
    const s = swingers.find((q) => { let hit = false; q.obj.traverse((m) => { if (m === o) hit = true; }); return hit; });
    if (s) s.kick = 1;
  }
}
let fairyBoost = 0, fairyFound = false;

function visibleDeep(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

// ---- camera collision --------------------------------------------------------
const tmp = V();
function undersideR(y) {
  const t = Math.pow(clamp((BOTTOM + 0.15 - y) / 6.4, 0, 1), 1 / 0.9);
  return 10 * Math.pow(1 - t, 1.25) + 1.3;
}
function collide(p) {
  let moved = false;
  const rr = Math.hypot(p.x, p.z);
  if (onIsland(p.x, p.z, -0.6)) {
    const minY = groundHeight(p.x, p.z) + 0.45;
    if (p.y < minY && p.y > BOTTOM - 0.5) { p.y = minY; moved = true; }
  }
  if (p.y < BOTTOM + 0.2 && p.y > BOTTOM - 7.5) {
    const R = undersideR(p.y);
    if (rr < R) { const k = R / Math.max(rr, 0.01); p.x *= k; p.z *= k; moved = true; }
  }
  if (pagodaBlocked(p.x, p.y, p.z, 0.4)) {
    let dx = p.x - PAG.x, dz = p.z - PAG.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    for (let i = 0; i < 40 && pagodaBlocked(p.x, p.y, p.z, 0.4); i++) { p.x += dx * 0.08; p.z += dz * 0.08; }
    moved = true;
  }
  tmp.copy(p).sub(WALL.c).applyAxisAngle(V(0, 1, 0), -WALL.rotY);
  const k = Math.hypot(tmp.x / (WALL.r.x + 0.9), tmp.y / (WALL.r.y + 0.9), tmp.z / (WALL.r.z + 0.9));
  if (k < 1) { tmp.multiplyScalar(1 / k).applyAxisAngle(V(0, 1, 0), WALL.rotY).add(WALL.c); p.copy(tmp); moved = true; }
  if (p.y < 9 && p.y > 0) {
    const d = Math.hypot(p.x - 3.9, p.z + 5.2);
    if (d < 1.3) { p.x = 3.9 + ((p.x - 3.9) / (d || 1)) * 1.3; p.z = -5.2 + ((p.z + 5.2) / (d || 1)) * 1.3; moved = true; }
  }
  return moved;
}

// ---- UI ------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const captionEl = $('caption');
let captionQueue = [], captionT = 0, captionsOn = true;
function showCaption(txt) {
  if (!captionsOn || !txt) return;
  if (captionQueue.length > 3) captionQueue.shift();
  if (!captionQueue.includes(txt)) captionQueue.push(txt);
}
function updateCaptions(dt) {
  captionT -= dt;
  if (captionT <= 0) {
    if (captionEl.classList.contains('show')) { captionEl.classList.remove('show'); captionT = 1.2; return; }
    const next = captionQueue.shift();
    if (next) { captionEl.textContent = next; captionEl.classList.add('show'); captionT = 5; }
  }
}
function fmtHour(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
};
let iconKey = '';
function syncUI() {
  document.querySelectorAll('#weather button').forEach((b) => b.classList.toggle('active', b.dataset.w === env.weather));
  document.querySelectorAll('#season button').forEach((b) => b.classList.toggle('active', +b.dataset.s === env.seasonTarget));
  $('autoweather').checked = env.autoWeather;
  $('autoseason').checked = env.autoSeason;
}
function updateUI(dt) {
  if (!ui.next) ui.next = 0;
  ui.next -= dt;
  if (ui.next > 0) return;
  ui.next = 0.4;
  $('clock').textContent = `${fmtHour(env.hour)} · ${env.seasonName}`;
  if (!ui.draggingTime) { $('time').value = env.hour; $('timeout').textContent = fmtHour(env.hour); }
  const key = env.snow > 0.3 ? 'snow' : env.rain > 0.3 ? 'rain' : env.fog > 0.6 ? 'fog' : env.cloud > 0.65 ? 'cloud' : env.night > 0.5 ? 'moon' : 'sun';
  if (key !== iconKey) { iconKey = key; $('envicon').innerHTML = ICONS[key]; }
  document.body.classList.toggle('night', env.night > 0.6);
  const f = rig?.following;
  const fe = $('following');
  fe.classList.toggle('show', !!f);
  if (f) fe.querySelector('span').textContent = `Following ${f.name} · ${f.label}`;
}
const ui = {};
let rig, post;
const buttons = [...document.querySelectorAll('#views [data-view]')];
function wireUI() {
  buttons.forEach((b) => b.addEventListener('click', () => rig.goTo(b.dataset.view)));
  const tourBtn = $('tour');
  tourBtn.addEventListener('click', () => { const on = !rig.drifting; rig.setDrift(on); tourBtn.setAttribute('aria-pressed', String(on)); });
  const envBtn = $('envbtn'), panel = $('envpanel');
  envBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; envBtn.setAttribute('aria-expanded', String(!panel.hidden)); syncUI(); });
  addEventListener('pointerdown', (e) => { if (!panel.hidden && !$('envbtn-wrap').contains(e.target)) { panel.hidden = true; envBtn.setAttribute('aria-expanded', 'false'); } });
  const time = $('time');
  time.addEventListener('input', () => { ui.draggingTime = true; env.setHour(+time.value); $('timeout').textContent = fmtHour(env.hour); });
  time.addEventListener('change', () => { ui.draggingTime = false; });
  $('autotime').addEventListener('change', (e) => { env.autoTime = e.target.checked; });
  $('weather').addEventListener('click', (e) => { const w = e.target.closest('button')?.dataset.w; if (!w) return; env.autoWeather = false; env.setWeather(w); syncUI(); });
  $('autoweather').addEventListener('change', (e) => { env.autoWeather = e.target.checked; });
  $('season').addEventListener('click', (e) => { const s = e.target.closest('button')?.dataset.s; if (s == null) return; env.autoSeason = false; env.setSeason(+s); syncUI(); });
  $('autoseason').addEventListener('change', (e) => { env.autoSeason = e.target.checked; });
  $('volume').addEventListener('input', (e) => { ensureAudio(); audio?.setVolume(+e.target.value); $('volout').textContent = `${Math.round(e.target.value * 100)}%`; });
  $('mute').addEventListener('change', (e) => { ensureAudio(); audio?.setMuted(e.target.checked); $('soundgate').classList.toggle('muted', e.target.checked); });
  $('music').addEventListener('change', (e) => { audio?.setMusic(e.target.checked); });
  $('captions').addEventListener('change', (e) => { captionsOn = e.target.checked; if (!captionsOn) { captionQueue = []; captionEl.classList.remove('show'); } });
  $('soundgate').addEventListener('click', () => {
    if (!audio) ensureAudio();
    else { const m = !audio.muted; audio.setMuted(m); $('mute').checked = m; $('soundgate').classList.toggle('muted', m); }
  });
  $('following').querySelector('button').addEventListener('click', () => rig.stopFollow());
  const hover = $('hover');
  ui.hover = (c, x, y) => {
    if (!c) { hover.classList.remove('show'); return; }
    const L = life.labelFor(c);
    hover.querySelector('b').textContent = L.name;
    hover.querySelector('.blurb').textContent = L.blurb;
    hover.querySelector('.doing').textContent = L.doing;
    hover.style.left = `${Math.min(x, innerWidth - 250)}px`;
    hover.style.top = `${Math.min(y, innerHeight - 110)}px`;
    hover.classList.add('show');
  };
  const hint = $('hint');
  const fade = () => hint.classList.add('faded');
  renderer.domElement.addEventListener('pointerdown', fade, { once: true });
  setTimeout(fade, 14000);
  // any first gesture unlocks audio (browser autoplay rules)
  const unlock = () => { ensureAudio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  syncUI();
}
function ensureAudio() {
  if (audio) { if (!audio.running) audio.resume(); return; }
  audio = createAudio();
  if (!audio) return;
  audio.resume();
  audio.placeWater(water.fallFoot.clone().lerp(water.lip, 0.4), V(STREAM[2][0], 0, STREAM[2][1]), V(POND.x, 0, POND.z), places.campfire.center);
  audio.setPlaces({ pagoda: { x: PAG.x, y: 5, z: PAG.z }, pond: { x: POND.x, y: 0, z: POND.z }, fire: places.campfire.center });
  audio.setVolume(+$('volume').value);
  audio.setMusic($('music').checked);
  $('soundgate').classList.add('on');
}

// ---- quality: effect tiers + dynamic resolution --------------------------------
const PIXEL_BUDGET = [0.85e6, 1.6e6, 5e6];
let prMax = 1, quality = 2;
function setPR(pr) {
  pixelRatio = pr;
  renderer.setPixelRatio(pr);
  post.setPixelRatio(pr);
  if (innerWidth && innerHeight) { renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); }
}
function applyTier(q) {
  quality = q;
  post.gtao.enabled = q >= 2;
  post.bloom.enabled = q >= 1;
  post.finish.uniforms.uBlur.value = q >= 1 ? 1 : 0;
  uniforms.uClayDetail.value = q >= 1 ? 1 : 0;
  uniforms.uGradeOn.value = q === 0 ? 1 : 0;
  if (blossomMesh) blossomMesh.count = q >= 1 ? blossomTotal : Math.floor(blossomTotal * 0.72);
  prMax = q >= 2 ? Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75) : q === 1 ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1);
  const px = Math.max(1, innerWidth * innerHeight);
  setPR(Math.max(0.5, Math.min(prMax, Math.sqrt(PIXEL_BUDGET[q] / px))));
  const sm = q >= 2 && !isMobile ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  renderer.shadowMap.needsUpdate = true;
  console.info('[sakura] quality tier', q, 'pixelRatio', pixelRatio.toFixed(2));
}
function benchmark() {
  if (!innerWidth || !innerHeight) { applyTier(0); return; }
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const modest = isMobile || /Intel|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe|Microsoft Basic/i.test(gpu);
  applyTier(modest ? 1 : 2);
  renderer.shadowMap.needsUpdate = true;
  post.render(0);
  sync();
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) { renderer.shadowMap.needsUpdate = i === 0; post.render(0); }
  sync();
  const ms = ((performance.now() - t0) / 3) * (1.6e6 / (renderer.domElement.width * renderer.domElement.height)) ** 0.7;
  console.info('[sakura] benchmark', ms.toFixed(1), 'ms/frame (normalised)');
  if (ms / (modest ? 0.75 : 1) > 55) { applyTier(0); renderer.render(scene, camera); }
  else if (!modest && ms > 26) applyTier(1);
}

addEventListener('resize', () => {
  if (!post || !innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 46 : 34;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  rig.refit();
  setPR(Math.max(0.5, Math.min(prMax, Math.sqrt(PIXEL_BUDGET[quality] / (innerWidth * innerHeight)), pixelRatio * 1.5)));
});

// ---- per-frame world animation -------------------------------------------------------
const W = V();
function animateWorld(t, dt) {
  for (const s of swingers) {
    if (s.follow) {
      windVec(s.follow.x, s.follow.y, s.follow.z, t, W);
      s.obj.position.copy(s.follow).addScaledVector(W, treeSwayWeight(s.follow.x, s.follow.y, s.follow.z));
    }
    windVec(s.wpos.x, s.wpos.y, s.wpos.z, t, W);
    s.kick = Math.max(0, (s.kick || 0) - dt * 0.6);
    const amp = s.amp * (1 + s.kick * 4);
    s.obj.rotation.x = amp * Math.sin(t * s.freq + s.phase) - W.z * s.wind;
    s.obj.rotation.z = amp * 0.7 * Math.sin(t * s.freq * 0.83 + s.phase + 1.3) + (W.x - 0.5) * s.wind;
  }
  for (const f of flags) {
    windVec(f.wpos.x, f.wpos.y, f.wpos.z, t, W);
    f.obj.rotation.x = f.amp * Math.sin(t * f.freq * (0.8 + env.wind * 0.4) + f.phase) * (0.5 + 0.5 * Math.abs(W.x)) - W.z * 0.12;
    f.obj.rotation.y = 0.08 * Math.sin(t * f.freq * 1.3 + f.phase);
  }
  // emissive things wake up at night
  fairyBoost = Math.max(0, fairyBoost - dt);
  const n = env.night, gloom = Math.max(n, env.cloud * 0.4 + env.rain * 0.3);
  for (const g of glows) {
    const fl = 1 + (noise1(t * (g.speed ?? 2.2), g.mat.id) * 0.12 + Math.sin(t * 11.3 + g.mat.id) * 0.03) * (g.depth ?? 1);
    g.mat.emissiveIntensity = (g.day + (g.night - g.day) * gloom) * fl * (fairyBoost > 0 && g.night === 1.6 ? 2.5 : 1);
  }
  for (const h of halos) h.material.uniforms.uStrength.value = gloom * 0.55;
  // campfire: lit at dusk by Hazel (or by itself if nobody comes)
  const F = places.campfire;
  if (env.hour > 19.8 && env.hour < 22 && F.want < 0.5 && n > 0.6) F.want = 1;
  if (env.rain > 0.6 && F.want > 0.5 && env.storm > 0.5) F.want = 0;
  F.update(t, dt);
  fire.update(dt, t, F.lit);
  audio?.setFire(F.lit);
}

// ---- loop -------------------------------------------------------------------------------
const timer = new THREE.Timer();
let started = false, frames = 0, acc = 0, accN = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (window.__sakura?.paused) return;
  timer.update(ts);
  const dt = Math.max(0, Math.min(timer.getDelta(), 1 / 20));
  const t = timer.getElapsed();
  uniforms.uTime.value = t;
  env.update(dt, t);
  applyEnvironment(env, { sun, hemi, scene, renderer, sky: skyUniforms, water: waterUniforms, camera, rainbow });
  sky.position.copy(camera.position);
  bakedMaterials.rock.emissive.copy(env.skyBottom).multiplyScalar(0.42);
  sun.target.position.set(camera.position.x * 0.2, 0, camera.position.z * 0.2);
  life.update(dt, t);
  emotes.update(dt, camera);
  water.update(t, env);
  puddles.update(env.puddles);
  clouds.update(t, env);
  islets.update(t);
  stars.update(t, dt, env, () => ctx.onShootingStar?.());
  const brightness = clamp(env.lightInt * 0.25 + env.hemiInt, 0.2, 1.2);
  wfx.update(dt, t, env, brightness);
  fireflies.update(env);
  butterflies.update(dt, t, env, life.chars.map((c) => c.pos));
  falling.update(dt, t, env);
  places.garden.update(dt, env);
  fishing.update(t, dt);
  boat.update(t, dt);
  fish.update(t, dt);
  animateWorld(t, dt);
  rig.update(dt);
  audio?.update(dt, env, camera, ctx);
  updateCaptions(dt);
  updateUI(dt);
  renderer.shadowMap.needsUpdate = (frames & 1) === 0 || frames < 3;
  if (quality === 0) renderer.render(scene, camera);
  else post.render(t);

  if (!started) {
    started = true;
    requestAnimationFrame(() => {
      $('veil').classList.add('gone');
      document.body.classList.add('ready');
      rig.goTo('overview', 4.5);
      setTimeout(() => showCaption('Welcome to Sakura Hollow'), 2500);
    });
  }
  frames++;
  if (frames > 90) {
    acc += dt; accN++;
    if (accN === 90) {
      const avg = acc / accN;
      acc = 0; accN = 0;
      if (avg > 1 / 30) { if (quality > 0) applyTier(quality - 1); else if (pixelRatio > 0.52) setPR(Math.max(0.5, pixelRatio * 0.86)); }
      else if (avg < 1 / 52 && pixelRatio < prMax - 0.01) setPR(Math.min(prMax, pixelRatio * 1.1));
    }
  }
}

function start() {
  const tb = performance.now();
  build();
  console.info('[sakura] built in', Math.round(performance.now() - tb), 'ms');
  post = createPost(renderer, scene, camera);
  rig = createRig(camera, renderer.domElement, {
    collide,
    pickables: () => pickables.filter(visibleDeep),
    onView: (name) => buttons.forEach((b) => b.classList.toggle('active', b.dataset.view === name)),
    onPick,
    onHover: (c, x, y) => ui.hover?.(c, x, y),
  });
  window.__sakura = { renderer, scene, camera, env, get life() { return life; }, frame: (ts) => frame(ts), tier: (q) => applyTier(q), get post() { return post; }, get rig() { return rig; }, ctx };
  wireUI();
  // first frame of environment so the benchmark sees real lighting
  env.update(0.016, 0);
  applyEnvironment(env, { sun, hemi, scene, renderer, sky: skyUniforms, water: waterUniforms, camera, rainbow });
  rig.setImmediate('overview', 1.7, -1.1, -0.5);
  benchmark();
  requestAnimationFrame(frame);
}
setTimeout(start, 60);
