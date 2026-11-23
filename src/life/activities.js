import * as THREE from 'three';
import { rand, randInt, pick, chance, clamp } from '../core/noise.js';
import { walkHeight, groundHeight } from '../world/island.js';
import { makeItem } from '../world/places.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// coroutine helpers (each yield receives dt)
// ---------------------------------------------------------------------------
export function* wait(s) { let t = 0; while (t < s) t += (yield) ?? 0.016; }
export function* walk(c, target, opts = {}) {
  c.goTo(target, opts);
  let t = 0;
  while (c.moving) { t += (yield) ?? 0.016; if (t > (opts.timeout ?? 35)) { c.stop(); break; } }
}
export function* fly(c, target, opts) {
  c.flyTo(target, opts);
  while (c.flight) yield;
}
export function* all(...gens) {
  const done = gens.map(() => false);
  while (!done.every(Boolean)) {
    const dt = yield;
    gens.forEach((g, i) => { if (!done[i] && g.next(dt).done) done[i] = true; });
  }
}
function* turnTo(c, p, t = 0.4) { c.face(p); yield* wait(t); }
const near = (c, p, d) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < d;
function sitAt(c, seat) {
  c.pos.set(seat.pos.x, 0, seat.pos.z);
  c.yOverride = seat.seatY;
  c.targetYaw = c.yaw = seat.face;
  c.sitT = 1;
}
function standUp(c) { c.sitT = 0; c.lieT = 0; c.backT = 0; c.yOverride = null; }
function reset(c) {
  c.sitT = 0; c.lieT = 0; c.backT = 0; c.curlT = 0;
  if (!c.perched) c.yOverride = null;
  c.eyeMode = null; c.gesture = 'rest'; c.sheltered = false;
  c.lookTarget = null;
}

// ---------------------------------------------------------------------------
// solo activities
// ---------------------------------------------------------------------------
export function* wander(c, ctx) {
  try {
    const P = ctx.places;
    const target = chance(0.55) ? ctx.nav.randomPoint(c.pos.x, c.pos.z, 4.5, 1.2) : pick(P.interest).clone();
    c.label = pick(['wandering about', 'exploring the meadow', 'taking a little stroll', 'looking for something interesting']);
    yield* walk(c, target);
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      c.look(c.pos.clone().add(V(rand(-3, 3), rand(0.2, 1.8), rand(-3, 3))), 1.6);
      yield* wait(rand(1, 2.4));
    }
    if (chance(0.35)) { c.tilt = 0.3; c.setEmotion('curious', 2); c.emote(pick(['question', 'sparkle'])); yield* wait(1.4); c.tilt = 0; }
    if (chance(0.2)) { c.sitT = 1; c.label = 'sitting in the grass'; yield* wait(rand(3, 7)); c.sitT = 0; }
  } finally { reset(c); }
}

export function* nap(c, ctx) {
  const spot = ctx.reserve(c, ctx.places.napSpots, 0.8);
  if (!spot) return;
  try {
    c.label = pick(['taking a nap under the tree', 'dozing in a sunny spot', 'having a snooze']);
    yield* walk(c, spot);
    c.say('yawn', 1.2);
    c.setGesture('stretch', 1.3);
    yield* wait(1.4);
    c.lieT = 1; c.eyeMode = 'closed';
    const dur = rand(18, 40);
    let t = 0, zt = 0;
    while (t < dur && !(ctx.env.rain > 0.3 && !c.traits.rainLover)) {
      const dt = yield; t += dt; zt += dt;
      if (zt > 3.2) { zt = 0; c.emote('z'); if (chance(0.5)) c.say('snore', 1.2); }
    }
    c.eyeMode = null; c.lieT = 0;
    yield* wait(0.6);
    c.setGesture('stretch', 1.4); c.say('yawn', 1.0);
    yield* wait(1.5);
  } finally { ctx.release(c); reset(c); }
}

export function* garden(c, ctx) {
  const G = ctx.places.garden;
  if (!ctx.lock('garden', c)) return;
  try {
    c.label = 'tending the vegetable garden';
    const canPos = G.can.getWorldPosition(V()).setY(0);
    yield* walk(c, canPos.clone().add(V(0, 0, 0.3)));
    c.sitT = 0.4; yield* wait(0.5); c.sitT = 0;
    G.can.visible = false;
    c.hold(makeItem('can'));
    const thirsty = [...G.plots].sort((a, b) => b.thirst - a.thirst).slice(0, 3);
    for (const plot of thirsty) {
      const wp = G.worldOf(plot);
      yield* walk(c, G.frontAt(plot.local.x));
      yield* turnTo(c, wp);
      c.setGesture('water', 3);
      c.label = 'watering the vegetables';
      ctx.audio?.sfx('pour', c.pos);
      for (let k = 0; k < 10; k++) { ctx.fx.spawnSplash(wp.x + rand(-0.1, 0.1), wp.y + 0.12, wp.z + rand(-0.1, 0.1)); yield* wait(0.28); }
      plot.thirst = 0; plot.growth = Math.min(1, plot.growth + 0.08);
      if (chance(0.4)) { c.say('hum', 1.4); c.emote('note'); }
    }
    yield* walk(c, canPos.clone().add(V(0, 0, 0.3)));
    c.drop(); G.can.visible = true;
    const ripe = G.plots.find((p) => p.growth > 0.92);
    if (ripe) {
      const wp = G.worldOf(ripe);
      yield* walk(c, G.frontAt(ripe.local.x));
      yield* turnTo(c, wp);
      c.label = 'harvesting';
      c.sitT = 0.6; c.setGesture('hold', 1.2);
      yield* wait(0.8);
      ctx.audio?.sfx('pluck', wp);
      ripe.growth = 0.12;
      c.sitT = 0; c.hop();
      c.hold(makeItem(ripe.kind === 'carrot' ? 'carrot' : ripe.kind === 'cabbage' ? 'apple' : 'flowers'));
      c.emote('star'); c.say('excited', 1.2); c.setEmotion('happy', 3);
      ctx.story(`${c.name} pulled up a ${ripe.kind === 'carrot' ? 'fat carrot' : ripe.kind === 'cabbage' ? 'crunchy cabbage' : 'handful of strawberries'}!`);
      yield* wait(1.2);
      c.label = 'carrying the harvest to the cart';
      yield* walk(c, ctx.places.cart.front);
      c.setGesture('offer', 0.8); yield* wait(0.7); c.drop();
      ctx.audio?.sfx('pop', c.pos);
    }
  } finally { ctx.unlock('garden', c); c.drop(); G.can.visible = true; reset(c); }
}

