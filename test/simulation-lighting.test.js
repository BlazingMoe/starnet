'use strict';

/* The station should feel warm and comfortable without solving brightness by flattening the
   light model. Lock the color temperature separately from the existing intensity controls so a
   future polish pass cannot drift the pools back toward white or silently reduce readability. */

const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const read = name => fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', name), 'utf8');
const bake = read('stationbake.js');
const world = read('world.js');
const build = read('build.js');
const lab = read('crtlab.js');

const srgb = v => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = rgb => 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
const warm = rgb => rgb[0] - rgb[2];

const oldPool = [250, 236, 206], pool = [246, 224, 188];
const oldGlow = [240, 230, 206], glow = [238, 218, 184];

// 2026-09-02: the six literal stops became ONE constant (POOL_RGB) painted through falloffStops, so
// the room pool, the corridor pool and the lightmap's cut all ride the same curve. The colour lock
// moves to the constant; the two pool sites must still draw through it.
A.ok(/const POOL_RGB = '246,224,188'/.test(bake), 'the warm-neutral pool color is the one POOL_RGB constant');
A.eq((bake.match(/falloffStops\((?:gw|g), POOL_RGB, LIGHT\.floor\)/g) || []).length, 2,
  'room and corridor pools both paint POOL_RGB along the shared falloff curve');
A.ok(!/rgba\(246,224,188,' \+ LIGHT\.floor/.test(bake), 'no pool still hand-rolls its own stop list');
A.ok(!/rgba\(250,236,206/.test(bake), 'the near-white floor-pool color no longer ships');
A.ok(/rgba\(255,228,184,0\.55\)/.test(bake), 'the wall fixture highlight is warm instead of pure white');
A.ok(/rgba\(238,218,184/.test(world), 'the live simulation shimmer uses the warmer lamp color');
A.ok(/rgba\(238,218,184/.test(build), 'REFIT preview matches the live simulation shimmer color');

A.ok(luminance(pool) < luminance(oldPool), 'floor pools are slightly less luminous than before');
A.ok(luminance(pool) > 0.70, 'floor pools retain a bright source color for readable deck contrast');
A.ok(warm(pool) > warm(oldPool), 'floor pools shift warmer rather than merely darker');
A.ok(luminance(glow) < luminance(oldGlow), 'animated shimmer is slightly less luminous than before');
A.ok(luminance(glow) > 0.65, 'animated shimmer remains visible over the ambient mask');
A.ok(warm(glow) > warm(oldGlow), 'animated shimmer shifts warmer rather than merely darker');

/* The shipped light controls, locked so a polish pass can't drift them silently — and so the CRT
   LAB's RESET can never restore a state that never shipped. Dulled 2026-08-15 on Andrew's call
   ("a bit too bright… slightly dull it"). Re-lit 2026-09-02 (the world glow-up): a physical
   falloff curve, a cool shadow plate, a warm film inside each pool, starlight spill, and pools
   with 1.3x reach — measured on a furnished lounge as contrast + colour (mean luma 31 -> 44, lit
   deck 2% -> 7%, chroma 12 -> 22) with the ambient plate itself barely moved (0.82 -> 0.80).
   `pitch` (the fixture grid) did NOT move — dimming that flattens the model instead of dimming
   the room, which is the failure this file exists to prevent. */
const lightControls = { ambient: '0.8', pool: '1', room: '0.56', corridor: '0.4', door: '0.46', floor: '0.26', crown: '0.45', pitch: '8', reach: '1.3', falloff: '0.85', cool: '0.6', warm: '0.14', spill: '0.7' };
for (const [key, value] of Object.entries(lightControls)) {
  const lock = new RegExp('\\b' + key + ': ' + value.replace('.', '\\.') + '(?:[, }])');
  A.ok(lock.test(bake), 'the shipped ' + key + ' lighting control remains ' + value);
  A.ok(lock.test(lab), 'the CRT lab reset keeps ' + key + ' at the shipped value');
}

A.report('simulation-lighting');
