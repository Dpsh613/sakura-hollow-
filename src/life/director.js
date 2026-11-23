import * as THREE from 'three';
import { rand, pick, chance, clamp } from '../core/noise.js';
import { walkHeight } from '../world/island.js';
import { Character } from './character.js';
import { rabbitRig, foxRig, owlRig, pigletRig, mouseRig, birdRig, frogRig, hedgehogRig } from './rig.js';
import * as A from './activities.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// The cast. Each has a personality that colours every decision they make.
// ---------------------------------------------------------------------------
function castList() {
  return [
    { name: 'Mochi', species: 'rabbit', rig: rabbitRig(), start: V(-2.9, 0, -0.4), home: 'treehouse', blurb: 'a gentle white rabbit who loves flowers',
      traits: { social: 0.9, playful: 0.55, shy: 0.25, curious: 0.5, florist: 1, stargazer: 0.8, pace: 1 } },
    { name: 'Peaches', species: 'rabbit', rig: rabbitRig({ fur: '#f4b9b9', inner: '#e8829a', cheek: '#ec7f90', belly: '#fbe0dc', bow: '#7fc4a8' }), start: V(1.3, 0, 2.2), home: 'treehouse', scale: 0.95, blurb: 'a bubbly pink rabbit with a green thumb',
      traits: { social: 0.85, playful: 0.95, gardener: 1, rainLover: 1, curious: 0.6, pace: 1.1 } },
    { name: 'Hazel', species: 'fox', rig: foxRig(), start: V(-0.9, 0, 1.9), home: 'outdoors', blurb: 'a curious, mischievous fox who fishes and lights the fire',
      traits: { social: 0.7, playful: 0.9, curious: 0.95, fisher: 1, firestarter: 1, mischief: 0.8, pace: 1.1 } },
    { name: 'Professor Hoot', species: 'owl', rig: owlRig(), start: V(-0.6, 0, -1.5), home: 'perch', scale: 0.95, blurb: 'a wise, sleepy owl who tells stories at night',
      traits: { social: 0.6, playful: 0.2, curious: 0.6, nocturnal: 1, storyteller: 1, grumpy: 0.3, pace: 0.9 } },
    { name: 'Biscuit', species: 'piglet', rig: pigletRig({ scarf: '#e8b23a' }), start: V(4.35, 0, 4.25), home: 'outdoors', scale: 0.92, blurb: 'a hungry, happy piglet who loves to dance',
      traits: { social: 0.85, playful: 0.9, foodie: 1, dancer: 1, grumpy: 0.25, pace: 1 } },
    { name: 'Bean', species: 'piglet', rig: pigletRig({ skin: '#f6bfb5', dark: '#e59a92' }), start: V(3.35, 0, 5.35), home: 'outdoors', scale: 0.78, blurb: "Biscuit's little sister, a bit shy",
      traits: { social: 0.7, playful: 0.75, shy: 0.6, foodie: 0.8, dancer: 0.8, grumpy: 0.2, pace: 1 } },
    { name: 'Pip', species: 'mouse', rig: mouseRig(), start: V(-1.85, 0, -1.75), home: 'root', scale: 0.92, blurb: 'a shy little mouse who lives behind the root door',
      traits: { social: 0.6, playful: 0.6, shy: 0.9, curious: 0.7, boater: 1, scaredOfStorms: 1, pace: 1.15 } },
    { name: 'Wren', species: 'bird', rig: birdRig(), start: V(-4.3, 0, 1.4), home: 'birdhouse', scale: 1.15, blurb: 'a free-spirited songbird',
      traits: { social: 0.4, playful: 0.6, flier: 1, singer: 1, pace: 1 } },
    { name: 'Lily', species: 'frog', rig: frogRig(), start: V(-4.4, 0, 4.0), home: 'outdoors', scale: 1.0, blurb: 'a laid-back frog who adores the rain',
      traits: { social: 0.4, playful: 0.6, rainLover: 1, pondDweller: 1, pace: 1 } },
    { name: 'Bramble', species: 'hedgehog', rig: hedgehogRig(), start: V(-1.5, 0, -7.4), home: 'log', scale: 1.1, blurb: 'a sleepy hedgehog who visits after dark',
      traits: { social: 0.3, playful: 0.3, shy: 0.95, nocturnal: 1, visitor: 1, pace: 0.9 } },
  ];
}