export function* collectFlowers(c, ctx, friend) {
  try {
    c.label = 'picking flowers';
    const spots = [...ctx.places.flowerSpots].sort(() => Math.random() - 0.5).slice(0, randInt(2, 3));
    for (let i = 0; i < spots.length; i++) {
      yield* walk(c, spots[i]);
      c.sitT = 0.55; c.look(spots[i].clone().setY(walkHeight(spots[i].x, spots[i].z)), 1.2);
      yield* wait(1.1);
      ctx.audio?.sfx('pick', c.pos);
      c.sitT = 0;
      if (i === 0) c.hold(makeItem('flowers'));
      c.emote('sparkle');
      yield* wait(0.5);
    }
    if (friend && ctx.claim(friend, c, `waiting for ${c.name}`)) {
      c.label = `bringing flowers to ${friend.name}`;
      yield* walk(c, friend.pos, { stop: 0.6 });
      c.face(friend.pos); friend.face(c.pos); friend.look(c, 4); c.look(friend, 4);
      c.setGesture('offer', 1.6); c.say('excited', 1.1);
      yield* wait(1.1);
      const item = c.held; c.held = null; friend.hold(item);
      friend.setEmotion('happy', 5); friend.emote('heart'); friend.say('laugh', 1.2);
      c.setEmotion('happy', 4); c.emote('love', { delay: 0.3 });
      ctx.story(`${c.name} gave ${friend.name} a bouquet of flowers`);
      ctx.bond(c, friend, 0.1);
      yield* wait(2.2);
      ctx.free(friend);
      friend.dropLater = 25;
    } else {
      yield* walk(c, ctx.places.picnic.spots[0]);
      c.setGesture('offer', 0.8); yield* wait(0.8); c.drop();
    }
  } finally { c.drop(); reset(c); }
}

export function* fish(c, ctx) {
  const D = ctx.places.dock;
  if (!ctx.lock('dock', c)) return;
  try {
    c.label = 'heading to the dock to fish';
    yield* walk(c, D.start);
    c.goDirect([D.end.clone()]);
    while (c.moving) { c.yOverride = D.deckY; yield; }
    c.yOverride = D.deckY - 0.05;
    c.targetYaw = c.yaw = D.face;
    c.sitT = 1;
    c.hold(makeItem('rod'));
    c.setGesture('rod');
    yield* wait(0.8);
    c.label = 'fishing at the dock';
    ctx.fishing.cast(c);
    ctx.audio?.sfx('plop', ctx.fishing.bobber.position);
    const dur = rand(10, 26);
    let t = 0;
    while (t < dur) {
      const dt = yield; t += dt;
      c.setGesture('rod');
      if (chance(dt * 0.08)) { c.look(ctx.fishing.bobber.position, 2); }
      if (chance(dt * 0.03)) c.say('hum', 1.2);
    }
    if (chance(0.62)) {
      ctx.fishing.bite();
      c.eyeMode = 'wide'; c.emote('bang'); c.say('excited', 0.8); c.setEmotion('surprised', 1);
      yield* wait(0.9);
      c.eyeMode = null;
      ctx.fishing.reel();
      ctx.water.ripple(ctx.fishing.bobber.position.x, ctx.fishing.bobber.position.z, 1.5);
      ctx.audio?.sfx('splash', ctx.fishing.bobber.position);
      c.drop();
      c.hold(makeItem('fish'));
      c.sitT = 0; c.setGesture('cheer', 2); c.hop(); c.say('laugh', 1.4); c.setEmotion('happy', 5);
      c.emote('star'); c.emote('sparkle', { delay: 0.3 });
      ctx.story(pick([`${c.name} caught a fish!`, `${c.name} reeled in a shiny little fish`, `A fish for ${c.name}! What a catch!`]));
      yield* wait(2.6);
      c.label = 'letting the fish go';
      c.setGesture('offer', 1);
      yield* wait(0.8);
      c.drop();
      ctx.water.ripple(D.end.x + Math.sin(D.face) * 0.6, D.end.z + Math.cos(D.face) * 0.6, 1);
      ctx.audio?.sfx('splash', D.end);
      c.emote('heart');
      yield* wait(1);
    } else {
      ctx.fishing.hide();
      c.setGesture('shrug', 1.3); c.say('sigh', 1); c.emote('drop');
      yield* wait(1.4);
    }
    ctx.fishing.hide();
    c.drop(); c.sitT = 0;
    c.goDirect([D.start.clone()]);
    while (c.moving) { c.yOverride = D.deckY; yield; }
  } finally { ctx.fishing.hide(); ctx.unlock('dock', c); c.drop(); reset(c); }
}

