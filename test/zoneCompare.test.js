// Tests for the live color comparison, with made-up landmarks and painted images. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleFace, compareStep, judge, expectedFor, doneTracker, rgbToLab } from '../src/lib/zoneCompare.js';

const W = 1000, H = 1000;
function makeFace() {
  const f = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const set = (i, x, y) => (f[i] = { x, y });
  set(33, 0.35, 0.45); set(133, 0.45, 0.45); set(159, 0.40, 0.435); set(145, 0.40, 0.465);
  [246, 161, 160, 158, 157, 173].forEach((i, k) => set(i, 0.36 + k * 0.015, 0.44));
  set(52, 0.40, 0.38); set(46, 0.32, 0.385); set(7, 0.355, 0.455);
  set(263, 0.65, 0.45); set(362, 0.55, 0.45); set(386, 0.60, 0.435); set(374, 0.60, 0.465);
  [466, 388, 387, 385, 384, 398].forEach((i, k) => set(i, 0.64 - k * 0.015, 0.44));
  set(282, 0.60, 0.38); set(276, 0.68, 0.385); set(249, 0.645, 0.455);
  return f;
}
const SKIN = [108, 77, 58];
function image(paint = [], shift = 0) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = SKIN[0] + shift; data[i * 4 + 1] = SKIN[1] + shift; data[i * 4 + 2] = SKIN[2] + shift; data[i * 4 + 3] = 255; }
  for (const { x0, x1, y0, y1, c } of paint) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; }
  }
  return { data, width: W, height: H };
}
const PLUM = [70, 40, 48];
// Lid (lash line up to about the crease) on each eye.
const lidR = { x0: 345, x1: 448, y0: 414, y1: 442, c: PLUM };
const lidL = { x0: 552, x1: 655, y0: 414, y1: 442, c: PLUM };
const face = makeFace();
const snap = (img) => sampleFace(img, face);
const bare = snap(image());

test('Lab conversion: white is L=100, black is L=0', () => {
  assert.ok(Math.abs(rgbToLab(255, 255, 255)[0] - 100) < 0.5);
  assert.ok(Math.abs(rgbToLab(0, 0, 0)[0]) < 0.5);
});

test('no change: tells the user there is no color yet', () => {
  const j = judge(compareStep('base', bare, snap(image()), {}));
  assert.equal(j.ok, false);
  assert.equal(j.tip.id, 'cmp_none');
});

test('a brighter room is not mistaken for makeup', () => {
  const j = judge(compareStep('base', bare, snap(image([], 10)), {}));
  assert.equal(j.tip.id, 'cmp_none');
});

test('lid color on both eyes passes the base step', () => {
  const c = compareStep('base', bare, snap(image([lidR, lidL])), {});
  assert.ok(c.right.coverage > 0.5 && c.left.coverage > 0.5);
  assert.equal(judge(c).ok, true);
});

test('only one eye done: asks to fill in the other eye', () => {
  const j = judge(compareStep('base', bare, snap(image([lidR])), {}));
  assert.equal(j.ok, false);
  assert.equal(j.tip.id, 'cmp_cover');
  assert.match(j.tip.text, /left eye/);
});

test('color up to the brow: too high', () => {
  const high = (b) => ({ ...b, y0: 370 });
  const j = judge(compareStep('base', bare, snap(image([high(lidR), high(lidL)])), {}));
  assert.equal(j.tip.id, 'cmp_high');
});

test('with goal images the target is the expected change on her face', () => {
  const goal = snap(image([lidR, lidL]));
  const exp = expectedFor('base', bare, goal, {});
  assert.ok(exp && exp.right.keys.size > 6);
  const c = compareStep('base', bare, goal, {}, exp);
  assert.equal(c.fromGoal, true);
  assert.ok(c.right.coverage > 0.95);
  assert.equal(judge(c).ok, true);
  // Half the lid width is not enough.
  const half = snap(image([{ ...lidR, x0: 400 }, { ...lidL, x1: 600 }]));
  assert.equal(judge(compareStep('base', bare, half, {}, exp)).tip.id, 'cmp_cover');
});

test('step done only after the check holds', () => {
  const done = doneTracker(1500);
  assert.equal(done(true, 0), false);
  assert.equal(done(true, 1000), false);
  assert.equal(done(false, 1200), false);
  assert.equal(done(true, 1300), false);
  assert.equal(done(true, 2900), true);
});