const AFFINITY = {
  'Mochi|Peaches': 0.9, 'Biscuit|Bean': 0.9, 'Hazel|Biscuit': 0.7, 'Mochi|Pip': 0.8, 'Hazel|Peaches': 0.6,
  'Hazel|Pip': 0.5, 'Professor Hoot|Mochi': 0.6, 'Professor Hoot|Pip': 0.6, 'Bean|Pip': 0.6, 'Peaches|Biscuit': 0.6,
  'Lily|Peaches': 0.5, 'Bramble|Pip': 0.4, 'Mochi|Bean': 0.6, 'Hazel|Professor Hoot': 0.4,
};

export function createLife(ctx) {
  const chars = castList().map((def) => new Character(ctx, def));
  const byName = Object.fromEntries(chars.map((c) => [c.name, c]));
  const reservations = new Map(); // key: point object -> character
  const locks = {};
  const seatsTaken = new Map();
  const bonds = {};
  const key = (a, b) => [a.name, b.name].sort().join('|');
  const affinity = (a, b) => (bonds[key(a, b)] ?? AFFINITY[key(a, b)] ?? AFFINITY[`${b.name}|${a.name}`] ?? 0.35);

  // context helpers the activities rely on -------------------------------------------------
  Object.assign(ctx, {
    characters: chars,
    stargazers: [],
    storyTime: false,
    reserve(c, list, rad = 0.5) {
      const free = list.filter((p) => !reservations.has(p));
      if (!free.length) return null;
      free.sort((a, b) => a.distanceTo(c.pos) - b.distanceTo(c.pos));
      const p = chance(0.6) ? free[0] : pick(free);
      reservations.set(p, c);
      c._res = p;
      return p;
    },
    release(c) { if (c._res) { reservations.delete(c._res); c._res = null; } },
    reserveSeat(c, seats) {
      const free = seats.filter((s) => !seatsTaken.has(s));
      if (!free.length) return null;
      const s = pick(free);
      seatsTaken.set(s, c); c._seat = s;
      return s;
    },
    releaseSeat(c) { if (c._seat) { seatsTaken.delete(c._seat); c._seat = null; } },
    lock(name, c) { if (locks[name] && locks[name] !== c) return false; locks[name] = c; return true; },
    unlock(name, c) { if (locks[name] === c) delete locks[name]; },
    claim(other, by, label) {
      if (!interruptible(other)) return false;
      stopActivity(other);
      other.activity = { name: 'with', gen: A.wait(999), social: true, leader: by };
      other.label = label || `with ${by.name}`;
      return true;
    },
    free(other) { if (other.activity?.name === 'with') { other.activity = null; other.label = 'wandering about'; } },
    bond(a, b, d) { bonds[key(a, b)] = clamp(affinity(a, b) + d, 0, 1); },
    neighbours(c, r) { return chars.filter((o) => o !== c && !o.inside && o.pos.distanceTo(c.pos) < r); },
    mostInteresting(c) {
      let best = null, bs = -1;
      for (const o of chars) {
        if (o === c || o.inside) continue;
        const d = o.pos.distanceTo(c.pos);
        if (d > 9) continue;
        const s = (o.speed > 0.5 ? 1 : 0.2) + (o.talkT > 0 ? 1 : 0) + (o.activity?.fun ? 1 : 0) + affinity(c, o) - d * 0.08;
        if (s > bs) { bs = s; best = o; }
      }
      return best;
    },
    pickPuddle(c) {
      if (ctx.env.puddles < 0.25) return null;
      return pick(ctx.places.puddles);
    },
    wantsInside(c, reason) {
      const e = ctx.env;
      if (reason === 'rain') return e.rain > 0.15 || e.snow > 0.5 || e.storm > 0.3;
      if (c.traits.nocturnal) return e.night < 0.5;
      return e.hour >= 21.5 || e.hour < 6.6;
    },
  });

  const interruptible = (c) => !c.activity || ['wander', 'watch', 'lookout', 'with-idle'].includes(c.activity.name) || (c.activity.name === 'nap' && false);
  function stopActivity(c) {
    if (c.activity) {
      const a = c.activity;
      c.activity = null;
      try { a.gen.return(); } catch (e) { /* noop */ }
      if (a.partner) ctx.free(a.partner);
    }
    c.stop();
    ctx.release(c);
    ctx.releaseSeat(c);
  }
  function start(c, name, gen, { social = false, fun = false, partner = null } = {}) {
    stopActivity(c);
    c.activity = { name, gen, social, fun, partner };
    c.activityStart = performance.now();
  }

  // ---- decision making ----------------------------------------------------------------------------------
  function partnerFor(c, filter = () => true) {
    const cands = chars.filter((o) => o !== c && !o.inside && interruptible(o) && !o.flight && o.species !== 'bird' && o.species !== 'frog' && filter(o) && o.pos.distanceTo(c.pos) < 11);
    if (!cands.length) return null;
    cands.sort((a, b) => (affinity(c, b) + b.needs.social * 0.5 - b.pos.distanceTo(c.pos) * 0.04) - (affinity(c, a) + a.needs.social * 0.5 - a.pos.distanceTo(c.pos) * 0.04));
    return chance(0.75) ? cands[0] : pick(cands.slice(0, 3));
  }

  function choose(c) {
    const e = ctx.env, T = c.traits, N = c.needs, P = ctx.places;
    const night = e.night > 0.5;
    const evening = e.hour >= 18.6 && e.hour < 23.4;
    const lateNight = e.hour >= 21.5 || e.hour < 6.6;
    const raining = e.rain > 0.25 || e.storm > 0.3;
    const snowing = e.snow > 0.4;
    const fire = P.campfire;

    // ---- species with their own rhythms ----
    if (c.species === 'owl') {
      if (!night) return start(c, 'perch', A.owlPerch(c, ctx));
      if (evening && fire.lit > 0.5 && !ctx.storyTime && chance(0.45) && ctx.neighbours({ pos: fire.center }, 3).length >= 1) return start(c, 'story', A.storyTime(c, ctx), { social: true });
      if (evening && fire.lit > 0.5 && chance(0.4)) return start(c, 'campfire', A.campfire(c, ctx), { social: true });
      if (chance(0.25)) { c.say('hoot', 1.4); }
      if (chance(0.3)) return start(c, 'watch', A.watch(c, ctx));
      return start(c, 'wander', A.wander(c, ctx));
    }
    if (c.species === 'bird') {
      if (night || raining || snowing) return start(c, 'home', A.goHome(c, ctx, night ? 'night' : 'rain'));
      return start(c, 'flit', A.birdFlit(c, ctx));
    }
    if (c.species === 'frog') {
      if (e.ice > 0.6) { if (chance(0.6)) return start(c, 'nap', A.goHome(c, ctx, 'night')); return start(c, 'wander', A.wander(c, ctx)); }
      return start(c, 'pond', A.frogLife(c, ctx));
    }
    if (c.species === 'hedgehog') {
      if (!night) return start(c, 'home', A.hedgehogHide(c, ctx, true));
      const someoneNear = ctx.neighbours(c, 1.1).length > 0;
      if (someoneNear && chance(0.7)) {
        c.curlT = 1; c.emote('bang');
        return start(c, 'curl', (function* () { yield* A.wait(3.5); c.curlT = 0; c.emote('question'); yield* A.wait(0.6); })());
      }
      if (evening && fire.lit > 0.5 && chance(0.3)) return start(c, 'campfire', A.campfire(c, ctx));
      return start(c, 'forage', A.hedgehogForage(c, ctx));
    }

    // ---- everyone else ----
    if ((raining || snowing && chance(0.5)) && !(T.rainLover && !e.storm && chance(0.7))) {
      if ((c.home === 'treehouse' || c.home === 'root') && (chance(0.55) || T.scaredOfStorms && e.storm > 0.3)) return start(c, 'home', A.goHome(c, ctx, 'rain'));
      return start(c, 'shelter', A.shelter(c, ctx));
    }
    if (lateNight && !(evening && fire.lit > 0.5 && N.energy > 0.35 && e.hour < 23)) return start(c, 'home', A.goHome(c, ctx, 'night'));

    const cands = [];
    const add = (w, fn) => { if (w > 0) cands.push([w, fn]); };
    // night-time & evening
    if (evening && fire.lit > 0.5) add(1.6 + T.social, () => start(c, 'campfire', A.campfire(c, ctx), { social: true }));
    if (evening && fire.lit < 0.3 && T.firestarter && e.night > 0.25) add(4, () => start(c, 'light', A.lightFire(c, ctx)));
    if (night && e.stars > 0.5 && e.cloud < 0.55 && ctx.stargazers.length === 0 && (T.stargazer || chance(0.3))) {
      const p = partnerFor(c, (o) => o.species !== 'piglet' || chance(0.5));
      if (p) add(1.2, () => { if (ctx.claim(p, c, 'stargazing')) start(c, 'stargaze', A.stargaze(c, p, ctx), { social: true, partner: p }); });
    }
    // rain lovers
    if (raining && T.rainLover && e.puddles > 0.25) add(3, () => start(c, 'splash', A.splash(c, ctx), { fun: true }));
    if (e.puddles > 0.35 && !raining && T.playful > 0.8) add(0.8, () => start(c, 'splash', A.splash(c, ctx), { fun: true }));
    // daytime pursuits
    if (!night) {
      if (T.gardener && e.season !== 3) add(1.4 + (P.garden.plots.some((p) => p.thirst > 0.5) ? 1 : 0), () => start(c, 'garden', A.garden(c, ctx)));
      if (T.fisher && e.ice < 0.5) add(1.3, () => start(c, 'fish', A.fish(c, ctx)));
      if (T.florist && e.season < 2) {
        const f = partnerFor(c);
        add(1.2, () => start(c, 'flowers', A.collectFlowers(c, ctx, chance(0.7) ? f : null), { social: true, partner: f }));
      }
      if (T.boater && e.ice < 0.4 && !ctx.boat.active) add(0.7, () => start(c, 'boat', A.paperBoat(c, ctx), { fun: true }));
      if (T.playful > 0.5 && !ctx.places.swingBusy()) {
        const pusher = chance(0.6) ? partnerFor(c) : null;
        add(0.8 + N.fun, () => { const ok = pusher && ctx.claim(pusher, c, 'heading to the swing'); start(c, 'swing', A.swingPlay(c, ok ? pusher : null, ctx), { fun: true, partner: ok ? pusher : null }); });
      }
      if (T.dancer && e.cloud < 0.5 && e.hour > 9 && e.hour < 18) {
        const p = partnerFor(c, (o) => o.traits.dancer || o.traits.playful > 0.8);
        if (p) add(0.9 + N.fun, () => { if (ctx.claim(p, c, 'dancing')) start(c, 'dance', A.dance(c, p, ctx), { social: true, fun: true, partner: p }); });
      }
      add(0.35 + (1 - N.energy) * 1.6 + (e.hour > 13 && e.hour < 16 ? 0.4 : 0), () => start(c, 'nap', A.nap(c, ctx)));
      add(0.4 + (T.shy || 0) * 0.5, () => start(c, 'lookout', A.lookout(c, ctx)));
    }
    // social at any time of day
    const friend = partnerFor(c);
    if (friend) {
      add(0.6 + N.social * 1.8 * affinity(c, friend), () => { if (ctx.claim(friend, c)) start(c, 'chat', A.chat(c, friend, ctx), { social: true, partner: friend }); });
      if (!night && T.playful > 0.6 && friend.traits.playful > 0.5) add((0.5 + N.fun * 1.4) * (T.mischief ? 1.4 : 1), () => { if (ctx.claim(friend, c)) start(c, 'chase', A.chase(c, friend, ctx), { social: true, fun: true, partner: friend }); });
      if (N.hunger > 0.4 || T.foodie) add((T.foodie ? 0.9 : 0.4) + N.hunger, () => { if (ctx.claim(friend, c)) start(c, 'share', A.shareFood(c, friend, ctx), { social: true, partner: friend }); });
    }
    add(0.5 + (T.shy || 0) * 0.8, () => start(c, 'watch', A.watch(c, ctx)));
    add(0.7 + T.curious * 0.6, () => start(c, 'wander', A.wander(c, ctx)));

    // weighted pick
    const total = cands.reduce((s, x) => s + x[0], 0);
    let r = rand(0, total);
    for (const [w, fn] of cands) { r -= w; if (r <= 0) { fn(); return; } }
    start(c, 'wander', A.wander(c, ctx));
  }

  // ---- world events -------------------------------------------------------------------------------------
  const env = ctx.env;
  const awakeOutside = () => chars.filter((c) => !c.inside && !c.asleep);
  env.on('rainStart', () => {
    for (const c of awakeOutside()) {
      c.look(c.pos.clone().add(V(0, 6, 0)), 1.5);
      if (chance(0.5)) c.emote(c.traits.rainLover ? 'heart' : 'drop');
      if (['wander', 'watch', 'lookout', 'nap', 'flit', 'dance', 'swing'].includes(c.activity?.name) && !c.traits.rainLover) c.paused = 0, stopActivity(c);
    }
    if (chance(0.7)) ctx.story(pick(['Pitter-patter... it has started to rain', 'Rain clouds rolled in', 'The first raindrops are falling']));
  });
  env.on('thunder', () => {
    for (const c of awakeOutside()) {
      c.hop(); c.emote('bang'); c.eyeMode = 'wide';
      setTimeout(() => { if (c.eyeMode === 'wide') c.eyeMode = null; }, 900);
      if (c.traits.shy > 0.5 || c.traits.scaredOfStorms) { c.setGesture('cover', 1.6); c.setEmotion('shy', 3); }
    }
  });
  env.on('rainStop', () => {
    setTimeout(() => {
      if (env.rainbow > 0.1) {
        ctx.story('A rainbow!');
        for (const c of awakeOutside()) { c.setGesture('point', 2); c.emote('sparkle'); if (chance(0.5)) c.say('excited', 1); }
      }
    }, 5000);
  });
  env.on('dusk', () => { ctx.story(pick(['The sun is setting over Sakura Hollow', 'Evening falls and the lanterns glow', 'Dusk paints the sky pink and gold'])); });
  env.on('dawn', () => {
    ctx.places.campfire.want = env.season === 3 ? 1 : 0;
    ctx.story(pick(['Good morning, Sakura Hollow', 'A new day begins', 'The sun peeks over the clouds']));
  });
  env.on('season', (name) => ctx.story(`${name} has come to the island`));
  ctx.onShootingStar = () => {
    for (const c of chars) {
      if (c.inside || c.asleep) continue;
      if (ctx.stargazers.includes(c) || chance(0.5)) { c.emote('star'); c.setGesture('point', 2); c.say('excited', 1); }
    }
    ctx.story('A shooting star! Make a wish...');
  };

  // ---- user poke ---------------------------------------------------------------------------------------
  function poke(c, cameraPos) {
    if (c.inside) return;
    if (c.asleep) { c.emote('z'); c.say('snore', 1); c.earTwitch = 1; return; }
    c.paused = 2.8;
    c.look(cameraPos, 2.8);
    c.face(cameraPos);
    if (c.traits.shy > 0.7) { c.setGesture('cover', 1.4); c.setEmotion('shy', 4); c.emote('love'); c.say('shy', 0.8); }
    else if (c.species === 'hedgehog') { c.curlT = 1; setTimeout(() => { c.curlT = 0; c.emote('question'); }, 2500); c.emote('bang'); }
    else {
      c.pokes = (c.pokes || 0) + 1;
      if (c.pokes > 3 && chance(0.6)) { c.say('grumble', 0.9); c.emote('puff'); c.setGesture('stomp', 0.8); c.pokes = 0; }
      else { c.setGesture(chance(0.5) ? 'wave' : 'cheer', 1.6); c.say('greet', 0.9); c.setEmotion('happy', 3); c.emote(pick(['heart', 'sparkle', 'note'])); c.hop(); }
    }
    setTimeout(() => { c.pokes = Math.max(0, (c.pokes || 0) - 1); }, 15000);
  }

  // ---- per frame -------------------------------------------------------------------------------------------
  let decideT = 0;
  const tmp = new THREE.Vector3();
  return {
    chars, byName, poke, affinity,
    finish(c) { const a = c.activity; c.activity = null; if (a?.partner) ctx.free(a.partner); ctx.release(c); ctx.releaseSeat(c); c.label = 'wandering about'; },
    update(dt, t) {
      decideT -= dt;
      if (decideT <= 0) {
        decideT = 0.4;
        for (const c of chars) if (!c.activity && c.paused <= 0) choose(c);
      }
      for (const c of chars) {
        c.update(dt, t);
        if (c.dropLater) { c.dropLater -= dt; if (c.dropLater <= 0) { c.dropLater = 0; if (!c.activity || c.activity.name === 'with' || c.activity.name === 'wander') c.drop(); } }
      }
      // gentle separation so nobody walks through anyone
      for (let i = 0; i < chars.length; i++) {
        const a = chars[i];
        if (a.inside || a.flight || a.perched || a.sitT > 0.5 || a.riding) continue;
        for (let j = i + 1; j < chars.length; j++) {
          const b = chars[j];
          if (b.inside || b.flight || b.perched || b.sitT > 0.5 || b.riding) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          const minD = 0.32 * (a.scale + b.scale) + 0.1;
          if (d > 1e-4 && d < minD) {
            const push = (minD - d) * 0.5;
            const ax = (dx / d) * push, az = (dz / d) * push;
            if (a.activity?.name !== 'dance') { a.pos.x -= ax; a.pos.z -= az; }
            if (b.activity?.name !== 'dance') { b.pos.x += ax; b.pos.z += az; }
          }
          // passing greetings
          if (d < 1.6 && a.greetCD <= 0 && b.greetCD <= 0 && !a.busySocial && !b.busySocial && !a.asleep && !b.asleep && (a.moving || b.moving)) {
            a.greetCD = b.greetCD = rand(18, 35);
            a.look(b, 1.8); b.look(a, 1.8);
            const w = chance(0.5) ? a : b;
            if (chance(0.7)) { w.setGesture('wave', 1); w.say('greet', 0.6); }
            else { w.nod = 1; }
            if (affinity(a, b) > 0.7 && chance(0.4)) w.emote('heart');
          }
        }
      }
    },
    labelFor(c) {
      return { name: c.name, blurb: c.def.blurb, doing: c.label };
    },
  };
}