export function* lookout(c, ctx) {
  const seat = ctx.reserve(c, ctx.places.lookout.seats.map((s) => s.pos), 0.3);
  if (!seat) return;
  const S = ctx.places.lookout.seats.find((s) => s.pos === seat);
  try {
    c.label = 'watching the clouds drift by';
    yield* walk(c, seat, { stop: 0.2 });
    sitAt(c, S);
    const dur = rand(15, 30);
    let t = 0;
    while (t < dur) {
      const dt = yield; t += dt;
      c.look(V(c.pos.x + Math.sin(S.face) * 10, 2 + Math.sin(t * 0.2) * 2, c.pos.z + Math.cos(S.face) * 10), 1);
      if (chance(dt * 0.07)) c.emote(pick(['sparkle', 'heart']));
      if (chance(dt * 0.05)) c.say('sigh', 1.1);
    }
  } finally { ctx.release(c); standUp(c); reset(c); }
}

export function* watch(c, ctx) {
  const seats = ctx.places.watchSeats;
  const S = ctx.reserveSeat(c, seats);
  if (!S) return;
  try {
    yield* walk(c, S.pos, { stop: 0.2 });
    sitAt(c, S);
    const dur = rand(15, 32);
    let t = 0, rt = 0, target = null;
    c.label = 'watching the others';
    while (t < dur) {
      const dt = yield; t += dt; rt -= dt;
      if (rt <= 0) {
        rt = rand(2.5, 5);
        target = ctx.mostInteresting(c);
        if (target) { c.look(target, 6); c.label = `watching ${target.name}`; }
      }
      if (target && target.talkKind === 'laugh' && target.talkT > 0 && chance(dt * 0.6)) { c.setGesture('clap', 1.2); c.say('laugh', 0.8); }
    }
  } finally { ctx.releaseSeat(c); standUp(c); reset(c); }
}

export function* splash(c, ctx) {
  const pud = ctx.pickPuddle(c);
  if (!pud) return;
  try {
    c.label = 'splashing in puddles!';
    yield* walk(c, V(pud.x, 0, pud.z), { run: true, stop: 0.2 });
    ctx.story(pick([`${c.name} is jumping in puddles`, `${c.name} found the perfect puddle`]));
    for (let i = 0; i < randInt(4, 8); i++) {
      c.hop();
      yield* wait(0.38);
      for (let k = 0; k < 6; k++) ctx.fx.spawnSplash(c.pos.x + rand(-0.3, 0.3), walkHeight(c.pos.x, c.pos.z) + 0.03, c.pos.z + rand(-0.3, 0.3));
      ctx.audio?.sfx('splash', c.pos, { small: true });
      if (chance(0.5)) c.say('laugh', 0.7);
      c.setEmotion('happy', 3);
      yield* wait(0.25);
      c.pos.x += rand(-0.15, 0.15); c.pos.z += rand(-0.15, 0.15);
    }
    c.emote('drop');
  } finally { reset(c); }
}

export function* shelter(c, ctx) {
  try {
    c.look(c.pos.clone().add(V(0, 5, 0)), 1.2);
    c.emote(chance(0.5) ? 'drop' : 'bang');
    yield* wait(0.8);
    const spot = ctx.reserve(c, ctx.places.shelterSpots, 0.6);
    if (!spot) return;
    c.label = 'sheltering from the rain';
    yield* walk(c, spot, { run: true });
    c.sheltered = true;
    c.face(V(c.pos.x, 0, c.pos.z + 3));
    let t = 0;
    while (ctx.env.rain > 0.15 || ctx.env.snow > 0.4) {
      const dt = yield; t += dt;
      if (chance(dt * 0.1)) c.look(c.pos.clone().add(V(rand(-3, 3), 3, 3)), 2);
      if (t > 4 && chance(dt * 0.06)) { c.say(pick(['chat', 'sigh']), 1); }
      if (t > 90) break;
    }
    c.sheltered = false;
    if (c.wet > 0.2) { c.label = 'shaking off the raindrops'; c.emote('drop'); yield* wait(1); }
    c.setGesture('stretch', 1.2);
    yield* wait(1.2);
  } finally { ctx.release(c); reset(c); }
}

