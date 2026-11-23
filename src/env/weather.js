import * as THREE from 'three';
import { rand, clamp, lerp, smoothstep, damp, noise1 } from '../core/noise.js';
import { uniforms } from '../core/materials.js';

const C = (h) => new THREE.Color(h);

// ---------------------------------------------------------------------------
// Lighting keyframes through a day. Colours are authored in sRGB and blended
// in linear space. Deeper skies and warmer keys than before: no washed-out look.
// ---------------------------------------------------------------------------
const NIGHT = { sun: '#a8b4f0', si: 0.75, sky: '#56608a', gnd: '#262b46', hi: 0.78, top: '#0d1838', hor: '#34407a', bot: '#1e2550', fog: '#26305a', exp: 1.15, sat: 1.02, con: 1.04, tint: '#d0dcff', lift: '#06080f', rim: '#5a6496' };
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.8, ...NIGHT, hor: '#3a4278' },
  { h: 5.9, sun: '#ff9a70', si: 1.0, sky: '#9a8ab8', gnd: '#5a4a55', hi: 0.62, top: '#4a5aa0', hor: '#f0a888', bot: '#9a8ab8', fog: '#c8a4a8', exp: 1.06, sat: 1.08, con: 1.04, tint: '#ffe4d8', lift: '#060406', rim: '#ff9a88' },
  { h: 7.2, sun: '#ffc890', si: 2.4, sky: '#a8c4e8', gnd: '#6f5f44', hi: 0.62, top: '#5d97dc', hor: '#f2dcc4', bot: '#b8cfe6', fog: '#dcd8d4', exp: 1.0, sat: 1.12, con: 1.06, tint: '#fff4e8', lift: '#000000', rim: '#ffcfaa' },
  { h: 12, sun: '#fff2de', si: 3.1, sky: '#a6ccf0', gnd: '#7e6e4a', hi: 0.62, top: '#2f7bd6', hor: '#cfe4f4', bot: '#c4d9ec', fog: '#cddcea', exp: 1.0, sat: 1.12, con: 1.07, tint: '#ffffff', lift: '#000000', rim: '#d6e4ff' },
  { h: 16, sun: '#ffe2b4', si: 2.9, sky: '#aac6e6', gnd: '#7f6a48', hi: 0.6, top: '#3d82d4', hor: '#e8dcc8', bot: '#c8d2e0', fog: '#dcd6cc', exp: 1.0, sat: 1.12, con: 1.07, tint: '#fff6ea', lift: '#000000', rim: '#ffddb8' },
  { h: 18.2, sun: '#ffb070', si: 2.4, sky: '#c0a8c0', gnd: '#6a5040', hi: 0.72, top: '#5a74c0', hor: '#f8b07a', bot: '#a898c0', fog: '#d8a894', exp: 1.04, sat: 1.1, con: 1.06, tint: '#ffe6d4', lift: '#000000', rim: '#ffa882' },
  { h: 19.3, sun: '#ff8060', si: 1.1, sky: '#8a70a0', gnd: '#443448', hi: 0.66, top: '#34428a', hor: '#e8806e', bot: '#6a5a90', fog: '#9a7a98', exp: 1.08, sat: 1.08, con: 1.05, tint: '#ffd8d8', lift: '#040206', rim: '#ff8c9a' },
  { h: 20.6, ...NIGHT, hor: '#46447e', bot: '#2a2a58', fog: '#2e3260', top: '#121a40' },
  { h: 24, ...NIGHT },
];
const KEYC = KEYS.map((k) => {
  const o = { ...k };
  for (const f of ['sun', 'sky', 'gnd', 'top', 'hor', 'bot', 'fog', 'tint', 'lift', 'rim']) o[f] = C(k[f] ?? '#000000');
  return o;
});

