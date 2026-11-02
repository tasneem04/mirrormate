// Tests for the looks: stage layers, lips and intensity. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEffects, stageIds, stageForStep, lipColor, LOOK_IDS } from '../shared/looks.js';

test('each look builds up base -> crease -> liner -> (smoke|wing) -> lips', () => {
  assert.deepEqual(stageIds('natural'), ['base', 'crease', 'liner', 'lips']);
  assert.deepEqual(stageIds('smoky'), ['base', 'crease', 'liner', 'smoke', 'lips']);
  assert.deepEqual(stageIds('winged'), ['base', 'crease', 'liner', 'wing', 'lips']);
});

test('base stage is lid shadow only; full look has lips with a satin finish', () => {
  for (const id of LOOK_IDS) {
    const base = buildEffects(id, 'neutral', 'deep', 'base');
    assert.equal(base.length, 1);
    assert.equal(base[0].category, 'eye_shadow');
    const full = buildEffects(id, 'neutral', 'deep');
    const lip = full.find((e) => e.category === 'lip_color');
    assert.ok(lip, `${id} has lips`);
    assert.equal(lip.palettes[0].texture, 'satin');
    assert.ok(lip.palettes[0].colorIntensity <= 60);
  }
});

test('liner stays soft: low intensity, thin patterns, no deep-skin boost', () => {
  for (const id of LOOK_IDS) {
    const deep = buildEffects(id, 'neutral', 'deep').filter((e) => e.category === 'eye_liner');
    const light = buildEffects(id, 'neutral', 'light').filter((e) => e.category === 'eye_liner');
    assert.equal(deep.length, 1);
    assert.ok(deep[0].palettes[0].colorIntensity <= 50);
    assert.equal(deep[0].palettes[0].colorIntensity, light[0].palettes[0].colorIntensity);
    assert.ok(['Smoke28', 'Smoke17', 'OpenWings5'].includes(deep[0].pattern.name));
  }
});

test('deep skin gets only a small shadow boost (+10)', () => {
  const ci = (d) => buildEffects('smoky', 'neutral', d, 'smoke')[0].palettes[1].colorIntensity;
  assert.equal(ci('deep') - ci('light'), 10);
});

test('palette count matches the pattern color count', () => {
  const n = { '1color1': 1, '2colors1': 2, '3colors1': 3 };
  for (const id of LOOK_IDS) for (const st of stageIds(id)) {
    for (const e of buildEffects(id, 'warm', 'medium', st)) {
      if (e.category === 'eye_shadow') assert.equal(e.palettes.length, n[e.pattern.name]);
    }
  }
});

test('lip colors follow the look and depth', () => {
  assert.notEqual(lipColor('natural', 'warm', 'light'), lipColor('natural', 'warm', 'deep'));
  assert.notEqual(lipColor('winged', 'cool', 'medium'), lipColor('smoky', 'cool', 'medium'));
});

test('coach steps map to step images', () => {
  assert.equal(stageForStep('smoky', 'outer'), 'smoke');
  assert.equal(stageForStep('smoky', 'liner'), 'smoke');
  assert.equal(stageForStep('natural', 'liner'), 'liner');
  assert.equal(stageForStep('winged', 'wing'), 'wing');
  assert.equal(stageForStep('natural', 'prep'), null);
  assert.throws(() => buildEffects('natural', 'warm', 'deep', 'wing'));
});