// ---------------------------------------------------------------------------
// homes: rabbits in the treehouse, Pip behind the root door, Wren in the birdhouse
// ---------------------------------------------------------------------------
export function* goHome(c, ctx, reason = 'night') {
  const P = ctx.places;
  try {
    c.label = reason === 'rain' ? 'hurrying home out of the rain' : 'heading home for the night';
    if (c.home === 'treehouse') {
      const st = P.stairs;
      yield* walk(c, st.foot, { run: reason === 'rain' });
      c.label = 'climbing the treehouse stairs';
      c.goDirect(st.up);
      while (c.moving) yield;
      if (chance(0.5)) { c.face(V(0, 0, 0)); c.setGesture('wave', 1.2); c.say('bye', 0.8); yield* wait(1.2); }
      c.inside = true;
      c.label = 'snug inside the treehouse';
      ctx.audio?.sfx('door', st.door);
      while (ctx.wantsInside(c, reason)) yield* wait(1);
      c.inside = false;
      c.pos.set(st.door.x, 0, st.door.z); c.yOverride = st.door.y;
      c.say('yawn', 1); c.setGesture('stretch', 1.5);
      yield* wait(1.4);
      c.goDirect(st.down);
      while (c.moving) yield;
      c.yOverride = null;
    } else if (c.home === 'root') {
      yield* walk(c, P.rootDoor.front, { run: reason === 'rain' });
      c.face(P.rootDoor.inside);
      yield* wait(0.4);
      c.inside = true; c.label = 'curled up behind the little root door';
      ctx.audio?.sfx('door', P.rootDoor.front);
      while (ctx.wantsInside(c, reason)) yield* wait(1);
      c.inside = false;
      c.pos.copy(P.rootDoor.front);
      c.setGesture('stretch', 1.2); c.say('yawn', 0.8);
      yield* wait(1.3);
    } else if (c.home === 'birdhouse') {
      yield* fly(c, P.birdhouse.door.clone(), { height: 1 });
      c.inside = true; c.perched = true; c.label = 'tucked in the birdhouse';
      while (ctx.wantsInside(c, reason)) yield* wait(1);
      c.inside = false;
      c.pos.set(P.birdhouse.door.x, 0, P.birdhouse.door.z); c.yOverride = P.birdhouse.door.y;
      c.say('sing', 1.4); c.emote('note');
      yield* wait(1);
      yield* fly(c, P.birdhouse.perch.clone(), { height: 0.4 });
    } else {
      // outdoor sleepers (fox, piglets, frog)
      const spot = ctx.reserve(c, c.species === 'piglet' ? P.pigletBeds : P.napSpots, 0.6);
      if (!spot) return;
      c.label = 'settling down to sleep';
      yield* walk(c, spot);
      c.say('yawn', 1.2);
      yield* wait(1.2);
      c.lieT = 1; c.eyeMode = 'closed'; c.label = 'fast asleep';
      let zt = 0;
      while (ctx.wantsInside(c, reason)) { const dt = yield; zt += dt; if (zt > 3.5) { zt = 0; c.emote('z'); if (chance(0.3)) c.say('snore', 1.4); } }
      c.eyeMode = null; c.lieT = 0;
      yield* wait(0.8);
      c.setGesture('stretch', 1.5); c.say('yawn', 1);
      yield* wait(1.5);
      ctx.release(c);
    }
  } finally { c.inside = false; if (c.home !== 'birdhouse') c.perched = false; reset(c); }
}

export function* campfire(c, ctx) {
  const F = ctx.places.campfire;
  const S = ctx.reserveSeat(c, F.seats);
  if (!S) return;
  try {
    c.label = 'heading to the campfire';
    yield* walk(c, S.pos, { stop: 0.25 });
    sitAt(c, S);
    c.label = 'warming paws by the campfire';
    let t = 0;
    const dur = rand(40, 80);
    while (t < dur && F.lit > 0.3 && !(ctx.env.hour > 23.6 || (ctx.env.hour < 5 && c.needs.energy < 0.3))) {
      const dt = yield; t += dt;
      if (!ctx.storyTime) c.setGesture('warm');
      if (chance(dt * 0.05) && !ctx.storyTime) {
        const nb = ctx.neighbours(c, 2.6).find((o) => o.sitT > 0.5);
        if (nb) { c.look(nb, 3); c.say(pick(['chat', 'chat', 'laugh']), 1.3); if (chance(0.4)) { nb.look(c, 3); nb.say('laugh', 0.9); } }
      }
      if (chance(dt * 0.02)) c.emote(pick(['heart', 'sparkle', 'note']));
    }
  } finally { ctx.releaseSeat(c); standUp(c); reset(c); }
}

export function* lightFire(c, ctx) {
  const F = ctx.places.campfire;
  try {
    c.label = 'going to light the campfire';
    yield* walk(c, F.center.clone().add(V(0.7, 0, 0.3)), { stop: 0.25 });
    c.face(F.center);
    c.sitT = 0.6;
    c.setGesture('hold', 1.5);
    yield* wait(1.4);
    F.want = 1;
    ctx.audio?.sfx('whoosh', F.center);
    c.sitT = 0; c.hop(); c.setGesture('cheer', 1.5); c.emote('star'); c.say('excited', 1);
    ctx.story(`${c.name} lit the campfire`);
    yield* wait(1.6);
  } finally { reset(c); }
}

export function* paperBoat(c, ctx) {
  try {
    const P = ctx.places;
    c.label = 'fetching a paper boat';
    yield* walk(c, P.rootDoor.front);
    c.inside = true; yield* wait(1.2); c.inside = false;
    c.hold(makeItem('boat'));
    c.emote('sparkle');
    const shore = pick(P.pondShore);
    c.label = 'launching a little paper boat';
    yield* walk(c, shore);
    c.face(P.pondCentre);
    c.sitT = 0.6; yield* wait(0.8);
    c.drop();
    ctx.boat.launch(shore, P.pondCentre);
    ctx.audio?.sfx('plop', shore);
    ctx.story(`${c.name} set a tiny paper boat sailing across the pond`);
    c.sitT = 0;
    let t = 0;
    while (t < 14) {
      const dt = yield; t += dt;
      c.look(ctx.boat.mesh.position, 1);
      if (chance(dt * 0.25)) { c.setGesture('clap', 1); c.say('laugh', 0.6); }
    }
    c.emote('heart');
  } finally { c.drop(); c.inside = false; reset(c); }
}

