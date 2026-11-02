// Tests for the brows step: shade table, try-on effect, brow geometry and the brow check.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BROW_STAGES, BROW_SHADES, browHairClass, browShade, buildBrowEffects } from '../shared/brows.js';
import { depthFromHex } from '../shared/color.js';
import { TASKS } from '../api/_youcam.js';
import {
  browGeometry, sampleBrows, expectedBrows, compareBrows, judgeBrow, judgeMap,
} from '../src/lib/browCoach.js';


test('sample faces cover three depths (ITA): face-1 deep, face-4 light, face-5 medium', () => {
  assert.equal(depthFromHex('#6c4d3a'), 'deep');
  assert.equal(depthFromHex('#ba9b85'), 'light');
  assert.equal(depthFromHex('#b38f73'), 'medium');
});

test('brow steps: map, fill, blend, gel, each with a tool and a tip', () => {
  assert.deepEqual(BROW_STAGES.map((s) => s.id), ['map', 'fill', 'blend', 'gel']);
  for (const s of BROW_STAGES) { assert.ok(s.title && s.tool && s.tip); }
});

test('brow shade table: every hair color has light, medium and deep', () => {
  for (const row of Object.values(BROW_SHADES)) for (const d of ['light', 'medium', 'deep']) assert.match(row[d].hex, /^#[0-9a-f]{6}$/i);
});

test('hair class from the measured brow color', () => {
  assert.equal(browHairClass('#151110', 'light'), 'black');
  assert.equal(browHairClass('#9a9895', 'light'), 'grey');
  assert.equal(browHairClass('#b39a7a', 'light'), 'blonde');
  // Deep skin: the brow patch reads light because it mixes in skin; still dark brown.
  assert.equal(browHairClass('#5a4436', 'deep'), 'darkBrown');
  assert.equal(browShade('#5a4436', 'deep').hex, BROW_SHADES.darkBrown.deep.hex);
  // Fair skin with grey brows never gets near-black.
  assert.notEqual(browShade('#9a9895', 'light').hair, 'black');
});

test('eyebrow try-on effect: Original12 shape, color builds per step, map is zero-strength', () => {
  const ints = ['fill', 'blend', 'gel'].map((s) => {
    const [e] = buildBrowEffects(s, '#3a2a22', 'medium');
    assert.equal(e.category, 'eyebrows');
    assert.equal(e.pattern.name, 'Original12');
    assert.equal(e.palettes[0].texture, 'matte');
    return e.palettes[0].colorIntensity;
  });
  assert.ok(ints[0] < ints[1] && ints[1] < ints[2]);
  assert.ok(ints[2] <= 50, 'kept natural');
  assert.equal(buildBrowEffects('map', null)[0].palettes[0].colorIntensity, 0);
  // Deeper skin gets a little more color so it shows.
  assert.ok(buildBrowEffects('gel', null, 'deep')[0].palettes[0].colorIntensity > buildBrowEffects('gel', null, 'light')[0].palettes[0].colorIntensity);
});

test('vto request body for brows validates the stage and the color', () => {
  const b = TASKS.vto.body('f1', { lookId: 'brows', stage: 'fill', browHex: '#3a2a22', depth: 'deep' });
  assert.equal(b.effects[0].category, 'eyebrows');
  assert.throws(() => TASKS.vto.body('f1', { lookId: 'brows', stage: 'wing' }));
  // A bad color is ignored (falls back to the default shade), never sent through.
  const bad = TASKS.vto.body('f1', { lookId: 'brows', stage: 'gel', browHex: 'red;drop' });
  assert.match(bad.effects[0].palettes[0].color, /^#[0-9a-f]{6}$/i);
});

// ---- Geometry and check on made-up landmarks and painted images ----
const W = 1000, H = 1000;
function makeFace() {
  const f = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const set = (i, x, y) => (f[i] = { x, y });
  // Right brow (image left): inner -> outer, upper row slightly arched, lower row 0.02 below.
  const ux = [0.44, 0.415, 0.39, 0.365, 0.34], uy = [0.372, 0.362, 0.358, 0.360, 0.370];
  [107, 66, 105, 63, 70].forEach((i, k) => set(i, ux[k], uy[k]));
  [55, 65, 52, 53, 46].forEach((i, k) => set(i, ux[k], uy[k] + 0.02));
  [336, 296, 334, 293, 300].forEach((i, k) => set(i, 1 - ux[k], uy[k]));
  [285, 295, 282, 283, 276].forEach((i, k) => set(i, 1 - ux[k], uy[k] + 0.02));
  set(133, 0.45, 0.45); set(33, 0.35, 0.45); set(362, 0.55, 0.45); set(263, 0.65, 0.45);
  set(129, 0.465, 0.58); set(358, 0.535, 0.58);
  [469, 470, 471, 472].forEach((i, k) => set(i, [0.385, 0.40, 0.415, 0.40][k], [0.45, 0.435, 0.45, 0.465][k]));
  [474, 475, 476, 477].forEach((i, k) => set(i, [0.615, 0.60, 0.585, 0.60][k], [0.45, 0.435, 0.45, 0.465][k]));
  set(10, 0.5, 0.15);
  return f;
}
const SKIN = [150, 112, 90];
function image(paint = []) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data.set([...SKIN, 255], i * 4); }
  for (const pts of paint) for (const [x, y] of pts) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      data.set([60, 44, 38], (Y * W + X) * 4);
    }
  }
  return { data, width: W, height: H };
}
const face = makeFace();
// Paint a brow along the geometry, t from t0 to t1, |v| <= half.
function browPaint(side, t0, t1, half = 0.45) {
  const g = browGeometry(face, side, W, H);
  const pts = [];
  for (let t = t0; t <= t1; t += 0.01) for (let v = -half; v <= half; v += 0.05) { const p = g.pointAt(t, v); pts.push([p.x, p.y]); }
  return pts;
}