export const WEATHERS = {
  clear: { cloud: 0.12, rain: 0, snow: 0, fog: 0, wind: 0.5, storm: 0, label: 'Clear skies' },
  breezy: { cloud: 0.32, rain: 0, snow: 0, fog: 0, wind: 1.35, storm: 0, label: 'A breezy day' },
  cloudy: { cloud: 0.78, rain: 0, snow: 0, fog: 0.15, wind: 0.75, storm: 0, label: 'Overcast' },
  rain: { cloud: 0.96, rain: 0.7, snow: 0, fog: 0.3, wind: 0.95, storm: 0, label: 'Gentle rain' },
  storm: { cloud: 1.0, rain: 1.0, snow: 0, fog: 0.35, wind: 1.85, storm: 1, label: 'Thunderstorm' },
  fog: { cloud: 0.45, rain: 0, snow: 0, fog: 1.0, wind: 0.18, storm: 0, label: 'Misty' },
  snow: { cloud: 0.85, rain: 0, snow: 0.85, fog: 0.35, wind: 0.45, storm: 0, label: 'Snowfall' },
};

export const SEASONS = [
  { name: 'Spring', foliage: [1, 1, 1], blossom: [1, 1, 1], bscale: 1, petals: 1, leaves: 0, butterflies: 0.8, fireflies: 0.5, weights: { clear: 3, breezy: 2, cloudy: 2, rain: 2.2, fog: 1, storm: 0.4 } },
  { name: 'Summer', foliage: [0.9, 1.05, 0.8], blossom: [0.5, 1.28, 0.52], bscale: 1.05, petals: 0.12, leaves: 0, butterflies: 1, fireflies: 1, weights: { clear: 5, breezy: 2, cloudy: 1, rain: 1, storm: 1.2, fog: 0.4 } },
  { name: 'Autumn', foliage: [1.2, 0.9, 0.52], blossom: [1.3, 0.62, 0.3], bscale: 0.95, petals: 0, leaves: 1, butterflies: 0.25, fireflies: 0.25, weights: { clear: 2, breezy: 2.5, cloudy: 2, rain: 2, fog: 2, storm: 0.4 } },
  { name: 'Winter', foliage: [0.8, 0.85, 0.86], blossom: [1, 1, 1], bscale: 0.0, petals: 0, leaves: 0.08, butterflies: 0, fireflies: 0, weights: { clear: 2, cloudy: 2, snow: 4, fog: 1.5 } },
];

const DAY_SECONDS = 540; // a full day-night cycle