// ---------------------------------------------------------------------------
// pair activities (leader drives both)
// ---------------------------------------------------------------------------
function meet(a, b, ctx, gap = 0.95) {
  const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
  let p = mid;
  if (!ctx.nav.walkableAt(p.x, p.z)) p = ctx.nav.randomPoint(mid.x, mid.z, 2);
  const dir = b.pos.clone().sub(a.pos).setY(0);
  if (dir.lengthSq() < 1e-3) dir.set(1, 0, 0);
  dir.normalize();
  return [p.clone().addScaledVector(dir, -gap / 2), p.clone().addScaledVector(dir, gap / 2)];
}

export function* chat(a, b, ctx) {
  try {
    a.label = `chatting with ${b.name}`; b.label = `chatting with ${a.name}`;
    const [pa, pb] = meet(a, b, ctx);
    yield* all(walk(a, pa, { stop: 0.2 }), walk(b, pb, { stop: 0.2 }));
    a.face(b.pos); b.face(a.pos); a.look(b, 99); b.look(a, 99);
    a.say('greet', 0.7); a.setGesture('wave', 1);
    yield* wait(0.8);
    b.say('greet', 0.7); b.setEmotion('happy', 2);
    yield* wait(0.8);
    let sp = a, li = b;
    const turns = randInt(3, 6);
    for (let i = 0; i < turns; i++) {
      const kind = pick(['chat', 'chat', 'question', 'excited', 'chat']);
      const d = rand(1.1, 2.3);
      sp.say(kind, d);
      if (chance(0.35)) sp.setGesture(pick(['shrug', 'point', 'rest']), d * 0.7);
      yield* wait(d * 0.55);
      if (kind === 'question') { li.tilt = 0.25; } else li.nod = 1;
      yield* wait(d * 0.45 + rand(0.2, 0.5));
      li.tilt = 0;
      if (chance(0.3)) {
        a.say('laugh', 1.1); b.say('laugh', 1.1);
        a.setEmotion('happy', 3); b.setEmotion('happy', 3);
        (chance(0.5) ? a : b).emote(pick(['note', 'heart', 'sparkle']));
        yield* wait(1.3);
      }
      [sp, li] = [li, sp];
    }
    const grumpy = (a.traits.grumpy || 0) + (b.traits.grumpy || 0);
    const r = rand();
    if (r < 0.08 + grumpy * 0.15) {
      sp.say('grumble', 1.2); sp.setGesture('stomp', 1.2); sp.emote('puff'); sp.setEmotion('angry', 4);
      li.setEmotion('sad', 4); li.emote('drop', { delay: 0.4 });
      ctx.story(`${a.name} and ${b.name} are having a little disagreement`);
      yield* wait(1.6);
      sp.targetYaw = sp.yaw + Math.PI;
      sp.look(null, 0);
      yield* wait(2.4);
      if (chance(0.7)) {
        li.say('question', 1); li.look(sp, 4);
        yield* wait(1.2);
        sp.face(li.pos); sp.look(li, 4);
        sp.say('sigh', 0.8);
        yield* wait(0.9);
        a.setGesture('hug', 1.8); b.setGesture('hug', 1.8);
        a.emote('heart'); b.emote('heart', { delay: 0.2 });
        a.setEmotion('happy', 4); b.setEmotion('happy', 4);
        ctx.story(`...and made up with a big hug`);
        ctx.bond(a, b, 0.06);
        yield* wait(2);
      } else ctx.bond(a, b, -0.05);
    } else if (r < 0.5) {
      a.setGesture('hug', 1.7); b.setGesture('hug', 1.7);
      a.goTo(a.pos.clone().lerp(b.pos, 0.25), { stop: 0.05 });
      a.emote('heart'); b.emote('love', { delay: 0.3 });
      a.say('happy', 0.9); b.say('happy', 0.9);
      ctx.bond(a, b, 0.05);
      yield* wait(2);
    } else {
      a.setGesture('wave', 1.3); b.setGesture('wave', 1.3);
      a.say('bye', 0.8);
      yield* wait(0.5);
      b.say('bye', 0.8);
      ctx.bond(a, b, 0.03);
      yield* wait(1.1);
    }
  } finally { reset(a); reset(b); ctx.free(b); }
}

export function* chase(a, b, ctx) {
  try {
    a.label = `playing tag with ${b.name}`; b.label = `playing tag with ${a.name}`;
    ctx.story(pick([`${a.name} and ${b.name} are playing tag!`, `Tag! ${a.name} is chasing ${b.name}`]));
    let it = a, runner = b;
    a.say('excited', 0.8);
    for (let round = 0; round < randInt(2, 4); round++) {
      // runner flees to the point farthest from the chaser
      let best = null, bd = -1;
      for (let k = 0; k < 7; k++) {
        const p = ctx.nav.randomPoint(runner.pos.x, runner.pos.z, 4.5, 1.5);
        const d = p.distanceTo(it.pos);
        if (d > bd) { bd = d; best = p; }
      }
      runner.goTo(best, { run: true });
      runner.say('laugh', 0.8);
      let t = 0, rt = 0;
      while (t < 9) {
        const dt = yield; t += dt; rt -= dt;
        if (rt <= 0) { rt = 0.5; it.goTo(runner.pos, { run: true, stop: 0.3 }); }
        if (!runner.moving) runner.goTo(ctx.nav.randomPoint(runner.pos.x, runner.pos.z, 3.5, 1.2), { run: true });
        if (it.pos.distanceTo(runner.pos) < 0.55) break;
      }
      it.stop(); runner.stop();
      it.face(runner.pos); runner.face(it.pos);
      runner.hop(); it.hop();
      it.say('laugh', 1); runner.say('laugh', 1.1);
      it.emote(pick(['star', 'sparkle']));
      a.setEmotion('happy', 3); b.setEmotion('happy', 3);
      if (ctx.env.snow > 0.3) it.emote('flake', { delay: 0.2 });
      yield* wait(1.1);
      [it, runner] = [runner, it];
    }
    a.sitT = b.sitT = 1;
    a.label = b.label = 'catching their breath';
    a.look(b, 4); b.look(a, 4);
    a.say('laugh', 1.2); yield* wait(0.6); b.say('laugh', 1.2);
    yield* wait(2.2);
    ctx.bond(a, b, 0.05);
  } finally { reset(a); reset(b); ctx.free(b); }
}