test('geometry: guide points in order (start < arch < end) on both brows', () => {
  for (const side of ['right', 'left']) {
    const g = browGeometry(face, side, W, H);
    const { start, arch, end } = g.guides;
    const along = (p) => (p.at.x - g.S.x) * g.u.x + (p.at.y - g.S.y) * g.u.y;
    assert.ok(along(start) < along(arch) && along(arch) < along(end), side);
    assert.ok(g.archT > 0.4 && g.archT < 1, `${side} arch ${g.archT}`);
  }
  const m = judgeMap(browGeometry(face, 'right', W, H), browGeometry(face, 'left', W, H));
  assert.ok(m.tip && m.ok);
});

const bare = sampleBrows(image(), face);
const full = sampleBrows(image([browPaint('right', 0, 1), browPaint('left', 0, 1)]), face);
const fromGoal = expectedBrows(bare, full);

test('no color: tells the user to start with light strokes', () => {
  const j = judgeBrow('fill', compareBrows(bare, bare, fromGoal));
  assert.equal(j.tip.id, 'brow_none');
});

test('even, full brows that match the goal: ok', () => {
  const j = judgeBrow('fill', compareBrows(bare, full, fromGoal));
  assert.equal(j.ok, true, j.tip?.text);
});

test('short tail on one side is caught', () => {
  const now = sampleBrows(image([browPaint('right', 0, 0.6), browPaint('left', 0, 1)]), face);
  const j = judgeBrow('fill', compareBrows(bare, now, fromGoal));
  assert.equal(j.tip.id, 'brow_tail_short');
  assert.match(j.tip.text, /right/);
});

test('color well outside the brow is spill', () => {
  const g = browGeometry(face, 'left', W, H);
  const smear = [];
  for (let t = 0; t <= 1; t += 0.01) for (let v = 1.3; v <= 1.5; v += 0.05) { const p = g.pointAt(t, v); smear.push([p.x, p.y]); }
  const now = sampleBrows(image([browPaint('right', 0, 1), browPaint('left', 0, 1), smear]), face);
  const j = judgeBrow('fill', compareBrows(bare, now, fromGoal));
  assert.equal(j.tip.id, 'brow_spill');
});

test('one brow filled, the other bare: asks for color on that side', () => {
  const now = sampleBrows(image([browPaint('right', 0, 1)]), face);
  const j = judgeBrow('fill', compareBrows(bare, now, fromGoal));
  assert.equal(j.ok, false);
  assert.match(j.tip.text, /left/);
});

test('without step pictures the fixed brow zone is used', () => {
  const j = judgeBrow('gel', compareBrows(bare, full, null));
  assert.equal(j.ok, true, j.tip?.text);
});

// ---- Real sample face: the saved YouCam brow step pictures ----
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* optional */ }
const real = JSON.parse(fs.readFileSync(new URL('./fixtures/face-1-landmarks.json', import.meta.url))).map(([x, y]) => ({ x, y }));
const load = async (name) => {
  const { data, info } = await sharp(new URL(`../src/demo/${name}.jpg`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

test('sample face 1: each brow step picture passes its own check, bare does not', { skip: !sharp && 'sharp not installed' }, async () => {
  const b = sampleBrows(await load('vto-bare'), real);
  for (const st of ['fill', 'blend', 'gel']) {
    const now = sampleBrows(await load(`vto-brows-${st}`), real);
    const exp = expectedBrows(b, now);
    assert.ok(exp, `${st} has a visible change`);
    assert.equal(judgeBrow(st, compareBrows(b, now, exp)).ok, true, st);
    assert.equal(judgeBrow(st, compareBrows(b, b, exp)).tip.id, 'brow_none', st);
    // Arch found near the brow's own arch, not at an end.
    const c = compareBrows(b, now, exp);
    for (const e of [c.right, c.left]) assert.ok(e.peak > 0.35 && e.peak < 1, `${st} peak ${e.peak}`);
  }
});