export function createEnvironment() {
  const listeners = {};
  const env = {
    hour: 9.2, autoTime: true, timeScale: 1,
    seasonPos: 0, seasonTarget: 0, autoSeason: true, daysInSeason: 0,
    weather: 'clear', weatherTimer: rand(80, 130), autoWeather: true,
    cloud: 0.12, rain: 0, snow: 0, fog: 0, wind: 0.5, storm: 0,
    wetness: 0, puddles: 0, snowCover: 0, ice: 0, rainbow: 0, flash: 0,
    night: 0, stars: 0, sunAlt: 0.5, dayCount: 0,
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
    lightColor: new THREE.Color(), lightInt: 1,
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiInt: 0.6,
    skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), skyBottom: new THREE.Color(),
    fogColor: new THREE.Color(), fogDensity: 0.005, exposure: 1,
    sat: 1.2, con: 1.08, tint: new THREE.Color(), lift: new THREE.Color(), rim: new THREE.Color(),
    foliage: new THREE.Color(1, 1, 1), blossom: new THREE.Color(1, 1, 1), bscale: 1,
    petals: 1, leaves: 0, butterflies: 1, fireflies: 0.5, gust: 0,
    season: 0, seasonName: 'Spring',
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    emit(ev, ...a) { (listeners[ev] || []).forEach((f) => f(...a)); },
    setWeather(name, immediate = false) {
      if (!WEATHERS[name]) return;
      const winter = env.seasonTarget === 3;
      if (winter && name === 'rain') name = 'snow';
      if (!winter && name === 'snow') name = 'rain';
      const prev = env.weather;
      env.weather = name;
      env.weatherTimer = rand(110, 220);
      if (immediate) Object.assign(env, pickParams(WEATHERS[name]));
      if (prev !== name) env.emit('weather', name, prev);
    },
    setHour(h) { env.hour = ((h % 24) + 24) % 24; },
    setSeason(i) { env.seasonTarget = i; env.daysInSeason = 0; if (env.weather === 'rain' && i === 3) env.setWeather('snow'); else if (env.weather === 'snow' && i !== 3) env.setWeather('rain'); if (Math.abs(env.seasonPos - i) > 1.5) env.seasonPos = i; env.emit('season', SEASONS[i].name); },
  };
  const pickParams = (w) => ({ cloud: w.cloud, rain: w.rain, snow: w.snow, fog: w.fog, wind: w.wind, storm: w.storm });

  let lastRain = 0, thunderT = rand(6, 14), rainbowT = 0, prevNightBand = null;
  const a = new THREE.Color(), b = new THREE.Color();

  function chooseWeather() {
    const S = SEASONS[env.season];
    const w = { ...S.weights };
    if (env.hour > 4.5 && env.hour < 9.5 && w.fog) w.fog *= 3;
    delete w[env.weather];
    let total = 0;
    for (const k in w) total += w[k];
    let r = rand(0, total);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  }

  function sampleKeys(h) {
    let i = 0;
    while (i < KEYC.length - 2 && KEYC[i + 1].h <= h) i++;
    const k0 = KEYC[i], k1 = KEYC[i + 1];
    const t = smoothstep(0, 1, (h - k0.h) / (k1.h - k0.h));
    return { k0, k1, t };
  }

  env.update = (dt, t) => {
    // ---- time ---------------------------------------------------------------
    if (env.autoTime) {
      const nightK = env.hour > 21 || env.hour < 5 ? 1.6 : 1;
      const prevH = env.hour;
      env.hour += (24 / DAY_SECONDS) * dt * env.timeScale * nightK;
      if (env.hour >= 24) {
        env.hour -= 24; env.dayCount++;
        if (env.autoSeason && ++env.daysInSeason >= 2) { env.daysInSeason = 0; env.setSeason((env.seasonTarget + 1) % 4); }
      }
      if (prevH < 19.0 && env.hour >= 19.0) env.emit('dusk');
      if (prevH < 6.2 && env.hour >= 6.2) env.emit('dawn');
    }
    // ---- season --------------------------------------------------------------
    let diff = env.seasonTarget - env.seasonPos;
    if (diff > 2) diff -= 4; if (diff < -2) diff += 4;
    env.seasonPos = (env.seasonPos + clamp(diff, -dt * 0.08, dt * 0.08) + 4) % 4;
    const si = Math.floor(env.seasonPos) % 4, sf = smoothstep(0, 1, env.seasonPos - Math.floor(env.seasonPos));
    const S0 = SEASONS[si], S1 = SEASONS[(si + 1) % 4];
    env.season = Math.round(env.seasonPos) % 4;
    env.seasonName = SEASONS[env.season].name;
    env.foliage.setRGB(lerp(S0.foliage[0], S1.foliage[0], sf), lerp(S0.foliage[1], S1.foliage[1], sf), lerp(S0.foliage[2], S1.foliage[2], sf));
    env.blossom.setRGB(lerp(S0.blossom[0], S1.blossom[0], sf), lerp(S0.blossom[1], S1.blossom[1], sf), lerp(S0.blossom[2], S1.blossom[2], sf));
    env.bscale = lerp(S0.bscale, S1.bscale, sf);
    env.petals = lerp(S0.petals, S1.petals, sf);
    env.leaves = lerp(S0.leaves, S1.leaves, sf);
    env.butterflies = lerp(S0.butterflies, S1.butterflies, sf);
    env.fireflies = lerp(S0.fireflies, S1.fireflies, sf);
    const winterW = si === 3 ? 1 - sf : si === 2 ? sf : 0;

    // ---- weather scheduling -------------------------------------------------------
    if (env.autoWeather) {
      env.weatherTimer -= dt;
      if (env.weatherTimer <= 0) env.setWeather(chooseWeather());
    }
    const W = WEATHERS[env.weather];
    const rate = 0.07;
    env.cloud = damp(env.cloud, W.cloud, rate, dt);
    env.rain = damp(env.rain, W.rain * (env.cloud > 0.7 ? 1 : 0.2), rate * 0.9, dt);
    env.snow = damp(env.snow, W.snow, rate * 0.8, dt);
    env.fog = damp(env.fog, W.fog, rate * 0.7, dt);
    env.storm = damp(env.storm, W.storm, rate, dt);
    env.gust = 0.5 + 0.5 * noise1(t * 0.12, 3.3);
    env.wind = damp(env.wind, W.wind * (0.75 + 0.5 * env.gust), 0.5, dt);
    if (lastRain < 0.25 && env.rain >= 0.25) env.emit('rainStart');
    if (lastRain >= 0.2 && env.rain < 0.2) {
      env.emit('rainStop');
      if (env.sunAlt > 0.08 && env.snow < 0.1) rainbowT = 45;
    }
    lastRain = env.rain;
    env.wetness = clamp(env.wetness + (env.rain > 0.15 ? env.rain * 0.09 : -0.012) * dt, 0, 1);
    env.puddles = clamp(env.puddles + (env.rain > 0.3 ? env.rain * 0.035 : -0.007) * dt, 0, 1);
    env.snowCover = clamp(env.snowCover + (env.snow > 0.2 ? env.snow * 0.02 : -(winterW > 0.5 ? 0.002 : 0.02)) * dt, 0, 1);
    env.ice = damp(env.ice, winterW > 0.5 ? 1 : 0, 0.05, dt);
    rainbowT = Math.max(0, rainbowT - dt);
    env.rainbow = damp(env.rainbow, rainbowT > 0 && env.rain < 0.2 && env.sunAlt > 0.05 ? 1 : 0, 0.25, dt);

    // lightning
    env.flash = Math.max(0, env.flash - dt * 4);
    if (env.storm > 0.5) {
      thunderT -= dt;
      if (thunderT <= 0) {
        thunderT = rand(7, 18);
        env.flash = 1;
        setTimeout(() => { env.flash = Math.max(env.flash, 0.6); }, 140);
        env.emit('lightning');
        setTimeout(() => env.emit('thunder', rand(0.6, 1)), rand(400, 1800));
      }
    }

    // ---- sun / moon ------------------------------------------------------------------
    const th = ((env.hour - 12) / 12) * Math.PI;
    const alt = Math.cos(th) * THREE.MathUtils.degToRad(62);
    const az = -0.55 + th * 0.85;
    env.sunDir.set(Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)).normalize();
    env.moonDir.set(-env.sunDir.x, -env.sunDir.y, -env.sunDir.z);
    if (env.moonDir.y < 0.15) env.moonDir.y = 0.15 + (0.15 - env.moonDir.y) * 0.2;
    env.moonDir.normalize();
    env.sunAlt = Math.sin(alt);
    const dayW = smoothstep(-0.12, 0.1, env.sunAlt);
    env.night = 1 - smoothstep(-0.14, 0.06, env.sunAlt);
    env.stars = smoothstep(0.55, 0.95, env.night);
    const useSun = env.sunAlt > -0.03;
    env.lightDir.copy(useSun ? env.sunDir : env.moonDir);

    // ---- palette ----------------------------------------------------------------------
    const { k0, k1, t: kt } = sampleKeys(env.hour);
    const L = (f) => a.copy(k0[f]).lerp(k1[f], kt);
    env.lightColor.copy(L('sun'));
    const lightFade = useSun ? smoothstep(-0.03, 0.12, env.sunAlt) : smoothstep(-0.02, 0.2, -env.sunAlt);
    env.lightInt = lerp(k0.si, k1.si, kt) * (0.25 + 0.75 * lightFade);
    env.hemiSky.copy(L('sky'));
    env.hemiGround.copy(L('gnd'));
    env.hemiInt = lerp(k0.hi, k1.hi, kt);
    env.skyTop.copy(L('top'));
    env.skyHorizon.copy(L('hor'));
    env.skyBottom.copy(L('bot'));
    env.fogColor.copy(L('fog'));
    env.exposure = lerp(k0.exp, k1.exp, kt);
    env.sat = lerp(k0.sat, k1.sat, kt);
    env.con = lerp(k0.con, k1.con, kt);
    env.tint.copy(L('tint'));
    env.lift.copy(L('lift'));
    env.rim.copy(L('rim')).multiplyScalar(0.32);

    // ---- weather modifies light ----------------------------------------------------------------
    const c = env.cloud, r = env.rain, f = env.fog;
    const overcast = smoothstep(0.25, 1, c);
    env.lightInt *= 1 - 0.72 * overcast;
    env.hemiInt *= 1 + 0.45 * overcast - 0.1 * r;
    const greyOf = (col, k) => { const l = col.r * 0.3 + col.g * 0.55 + col.b * 0.15; return b.setRGB(l * 0.95, l * 1.0, l * 1.1).multiplyScalar(k); };
    env.skyTop.lerp(greyOf(env.skyTop, 1.15), overcast * 0.75);
    env.skyHorizon.lerp(greyOf(env.skyHorizon, 1.0), overcast * 0.6);
    env.hemiSky.lerp(greyOf(env.hemiSky, 1.05), overcast * 0.5);
    env.lightColor.lerp(greyOf(env.lightColor, 1), overcast * 0.4);
    env.sat *= 1 - 0.14 * overcast;
    env.con *= 1 - 0.04 * overcast;
    env.tint.lerp(b.setRGB(0.9, 0.95, 1.02), r * 0.5);
    env.fogDensity = 0.0035 + f * 0.026 + r * 0.008 + c * 0.003 + env.snow * 0.008;
    env.fogColor.lerp(env.skyHorizon, 0.4).lerp(greyOf(env.fogColor, 1.05), Math.max(f, overcast) * 0.4);
    // lightning flash
    env.hemiInt += env.flash * 2.2;

    // dusk/dawn band events for characters
    const band = env.night > 0.5 ? 'night' : 'day';
    if (prevNightBand && band !== prevNightBand) env.emit(band === 'night' ? 'nightfall' : 'daybreak');
    prevNightBand = band;

    // ---- push shared shader uniforms -------------------------------------------------------
    uniforms.uWind.value = 0.35 + env.wind * 0.95;
    uniforms.uWet.value = env.wetness;
    uniforms.uSnow.value = env.snowCover;
    uniforms.uFoliageTint.value.copy(env.foliage);
    uniforms.uBlossomTint.value.copy(env.blossom);
    uniforms.uBlossomScale.value = env.bscale;
    uniforms.uRim.value.copy(env.rim);
    uniforms.uGrade.value.set(env.sat, env.con, 0, 0);
    uniforms.uGradeTint.value.copy(env.tint);
    uniforms.uGradeLift.value.copy(env.lift);
    uniforms.uNight.value = env.night;
  };

  return env;
}