export function* shareFood(giver, recv, ctx) {
  try {
    const cart = ctx.places.cart.front;
    giver.label = `fetching a snack for ${recv.name}`;
    recv.label = `waiting for ${giver.name}`;
    yield* walk(giver, cart);
    giver.sitT = 0.35; yield* wait(0.5); giver.sitT = 0;
    giver.hold(makeItem('apple'));
    giver.emote('sparkle');
    const squabble = giver.species === 'piglet' && recv.species === 'piglet' && chance(0.55);
    yield* walk(giver, recv.pos, { stop: 0.65 });
    recv.stop();
    giver.face(recv.pos); recv.face(giver.pos); giver.look(recv, 6); recv.look(giver, 6);
    if (squabble) {
      ctx.story(`${giver.name} and ${recv.name} are squabbling over the last apple`);
      recv.setGesture('hold'); giver.setGesture('hold');
      for (let k = 0; k < 4; k++) {
        const puller = k % 2 ? recv : giver, other = k % 2 ? giver : recv;
        puller.say('grumble', 0.7); puller.setGesture('stomp', 0.6);
        puller.pos.addScaledVector(V(Math.sin(puller.yaw), 0, Math.cos(puller.yaw)), -0.06);
        other.pos.addScaledVector(V(Math.sin(other.yaw), 0, Math.cos(other.yaw)), 0.06);
        if (k === 1) puller.emote('puff');
        yield* wait(0.8);
      }
      giver.setEmotion('sad', 2); recv.setEmotion('sad', 2);
      yield* wait(1);
      giver.say('question', 1); giver.setGesture('shrug', 1.2);
      yield* wait(1.2);
      // split it in two!
      giver.drop();
      giver.hold(makeItem('apple')); giver.held.scale.multiplyScalar(0.7);
      recv.hold(makeItem('apple')); recv.held.scale.multiplyScalar(0.7);
      ctx.story(`...so they split it in half`);
      giver.emote('heart'); recv.emote('heart', { delay: 0.3 });
    } else {
      giver.setGesture('offer', 1.6); giver.say('excited', 1);
      yield* wait(1.2);
      const item = giver.held; giver.held = null; recv.hold(item);
      recv.say('happy', 1); recv.setEmotion('happy', 5); recv.emote('heart');
      giver.emote('love', { delay: 0.4 }); giver.setEmotion('happy', 4);
      ctx.story(`${giver.name} shared an apple with ${recv.name}`);
    }
    const eaters = [recv, squabble ? giver : null].filter(Boolean);
    for (const e of eaters) { e.setGesture('eat', 4.5); e.label = 'munching an apple'; }
    for (let k = 0; k < 9; k++) {
      yield* wait(0.5);
      for (const e of eaters) if (e.held) { e.held.scale.multiplyScalar(0.88); if (k % 3 === 0) ctx.audio?.sfx('munch', e.pos); }
    }
    for (const e of eaters) { e.drop(); e.needs.hunger = 0; e.say('laugh', 0.8); }
    ctx.bond(giver, recv, 0.08);
    yield* wait(1);
  } finally { giver.drop(); recv.drop(); reset(giver); reset(recv); ctx.free(recv); }
}

export function* swingPlay(rider, pusher, ctx) {
  const SW = ctx.places.swing;
  if (!ctx.lock('swing', rider)) return;
  ctx.swingLock = rider;
  try {
    rider.label = 'playing on the swing';
    if (pusher) pusher.label = `pushing ${rider.name} on the swing`;
    const front = SW.groundFront;
    yield* all(walk(rider, front, { stop: 0.15 }), pusher ? walk(pusher, front.clone().add(V(0, 0, -1.6)), { stop: 0.2 }) : wait(0));
    rider.hop();
    yield* wait(0.3);
    rider.sitT = 1;
    rider.riding = true;
    ctx.story(pusher ? `${pusher.name} is pushing ${rider.name} on the swing` : `${rider.name} is swinging high`);
    let t = 0;
    const dur = rand(14, 24);
    while (t < dur) {
      const dt = yield; t += dt;
      const seat = SW.seatPoint();
      rider.pos.set(seat.x, 0, seat.z);
      rider.yOverride = seat.y - 0.03;
      rider.targetYaw = rider.yaw = 0;
      rider.look(V(seat.x, seat.y + 1, seat.z + 6), 0.5);
      let push = 0;
      if (pusher) {
        pusher.face(seat);
        if (SW.angle < -0.15 && SW.vel < 0 && SW.angle > -0.6) { push = 2.4; pusher.setGesture('offer', 0.3); }
      } else push = Math.sin(t * 2.2) * 1.2 * (Math.abs(SW.angle) < 0.7 ? 1 : 0);
      SW.update(dt, push);
      if (Math.abs(SW.vel) > 1.2 && chance(dt * 0.6)) { rider.say(chance(0.5) ? 'laugh' : 'excited', 0.8); rider.setEmotion('happy', 2); }
      if (chance(dt * 0.12)) rider.emote(pick(['sparkle', 'heart', 'note']));
    }
    while (Math.abs(SW.angle) > 0.08 || Math.abs(SW.vel) > 0.2) {
      const dt = yield;
      SW.update(dt, -SW.vel * 1.8);
      const seat = SW.seatPoint();
      rider.pos.set(seat.x, 0, seat.z); rider.yOverride = seat.y - 0.03;
    }
    rider.riding = false; rider.sitT = 0; rider.yOverride = null;
    rider.pos.copy(front);
    rider.hop();
    rider.say('laugh', 1);
    if (pusher) { ctx.bond(rider, pusher, 0.05); pusher.emote('heart'); }
    yield* wait(1);
  } finally { rider.riding = false; ctx.swingLock = null; ctx.unlock('swing', rider); reset(rider); if (pusher) { reset(pusher); ctx.free(pusher); } }
}

