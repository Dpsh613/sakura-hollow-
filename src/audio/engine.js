// Entirely procedural soundscape: no audio files, everything synthesised live.
const rnd = (a = 0, b = 1) => a + (b - a) * Math.random();
const pickA = (arr) => arr[Math.floor(Math.random() * arr.length)];

// distinct vocal identities per character
const VOICES = {
  Mochi: { base: 540, type: 'triangle', formant: 1700, q: 2.2, speed: 8.5, vol: 0.5 },
  Peaches: { base: 640, type: 'triangle', formant: 2100, q: 2.0, speed: 10, vol: 0.5 },
  Hazel: { base: 400, type: 'sawtooth', formant: 1300, q: 3.0, speed: 10.5, vol: 0.32, lp: 2600 },
  'Professor Hoot': { base: 220, type: 'sine', formant: 700, q: 1.5, speed: 5.2, vol: 0.7 },
  Biscuit: { base: 300, type: 'square', formant: 950, q: 4, speed: 8, vol: 0.22, lp: 1800, snort: true },
  Bean: { base: 380, type: 'square', formant: 1150, q: 4, speed: 9, vol: 0.2, lp: 2000, snort: true },
  Pip: { base: 960, type: 'triangle', formant: 2600, q: 2.5, speed: 13, vol: 0.4 },
  Wren: { base: 2000, type: 'sine', formant: 3000, q: 1, speed: 12, vol: 0.35, bird: true },
  Lily: { base: 150, type: 'sawtooth', formant: 450, q: 5, speed: 6, vol: 0.4, lp: 900 },
  Bramble: { base: 430, type: 'triangle', formant: 1400, q: 2, speed: 7, vol: 0.35, snuffle: true },
};

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp).connect(ctx.destination);
  const bus = (v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; };
  const amb = bus(0.9), voice = bus(1.0), sfxBus = bus(0.8), music = bus(0.0);
  let volume = 0.8, muted = false, musicOn = true;
  master.gain.value = volume;

  // ---- noise buffers ------------------------------------------------------------------------
  const SR = ctx.sampleRate;
  const mkBuf = (sec, fn) => { const b = ctx.createBuffer(1, Math.floor(SR * sec), SR); const d = b.getChannelData(0); fn(d); return b; };
  const white = mkBuf(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const pink = mkBuf(4, (d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } });
  const brown = mkBuf(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });

  const loop = (buf, ...chain) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    s.loopStart = Math.random() * 0.5;
    let n = s;
    for (const c of chain) { n.connect(c); n = c; }
    s.start(0, Math.random() * buf.duration);
    return s;
  };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const panner = (x, y, z, ref = 2.5, roll = 1.3) => {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  };
  const setPos = (p, v) => { if (p.positionX) { p.positionX.setTargetAtTime(v.x, ctx.currentTime, 0.05); p.positionY.setTargetAtTime(v.y, ctx.currentTime, 0.05); p.positionZ.setTargetAtTime(v.z, ctx.currentTime, 0.05); } else p.setPosition(v.x, v.y, v.z); };
  const ramp = (param, v, tc = 0.4) => param.setTargetAtTime(v, ctx.currentTime, tc);

  // ---- continuous beds ---------------------------------------------------------------------------
  const windLP = filt('lowpass', 400, 0.6), windG = gain(0);
  loop(brown, windLP, windG, amb);
  const whistleBP = filt('bandpass', 900, 6), whistleG = gain(0);
  loop(pink, whistleBP, whistleG, amb);
  const leavesBP = filt('bandpass', 3800, 0.6), leavesG = gain(0);
  loop(pink, leavesBP, leavesG, amb);
  const rainHP = filt('highpass', 450), rainLP = filt('lowpass', 7000), rainG = gain(0);
  loop(white, rainHP, rainLP, rainG, amb);
  const rainLowLP = filt('lowpass', 900), rainLowG = gain(0);
  loop(pink, rainLowLP, rainLowG, amb);
  let fallP, fallG, streamP, streamG, fireP, fireG, pondP, pondG;
  function placeWater(fallPos, streamPos, pondPos, firePos) {
    fallP = panner(fallPos.x, fallPos.y, fallPos.z, 4, 1.1); fallG = gain(0.0);
    loop(pink, filt('bandpass', 1100, 0.45), fallG, fallP, amb);
    loop(brown, filt('lowpass', 350), gain(0.6), fallG);
    streamP = panner(streamPos.x, streamPos.y, streamPos.z, 2.5, 1.5); streamG = gain(0);
    loop(pink, filt('bandpass', 2200, 0.8), streamG, streamP, amb);
    pondP = panner(pondPos.x, pondPos.y, pondPos.z, 2, 1.6); pondG = gain(0);
    loop(brown, filt('bandpass', 500, 1.2), pondG, pondP, amb);
    fireP = panner(firePos.x, firePos.y + 0.3, firePos.z, 2, 1.5); fireG = gain(0);
    loop(brown, filt('lowpass', 260), fireG, fireP, amb);
  }

  // ---- one-shot building blocks --------------------------------------------------------------------
  function burst({ buf = white, t = ctx.currentTime, dur = 0.05, type = 'bandpass', f = 2000, q = 1, vol = 0.2, dest = sfxBus, pan = null, attack = 0.002, f2 = null, rate = 1 }) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const fl = filt(type, f, q);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g);
    if (pan) g.connect(pan).connect(dest); else g.connect(dest);
    s.start(t, Math.random() * (buf.duration - dur - 0.1));
    s.stop(t + dur + 0.05);
  }
  function tone({ t = ctx.currentTime, f = 440, f2 = null, dur = 0.2, type = 'sine', vol = 0.2, dest = sfxBus, pan = null, attack = 0.01, filterF = null, q = 1 }) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (filterF) { const fl = filt('bandpass', filterF, q); n.connect(fl); n = fl; }
    n.connect(g);
    if (pan) g.connect(pan).connect(dest); else g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function bell(t, f, vol, pan, dest = sfxBus, decay = 2.2) {
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = gain(f * 2.2), g = gain(0);
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mod.connect(mg).connect(car.frequency);
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    car.connect(g);
    if (pan) g.connect(pan).connect(dest); else g.connect(dest);
    car.start(t); mod.start(t); car.stop(t + decay + 0.1); mod.stop(t + decay + 0.1);
  }

  // ---- character voices -----------------------------------------------------------------------------------
  const listenerPos = { x: 0, y: 5, z: 20 };
  const dist = (p) => Math.hypot(p.x - listenerPos.x, p.y - listenerPos.y, p.z - listenerPos.z);
  function syllable(v, t, f0, f1, len, vol, pan, breath = 0) {
    const o = ctx.createOscillator(); o.type = v.type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + len);
    const vib = ctx.createOscillator(), vg = gain(f0 * 0.02);
    vib.frequency.value = rnd(5, 8); vib.connect(vg).connect(o.frequency);
    const fm = filt('bandpass', v.formant * rnd(0.8, 1.3), v.q);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.025, len * 0.3));
    g.gain.setValueAtTime(vol * 0.85, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.04);
    let n = o.connect(fm);
    if (v.lp) { const lp = filt('lowpass', v.lp); n = n.connect(lp); }
    n.connect(g).connect(pan);
    o.start(t); vib.start(t); o.stop(t + len + 0.08); vib.stop(t + len + 0.08);
    if (breath > 0) burst({ t, dur: len, f: v.formant * 1.5, q: 0.8, vol: vol * breath, dest: voice, pan });
  }
  function speak(c, kind, dur) {
    const head = c.headWorld();
    const d = dist(head);
    if (d > 26 || muted) return;
    const v = VOICES[c.name] || VOICES.Mochi;
    const pan = panner(head.x, head.y, head.z, 2.2, 1.35);
    pan.connect(voice);
    const t0 = ctx.currentTime + 0.02;
    const base = v.base;
    const vol = v.vol * 0.55;
    if (c.name === 'Professor Hoot' && kind === 'hoot') {
      for (let i = 0; i < 2; i++) { tone({ t: t0 + i * 0.45, f: 390, f2: 330, dur: 0.38, vol: 0.32, dest: voice, pan, attack: 0.06 }); }
      tone({ t: t0 + 1.0, f: 360, f2: 300, dur: 0.6, vol: 0.28, dest: voice, pan, attack: 0.08 });
      return;
    }
    if (c.name === 'Lily' && (kind === 'croak' || Math.random() < 0.5)) {
      for (let i = 0; i < 2; i++) {
        const t = t0 + i * 0.22;
        tone({ t, f: 130 + rnd(-10, 10), f2: 95, dur: 0.16, type: 'sawtooth', vol: 0.28, dest: voice, pan, filterF: 420, q: 4 });
        tone({ t, f: 260, f2: 190, dur: 0.12, type: 'square', vol: 0.05, dest: voice, pan, filterF: 900, q: 3 });
      }
      return;
    }
    if (v.bird) {
      const n = kind === 'sing' ? Math.floor(dur * 8) : 3;
      for (let i = 0; i < n; i++) {
        const t = t0 + i * rnd(0.08, 0.16);
        const f = base * rnd(0.85, 1.5);
        tone({ t, f, f2: f * rnd(0.7, 1.5), dur: rnd(0.05, 0.12), vol: 0.12, dest: voice, pan, attack: 0.005 });
      }
      return;
    }
    if (kind === 'snore') {
      burst({ buf: pink, t: t0, dur: 0.9, type: 'lowpass', f: 500, vol: 0.12, dest: voice, pan, attack: 0.4 });
      tone({ t: t0, f: base * 0.35, f2: base * 0.3, dur: 0.8, type: 'sawtooth', vol: 0.03, dest: voice, pan, attack: 0.3, filterF: 300, q: 2 });
      return;
    }
    if (kind === 'sigh' || kind === 'yawn') {
      const len = kind === 'yawn' ? 0.9 : 0.6;
      syllable(v, t0, base * 1.15, base * 0.7, len, vol * 0.8, pan, 0.6);
      return;
    }
    if (kind === 'hum' || kind === 'sing') {
      const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
      let t = t0;
      const n = Math.max(3, Math.floor(dur * 3.5));
      for (let i = 0; i < n; i++) {
        const f = base * pickA(scale) * 0.9, len = rnd(0.18, 0.32);
        tone({ t, f, f2: f * 1.01, dur: len, type: 'sine', vol: vol * 0.55, dest: voice, pan, attack: 0.05 });
        t += len * 0.95;
      }
      return;
    }
    if (kind === 'laugh') {
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (1 / (v.speed * 0.9));
        const f = base * (1.35 - i * 0.07) * rnd(0.97, 1.04);
        syllable(v, t, f * 1.05, f * 0.92, 0.07, vol, pan, 0.35);
      }
      if (v.snort) burst({ buf: pink, t: t0 + n * 0.1, dur: 0.12, type: 'bandpass', f: 600, q: 2, vol: 0.18, dest: voice, pan });
      return;
    }
    if (kind === 'grumble') {
      for (let i = 0; i < 3; i++) syllable(v, t0 + i * 0.16, base * 0.7, base * 0.6, 0.12, vol * 0.9, pan, 0.2);
      if (v.snort) burst({ buf: pink, t: t0, dur: 0.18, type: 'bandpass', f: 500, q: 3, vol: 0.2, dest: voice, pan });
      return;
    }
    if (kind === 'shy') { syllable(v, t0, base * 1.5, base * 1.7, 0.09, vol * 0.5, pan); return; }
    // general babble: chat, question, excited, greet, bye, happy, story
    const excited = kind === 'excited' || kind === 'happy';
    const speed = v.speed * (excited ? 1.25 : kind === 'story' ? 0.85 : 1);
    let n = Math.max(2, Math.round(dur * speed * 0.8));
    if (kind === 'greet' || kind === 'bye') n = 2;
    let t = t0;
    const pitchK = excited ? 1.2 : 1;
    for (let i = 0; i < n; i++) {
      const len = rnd(0.055, 0.12) * (kind === 'story' ? 1.3 : 1);
      let f = base * pitchK * rnd(0.88, 1.18);
      let f2 = f * rnd(0.9, 1.1);
      if (kind === 'question' && i === n - 1) f2 = f * 1.45;
      if (kind === 'greet') { f = base * (i ? 1.0 : 1.25); f2 = f * (i ? 0.85 : 1.1); }
      if (kind === 'bye') { f = base * (i ? 0.9 : 1.15); f2 = f * 0.85; }
      if (kind === 'happy' && i === n - 1) f2 = f * 1.3;
      syllable(v, t, f, f2, len, vol, pan, 0.08);
      if (v.snort && Math.random() < 0.15) burst({ buf: pink, t: t + len, dur: 0.08, type: 'bandpass', f: 700, q: 3, vol: 0.12, dest: voice, pan });
      if (v.snuffle && Math.random() < 0.3) burst({ t: t + len, dur: 0.06, f: 3000, q: 1, vol: 0.05, dest: voice, pan });
      t += len + rnd(0.02, 0.07) + (Math.random() < 0.15 ? 0.12 : 0);
    }
  }

  function step(c) {
    const p = c.pos;
    const d = dist({ x: p.x, y: c.root.position.y, z: p.z });
    if (d > 14 || muted) return;
    const pan = panner(p.x, c.root.position.y, p.z, 1.5, 1.6);
    pan.connect(sfxBus);
    const small = c.scale < 0.9 || c.species === 'mouse' || c.species === 'bird';
    const vol = (small ? 0.05 : 0.09) * Math.min(1, c.speed + 0.3);
    if (c.yOverride != null && c.yOverride > 0.2 && !c.flight) {
      tone({ f: 190 + rnd(-20, 20), f2: 140, dur: 0.07, type: 'sine', vol: vol * 1.4, pan });
      burst({ dur: 0.04, f: 900, q: 1.5, vol: vol * 0.6, pan });
    } else if (env && env.snowCover > 0.4) burst({ dur: 0.09, type: 'highpass', f: 2500, vol: vol * 1.2, pan, attack: 0.01 });
    else if (env && env.wetness > 0.4) burst({ dur: 0.07, f: 1800, q: 1.2, vol: vol * 1.3, pan, f2: 900 });
    else burst({ buf: pink, dur: 0.05, type: 'lowpass', f: 900, vol: vol * 1.5, pan });
  }

  function sfx(name, pos, opts = {}) {
    if (muted) return;
    const d = pos ? dist(pos) : 0;
    if (d > 24) return;
    const pan = pos ? panner(pos.x, (pos.y ?? 0) + 0.2, pos.z, 2, 1.4) : null;
    if (pan) pan.connect(sfxBus);
    const t = ctx.currentTime;
    switch (name) {
      case 'pop': tone({ f: 700, f2: 1300, dur: 0.08, vol: 0.12, pan }); break;
      case 'pluck': tone({ f: 260, f2: 520, dur: 0.12, vol: 0.2, pan }); burst({ buf: pink, dur: 0.15, type: 'lowpass', f: 700, vol: 0.2, pan }); break;
      case 'pour': burst({ buf: pink, dur: 2.6, f: 2200, q: 0.8, vol: 0.12, pan, attack: 0.2 }); break;
      case 'splash': burst({ dur: opts.small ? 0.22 : 0.45, f: 1600, q: 0.6, vol: opts.small ? 0.15 : 0.28, pan, f2: 500 }); for (let i = 0; i < 4; i++) tone({ t: t + rnd(0.05, 0.3), f: rnd(500, 1100), f2: rnd(1200, 2400), dur: 0.05, vol: 0.05, pan }); break;
      case 'plop': tone({ f: 380, f2: 900, dur: 0.09, vol: 0.18, pan }); burst({ dur: 0.12, f: 1200, q: 1, vol: 0.06, pan }); break;
      case 'whoosh': burst({ buf: pink, dur: 1.1, type: 'bandpass', f: 400, f2: 2500, q: 0.8, vol: 0.35, pan, attack: 0.25 }); break;
      case 'door': tone({ f: 160, f2: 120, dur: 0.12, vol: 0.18, pan }); tone({ t: t + 0.08, f: 520, f2: 460, dur: 0.25, type: 'triangle', vol: 0.03, pan }); break;
      case 'munch': for (let i = 0; i < 2; i++) burst({ t: t + i * 0.12, dur: 0.06, f: 2500, q: 1, vol: 0.1, pan }); break;
      case 'pick': burst({ dur: 0.05, f: 3200, q: 2, vol: 0.08, pan }); tone({ f: 1200, f2: 1600, dur: 0.06, vol: 0.05, pan }); break;
      case 'peck': burst({ dur: 0.025, f: 3800, q: 3, vol: 0.08, pan }); break;
      case 'rustle': burst({ buf: pink, dur: 0.35, f: 3000, q: 0.7, vol: 0.12, pan, attack: 0.05 }); break;
      case 'tongue': tone({ f: 900, f2: 300, dur: 0.06, vol: 0.08, pan }); break;
      case 'chime': bell(t, opts.f || 880, 0.06, pan); break;
      case 'sparkle': for (let i = 0; i < 5; i++) bell(t + i * 0.07, 1200 * Math.pow(1.122, i * 2), 0.03, pan, sfxBus, 0.9); break;
      default: break;
    }
  }

  function thunder(k = 1) {
    if (muted) return;
    const t = ctx.currentTime;
    burst({ t, dur: 0.25, type: 'highpass', f: 1500, vol: 0.12 * k, dest: amb, attack: 0.005 });
    const s = ctx.createBufferSource(); s.buffer = brown;
    const lp = filt('lowpass', 900); lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * k, t + 0.15);
    g.gain.setValueAtTime(0.7 * k, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    s.connect(lp).connect(g).connect(amb);
    s.start(t); s.stop(t + 4.6);
  }

  // ---- schedulers -------------------------------------------------------------------------------------------
  let env = null;
  let birdT = 1, cricketT = 1, frogT = 3, crackleT = 0.2, chimeT = 6, dropT = 0, musicT = 8, roofT = 0;
  let birdSpots = [{ x: 3, y: 7, z: -4 }, { x: -5.6, y: 5, z: -3 }, { x: 6, y: 3, z: 2 }, { x: -8, y: 2, z: 6 }, { x: 15, y: 3, z: 5 }];
  let pagodaPos = { x: 3.6, y: 6, z: -2.4 }, pondPos = { x: -4.4, y: 0, z: 4 }, firePos = { x: 0, y: 0, z: 0 };
  let fireLit = 0;
  const birdSongs = [
    (t, pan) => { const f = rnd(2600, 3400); tone({ t, f, f2: f * 0.7, dur: 0.18, vol: 0.06, dest: amb, pan }); tone({ t: t + 0.25, f: f * 0.8, f2: f * 1.1, dur: 0.22, vol: 0.06, dest: amb, pan }); },
    (t, pan) => { const f = rnd(3500, 4500); for (let i = 0; i < 8; i++) tone({ t: t + i * 0.055, f, f2: f * 0.85, dur: 0.04, vol: 0.04, dest: amb, pan }); },
    (t, pan) => { const f = rnd(1400, 1800); tone({ t, f, f2: f, dur: 0.3, vol: 0.06, dest: amb, pan, attack: 0.04 }); tone({ t: t + 0.4, f: f * 0.8, f2: f * 0.8, dur: 0.4, vol: 0.06, dest: amb, pan, attack: 0.04 }); },
    (t, pan) => { for (let i = 0; i < 5; i++) { const f = rnd(2000, 4200); tone({ t: t + i * rnd(0.08, 0.14), f, f2: f * rnd(0.6, 1.6), dur: rnd(0.05, 0.1), vol: 0.045, dest: amb, pan }); } },
  ];
  const musicScaleDay = [0, 2, 4, 7, 9, 12, 14, 16];
  const musicScaleNight = [0, 3, 5, 7, 10, 12, 15];

  function update(dt, e, cam, world) {
    env = e;
    if (ctx.state !== 'running') return;
    // listener
    const L = ctx.listener;
    const p = cam.position;
    listenerPos.x = p.x; listenerPos.y = p.y; listenerPos.z = p.z;
    const fwd = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 };
    const q = cam.quaternion;
    const fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    fwd.x = -fx; fwd.y = -fy; fwd.z = -fz;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
    const camDist = Math.hypot(p.x, p.y - 2, p.z);
    const closeness = Math.max(0.35, Math.min(1, 26 / camDist));
    // beds
    const w = e.wind;
    ramp(windG.gain, (0.025 + w * 0.09) * (0.6 + e.gust * 0.6));
    ramp(windLP.frequency, 260 + w * 520 + e.gust * 300, 0.6);
    ramp(whistleG.gain, Math.max(0, w - 1.2) * 0.03 * e.gust);
    ramp(whistleBP.frequency, 700 + e.gust * 600, 0.8);
    ramp(leavesG.gain, (e.season === 3 ? 0.2 : 1) * (0.006 + Math.max(0, w - 0.3) * 0.03 * e.gust) * closeness);
    ramp(rainG.gain, e.rain * 0.16);
    ramp(rainLowG.gain, e.rain * 0.12 + e.storm * 0.05);
    if (fallG) {
      ramp(fallG.gain, 0.32 * (1 - e.ice));
      ramp(streamG.gain, 0.09 * (1 - e.ice));
      ramp(pondG.gain, 0.05 * (1 - e.ice) * (0.4 + w * 0.6));
      ramp(fireG.gain, fireLit * 0.22);
    }
    // rain drops + roof patter
    dropT -= dt;
    if (e.rain > 0.05) {
      while (dropT < 0) {
        dropT += 0.02 / Math.max(0.05, e.rain);
        if (Math.random() < 0.6) burst({ dur: 0.02, f: rnd(2000, 6000), q: 3, vol: rnd(0.01, 0.04) * e.rain, dest: amb });
      }
      roofT -= dt;
      if (roofT < 0) {
        roofT = 0.04 / e.rain;
        const pan = panner(pagodaPos.x + rnd(-1.5, 1.5), pagodaPos.y, pagodaPos.z + rnd(-1.5, 1.5), 2.5, 1.4);
        pan.connect(amb);
        burst({ dur: 0.03, f: rnd(900, 1600), q: 2, vol: 0.05 * e.rain, dest: amb, pan });
      }
    } else dropT = 0;
    // birdsong (dawn chorus, quieter by day, none at night or in rain)
    const dawn = e.hour > 5.6 && e.hour < 8.5 ? 3 : 1;
    const birdRate = (1 - e.night) * (1 - e.rain) * (1 - e.snow * 0.7) * dawn * (e.season === 3 ? 0.3 : 1);
    birdT -= dt * birdRate;
    if (birdT < 0) {
      birdT = rnd(1.5, 5);
      const s = pickA(birdSpots);
      const pan = panner(s.x + rnd(-2, 2), s.y, s.z + rnd(-2, 2), 4, 1.1);
      pan.connect(amb);
      pickA(birdSongs)(ctx.currentTime, pan);
    }
    // crickets at night
    const crick = e.night * (e.season === 3 ? 0 : e.season === 1 ? 1.4 : 0.8) * (1 - e.rain * 0.8);
    cricketT -= dt * crick;
    if (cricketT < 0) {
      cricketT = rnd(0.15, 0.6);
      const a = rnd(0, Math.PI * 2), r = rnd(2, 9);
      const pan = panner(Math.cos(a) * r, 0.2, Math.sin(a) * r, 2, 1.4);
      pan.connect(amb);
      const f = rnd(4200, 5200), t = ctx.currentTime;
      for (let i = 0; i < 3; i++) tone({ t: t + i * 0.055, f, dur: 0.03, vol: 0.025, dest: amb, pan, attack: 0.004 });
    }
    // frogs near the pond at night / in rain
    const frogRate = Math.max(e.night * 0.8, e.rain) * (1 - e.ice);
    frogT -= dt * frogRate;
    if (frogT < 0) {
      frogT = rnd(2, 6);
      const pan = panner(pondPos.x + rnd(-2, 2), 0, pondPos.z + rnd(-2, 2), 2.5, 1.3);
      pan.connect(amb);
      const t = ctx.currentTime, f = rnd(110, 170);
      for (let i = 0; i < 2; i++) tone({ t: t + i * 0.2, f, f2: f * 0.75, dur: 0.14, type: 'sawtooth', vol: 0.06, dest: amb, pan, filterF: 420, q: 4 });
    }
    // campfire crackle
    if (fireLit > 0.3) {
      crackleT -= dt;
      if (crackleT < 0) {
        crackleT = rnd(0.04, 0.3);
        const pan = panner(firePos.x, firePos.y + 0.3, firePos.z, 1.5, 1.6);
        pan.connect(amb);
        burst({ dur: rnd(0.008, 0.03), type: 'highpass', f: rnd(1500, 4000), vol: rnd(0.04, 0.16) * fireLit, dest: amb, pan });
      }
    }
    // wind chimes on the treehouse when gusts blow
    chimeT -= dt * (0.15 + Math.max(0, w - 0.6) * e.gust * 1.5);
    if (chimeT < 0) {
      chimeT = rnd(2, 6);
      const pan = panner(pagodaPos.x + rnd(-1.5, 1.5), pagodaPos.y, pagodaPos.z + rnd(-1.5, 1.5), 3, 1.2);
      pan.connect(sfxBus);
      const notes = [1046, 1174, 1318, 1568, 1760];
      const t = ctx.currentTime;
      for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) bell(t + i * rnd(0.1, 0.35), pickA(notes), 0.03, pan, sfxBus, 2.5);
    }
    // music box
    ramp(music.gain, musicOn ? 0.5 : 0, 1.5);
    musicT -= dt;
    if (musicT < 0 && musicOn) {
      musicT = rnd(22, 48);
      const nightish = e.night > 0.5 || e.rain > 0.4;
      const scale = nightish ? musicScaleNight : musicScaleDay;
      const root = nightish ? 330 : 523;
      const tempo = nightish ? 0.62 : 0.42;
      let t = ctx.currentTime + 0.1;
      let idx = Math.floor(Math.random() * 4);
      const len = 7 + Math.floor(Math.random() * 6);
      for (let i = 0; i < len; i++) {
        idx = Math.max(0, Math.min(scale.length - 1, idx + pickA([-2, -1, -1, 1, 1, 2, 0])));
        const f = root * Math.pow(2, scale[idx] / 12);
        bell(t, f, 0.05, null, music, 1.8);
        if (i % 4 === 0) bell(t, f / 2, 0.025, null, music, 2.4);
        t += tempo * pickA([1, 1, 0.5, 1.5]);
      }
    }
  }

  return {
    ctx,
    resume() { return ctx.resume(); },
    get running() { return ctx.state === 'running'; },
    setVolume(v) { volume = v; ramp(master.gain, muted ? 0 : v, 0.1); },
    setMuted(m) { muted = m; ramp(master.gain, m ? 0 : volume, 0.1); },
    get muted() { return muted; },
    setMusic(on) { musicOn = on; },
    get music() { return musicOn; },
    placeWater,
    setPlaces({ pagoda, pond, fire, birds }) { if (pagoda) pagodaPos = pagoda; if (pond) pondPos = pond; if (fire) firePos = fire; if (birds) birdSpots = birds; },
    setFire(v) { fireLit = v; },
    speak, step, sfx, thunder, update,
  };
}