/** Push the environment state into lights, fog, sky and water. */
export function applyEnvironment(env, { sun, hemi, scene, renderer, sky, water, camera, rainbow }) {
  sun.position.copy(sun.target.position).addScaledVector(env.lightDir, 32);
  sun.color.copy(env.lightColor);
  sun.intensity = env.lightInt;
  hemi.color.copy(env.hemiSky);
  hemi.groundColor.copy(env.hemiGround);
  hemi.intensity = env.hemiInt;
  scene.fog.color.copy(env.fogColor);
  scene.fog.density = env.fogDensity;
  renderer.toneMappingExposure = env.exposure;
  sky.uTop.value.copy(env.skyTop);
  sky.uHorizon.value.copy(env.skyHorizon);
  sky.uBottom.value.copy(env.skyBottom).lerp(env.fogColor, Math.min(1, env.fog + 0.3));
  sky.uSunDir.value.copy(env.sunDir);
  sky.uSunColor.value.copy(env.lightColor).multiplyScalar(env.sunAlt > -0.05 ? 1 : 0);
  sky.uMoonDir.value.copy(env.moonDir);
  sky.uStars.value = env.stars;
  sky.uCloudy.value = env.cloud;
  sky.uFlash.value = env.flash * 0.5;
  water.uSunDir.value.copy(env.lightDir);
  water.uSunColor.value.copy(env.lightColor).multiplyScalar(Math.min(1.2, env.lightInt * 0.4));
  water.uSky.value.copy(env.skyTop);
  water.uHorizon.value.copy(env.skyHorizon);
  water.uRain.value = env.rain;
  water.uIce.value = env.ice;
  water.uFogColor.value.copy(env.fogColor);
  water.uFogDensity.value = env.fogDensity;
  water.uNightW.value = env.night;
  if (rainbow) {
    rainbow.mesh.visible = env.rainbow > 0.01;
    rainbow.mat.uniforms.uOpacity.value = env.rainbow;
    const away = new THREE.Vector3(-env.sunDir.x, 0, -env.sunDir.z).normalize();
    rainbow.mesh.position.copy(away.multiplyScalar(30)).setY(-6);
    rainbow.mesh.lookAt(0, -6, 0);
  }
}