export function* dance(a, b, ctx) {
  try {
    a.label = b.label = 'dancing in the sunshine';
    ctx.story(`${a.name} and ${b.name} are having a little dance`);
    const [pa, pb] = meet(a, b, ctx, 0.9);
    yield* all(walk(a, pa, { stop: 0.2 }), walk(b, pb, { stop: 0.2 }));
    const c0 = a.pos.clone().add(b.pos).multiplyScalar(0.5);
    let t = 0, nt = 0;
    while (t < 12) {
      const dt = yield; t += dt; nt -= dt;
      const ang = t * 1.6;
      for (const [ch, off] of [[a, 0], [b, Math.PI]]) {
        ch.pos.set(c0.x + Math.cos(ang + off) * 0.45, 0, c0.z + Math.sin(ang + off) * 0.45);
        ch.targetYaw = ch.yaw = Math.atan2(c0.x - ch.pos.x, c0.z - ch.pos.z) + Math.PI / 2;
        ch.setGesture('cheer');
        if (Math.sin(t * 6 + off) > 0.95) ch.hop();
        ch.setEmotion('happy', 1);
      }
      if (nt <= 0) { nt = rand(0.8, 1.6); pick([a, b]).emote('note'); if (chance(0.5)) pick([a, b]).say('sing', 1.2); }
    }
    a.say('laugh', 1); b.say('laugh', 1);
    ctx.bond(a, b, 0.04);
    yield* wait(1);
  } finally { reset(a); reset(b); ctx.free(b); }
}

export function* stargaze(a, b, ctx) {
  const P = ctx.places.picnic;
  try {
    a.label = b.label = 'stargazing on the picnic blanket';
    yield* all(walk(a, P.spots[0], { stop: 0.15 }), walk(b, P.spots[1], { stop: 0.15 }));
    a.backT = b.backT = 1;
    a.yaw = a.targetYaw = Math.atan2(P.center.x - a.pos.x, P.center.z - a.pos.z) + Math.PI;
    b.yaw = b.targetYaw = Math.atan2(P.center.x - b.pos.x, P.center.z - b.pos.z) + Math.PI;
    ctx.stargazers = [a, b];
    let t = 0;
    const dur = rand(30, 60);
    while (t < dur && ctx.env.stars > 0.4 && ctx.env.cloud < 0.7) {
      const dt = yield; t += dt;
      if (chance(dt * 0.12)) { const w = pick([a, b]); w.setGesture('point', 1.5); w.say(pick(['question', 'excited', 'chat']), 1.2); }
      if (chance(dt * 0.05)) pick([a, b]).emote('star');
    }
    ctx.bond(a, b, 0.05);
  } finally { ctx.stargazers = []; reset(a); reset(b); ctx.free(b); }
}

export function* storyTime(teller, ctx) {
  const F = ctx.places.campfire;
  const S = ctx.reserveSeat(teller, F.seats);
  if (!S) return;
  try {
    teller.label = 'telling a story by the fire';
    yield* walk(teller, S.pos, { stop: 0.25 });
    sitAt(teller, S);
    teller.hold(makeItem('book'));
    teller.setGesture('hold');
    ctx.storyTime = true;
    ctx.story(`${teller.name} is telling a story by the fire`);
    for (let k = 0; k < randInt(5, 8); k++) {
      const d = rand(1.6, 3);
      teller.say('story', d);
      teller.setGesture(chance(0.3) ? 'shrug' : 'hold', d);
      yield* wait(d + 0.4);
      for (const l of ctx.neighbours(teller, 3)) {
        if (l.sitT < 0.5) continue;
        l.look(teller, 4);
        const r = rand();
        if (r < 0.2) { l.emote('bang'); l.eyeMode = 'wide'; setTimeout(() => { l.eyeMode = null; }, 900); }
        else if (r < 0.4) { l.say('laugh', 0.8); l.setEmotion('happy', 2); }
        else if (r < 0.5) l.emote('heart');
        else l.nod = 1;
      }
    }
    teller.say('laugh', 1);
    for (const l of ctx.neighbours(teller, 3)) if (l.sitT > 0.5) { l.setGesture('clap', 1.5); }
    yield* wait(1.6);
  } finally { ctx.storyTime = false; teller.drop(); ctx.releaseSeat(teller); standUp(teller); reset(teller); }
}

