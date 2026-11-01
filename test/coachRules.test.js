// Tests for the live coach rules with made-up landmarks. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { coachTip, newHistory, faceCheck, eyeFrame, wingTargetAngle, countReversals } from '../src/lib/coachRules.js';

const W = 1000, H = 1000;

// A straight-on face. Person's right eye is on the image left (camera is not mirrored).
function makeFace(overrides = {}) {
  const f = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const set = (i, x, y) => (f[i] = { x, y });
  set(1, 0.5, 0.55);   // nose tip
  set(234, 0.25, 0.5); // face edges
  set(454, 0.75, 0.5);
  // Right eye
  set(33, 0.35, 0.45); set(133, 0.45, 0.45); set(159, 0.40, 0.435);
  [246, 161, 160, 158, 157, 173].forEach((i, k) => set(i, 0.36 + k * 0.015, 0.44));
  set(52, 0.40, 0.38); set(46, 0.32, 0.385); set(7, 0.355, 0.455);
  // Left eye (mirror image)
  set(263, 0.65, 0.45); set(362, 0.55, 0.45); set(386, 0.60, 0.435);
  [466, 388, 387, 385, 384, 398].forEach((i, k) => set(i, 0.64 - k * 0.015, 0.44));
  set(282, 0.60, 0.38); set(276, 0.68, 0.385); set(249, 0.645, 0.455);
  for (const [i, p] of Object.entries(overrides)) f[i] = p;
  return f;
}

// A hand whose index fingertip (8) is at px point p; knuckle (5) sits below it.
function makeHand(p) {
  const hand = Array.from({ length: 21 }, () => ({ x: p.x / W, y: (p.y + 120) / H }));
  hand[5] = { x: p.x / W, y: (p.y + 80) / H };
  hand[8] = { x: p.x / W, y: p.y / H };
  return hand;
}

// Feed a path of tool points (px) to the coach, 40 ms apart. Returns the last tip.
function run(step, path, { face = makeFace(), history = newHistory(), profile } = {}) {
  let tip = null;
  path.forEach((p, k) => {
    const t = coachTip(step, face, makeHand(p), history, { w: W, h: H, now: 1000 + k * 40, brushReach: 0, profile });
    if (t) tip = t;
  });
  return tip;
}

const still = (p, n = 10) => Array.from({ length: n }, () => p);

test('face check passes for a centered face and asks to come closer when small', () => {
  assert.equal(faceCheck(makeFace(), W, H, 120), null);
  const small = makeFace({ 234: { x: 0.45, y: 0.5 }, 454: { x: 0.55, y: 0.5 } });
  assert.equal(faceCheck(small, W, H, 120).id, 'closer');
  assert.equal(faceCheck(makeFace(), W, H, 40).id, 'light');
  assert.equal(faceCheck(null, W, H, 120).id, 'no_face');
});

test('base: on the lid is good, on the brow is too high', () => {
  // Lash line y=435, brow y=380 for the right eye (browDist 55 px).
  assert.equal(run('base', still({ x: 400, y: 425 })).id, 'base_ok');
  assert.equal(run('base', still({ x: 400, y: 382 })).id, 'base_lower');
});

test('crease: too close to the lashes says go higher', () => {
  assert.equal(run('crease', still({ x: 400, y: 432 })).id, 'crease_higher');
});

test('crease: hooded lids move the target up', () => {
  const hooded = { eyelid: 'Hooded-lid' };
  // h = (435-411)/55 = 0.44: fine for a regular lid, still low-ish but in range for hooded (0.5 - 0.14 = 0.36)
  assert.notEqual(run('crease', still({ x: 400, y: 411 }), { profile: hooded }).id, 'crease_higher');
});

test('crease: side-to-side moves count as blending', () => {
  const wiggle = Array.from({ length: 30 }, (_, k) => ({ x: 400 + (k % 6 < 3 ? -15 : 15), y: 413 }));
  assert.equal(run('crease', wiggle).id, 'crease_ok');
  assert.equal(run('crease', still({ x: 400, y: 413 }, 30)).id, 'blend_more');
});

test('wing: along the brow-tail line is ok, flat is too low', () => {
  const frame = eyeFrame(makeFace(), 'right', W, H);
  const target = wingTargetAngle(frame);
  assert.ok(target > 20 && target < 80, `target angle ${target}`);
  // From the outer corner (350,450) toward the brow tail direction (-35,-70).
  const good = Array.from({ length: 10 }, (_, k) => ({ x: 350 - k * 1.6, y: 450 - k * 3.2 }));
  assert.equal(run('wing', good).id, 'wing_ok');
  const flat = Array.from({ length: 10 }, (_, k) => ({ x: 350 - k * 6, y: 450 }));
  assert.equal(run('wing', flat).id, 'wing_low');
});

test('wing: right angle but reaching the brow is too long', () => {
  const long = Array.from({ length: 10 }, (_, k) => ({ x: 350 - k * 3.6, y: 450 - k * 7.2 }));
  assert.equal(run('wing', long).id, 'wing_long');
});

test('outer corner: inner lid is wrong, outer corner is right', () => {
  // Right eye: inner corner x=450, outer x=350, center 400. s>0.12 means x < 388.
  assert.equal(run('outer', still({ x: 420, y: 430 })).id, 'outer_out');
  assert.equal(run('outer', still({ x: 360, y: 430 })).id, 'outer_ok');
  assert.equal(run('outer', still({ x: 360, y: 390 })).id, 'outer_lower');
});

test('no hand for over a second asks to bring it into view', () => {
  const history = newHistory();
  history.lastHandAt = 0;
  const tip = coachTip('base', makeFace(), null, history, { w: W, h: H, now: 5000, brushReach: 0 });
  assert.equal(tip.id, 'no_hand');
});

test('countReversals counts direction changes', () => {
  const s = [0, 0.1, 0.2, 0.1, 0, 0.1, 0.2].map((v) => ({ s: v }));
  assert.equal(countReversals(s), 2);
});