// ---------------------------------------------------------------------------
// species routines
// ---------------------------------------------------------------------------
export function* owlPerch(c, ctx) {
  const perch = ctx.places.owlPerch;
  try {
    c.label = 'flying up to his branch';
    if (c.root.position.distanceTo(perch) > 0.3) yield* fly(c, perch, { height: 1.2, speed: 2.2 });
    c.perched = true;
    c.yOverride = perch.y;
    c.targetYaw = 0.4;
    c.label = 'sleeping on his favourite branch';
    c.eyeMode = 'closed'; c.lieT = 0.4;
    let zt = 0;
    while (ctx.env.night < 0.45) { const dt = yield; zt += dt; if (zt > 4.5) { zt = 0; c.emote('z'); } }
    c.eyeMode = null; c.lieT = 0;
    c.setGesture('cheer', 1.2);
    c.say('hoot', 1.4);
    ctx.story(`${c.name} woke up for the night`);
    yield* wait(1.6);
    const down = ctx.nav.randomPoint(-1, 1, 3);
    down.y = walkHeight(down.x, down.z);
    yield* fly(c, down, { height: 1.4, speed: 2.4 });
    c.perched = false; c.yOverride = null;
  } finally { c.eyeMode = null; c.lieT = 0; if (!c.perched) c.yOverride = null; }
}

export function* birdFlit(c, ctx) {
  const P = ctx.places;
  try {
    const choice = rand();
    if (choice < 0.65) {
      const perch = pick(P.birdPerches);
      c.label = pick(['flitting about', 'perched up high', 'singing from a high spot']);
      yield* fly(c, perch, { height: 0.9, speed: 3.2 });
      c.perched = true; c.yOverride = perch.y;
      c.targetYaw = rand(-Math.PI, Math.PI);
      const dur = rand(4, 11);
      let t = 0;
      while (t < dur) {
        const dt = yield; t += dt;
        if (chance(dt * 0.35)) { c.say('sing', rand(1, 2)); c.emote('note'); c.label = 'singing a little song'; }
        if (chance(dt * 0.6)) c.tilt = rand(-0.5, 0.5);
      }
    } else {
      const spot = chance(0.5) ? P.garden.front.clone() : ctx.nav.randomPoint(0, 2, 6);
      spot.y = walkHeight(spot.x, spot.z);
      c.label = 'pecking around for seeds';
      yield* fly(c, spot, { height: 0.8, speed: 3 });
      c.perched = false; c.yOverride = null;
      for (let i = 0; i < randInt(3, 6); i++) {
        c.goTo(ctx.nav.randomPoint(c.pos.x, c.pos.z, 0.8, 0.2));
        while (c.moving) yield;
        c.nod = 1.5; ctx.audio?.sfx('peck', c.pos);
        yield* wait(rand(0.4, 1));
      }
    }
  } finally { c.tilt = 0; }
}

export function* frogLife(c, ctx) {
  const P = ctx.places;
  try {
    if (ctx.env.rain > 0.3 && chance(0.5) && ctx.env.puddles > 0.3) {
      yield* splash(c, ctx);
      return;
    }
    const pad = pick(P.lilyPads);
    const target = pad.getWorldPosition(V()).add(V(0, 0.02, 0));
    c.label = 'hopping between lily pads';
    yield* fly(c, target, { height: 0.5, speed: 2.2 });
    ctx.water.ripple(target.x, target.z, 0.8);
    ctx.audio?.sfx('plop', target, { small: true });
    c.perched = true; c.yOverride = target.y;
    c.targetYaw = rand(-Math.PI, Math.PI);
    const dur = rand(8, 20);
    let t = 0;
    c.label = 'lounging on a lily pad';
    while (t < dur) {
      const dt = yield; t += dt;
      const p = pad.getWorldPosition(V());
      c.pos.set(p.x, 0, p.z); c.yOverride = p.y + 0.02;
      const croaky = ctx.env.night > 0.5 || ctx.env.rain > 0.2;
      if (chance(dt * (croaky ? 0.3 : 0.08))) { c.say('croak', 0.8); c.label = 'croaking happily'; }
      if (chance(dt * 0.04)) { c.emote('sparkle'); c.setEmotion('happy', 1.5); ctx.audio?.sfx('tongue', c.pos); }
    }
  } finally { c.perched = false; }
}

export function* hedgehogForage(c, ctx) {
  try {
    c.label = 'snuffling around for snacks';
    for (let i = 0; i < randInt(3, 6); i++) {
      yield* walk(c, ctx.nav.randomPoint(c.pos.x, c.pos.z, 2.5, 0.5));
      c.nod = 1.5; c.tilt = rand(-0.2, 0.2);
      ctx.audio?.sfx('rustle', c.pos);
      yield* wait(rand(0.8, 2));
      if (chance(0.25)) { c.emote('sparkle'); c.say('happy', 0.6); c.label = 'found a tasty beetle'; }
    }
  } finally { c.tilt = 0; reset(c); }
}

export function* hedgehogHide(c, ctx, inside = true) {
  const L = ctx.places.hollowLog;
  try {
    c.label = inside ? 'heading back to the hollow log' : 'peeking out of the hollow log';
    if (inside) {
      yield* walk(c, L.mouth);
      c.inside = true; c.label = 'asleep in the hollow log';
      while (ctx.env.night < 0.5) yield* wait(1);
      c.inside = false;
      c.pos.copy(L.mouth);
      c.emote('question'); c.say('happy', 0.6);
      ctx.story(`${c.name} the hedgehog has come out for the evening`);
      yield* wait(1.2);
    }
  } finally { c.inside = false; }
}
