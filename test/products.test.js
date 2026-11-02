// Tests for the product knowledge table and label-text rules. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, PRODUCT_KNOWLEDGE, productAdvice, typeFromText, formulaNotes } from '../src/lib/products.js';
import { mergeLabelHint } from '../src/lib/productVision.js';
import { prepTip } from '../src/lib/skinSummary.js';
import { stepHow } from '../src/lib/coachRules.js';

test('every product has knowledge', () => {
  for (const p of PRODUCTS) assert.ok(PRODUCT_KNOWLEDGE[p.id]?.what, p.id);
});

test('advice puts the skin-type tip first', () => {
  const a = productAdvice('primer', { oily: true });
  assert.match(a[0], /oily/i);
  assert.equal(productAdvice('nope', {}).length, 0);
});

test('label text maps to a type (real OCR strings from the test photos)', () => {
  assert.equal(typeFromText('MAXACTchi-fiWATERPROOFCREMEMASCARABROWNI').id, 'mascara');
  assert.equal(typeFromText('BE A NATURAL EYESHADOW NUDE PALETTE06EN').id, 'palette');
  assert.match(typeFromText('Matte Lipstick 05').not, /lip/);
  assert.equal(typeFromText('SHISEIDO'), null);
});

test('formula notes depend on skin', () => {
  assert.match(formulaNotes('creme shadow', { oily: true })[0], /primer/);
  assert.match(formulaNotes('creme shadow', { dry: true })[0], /dry/);
  assert.equal(formulaNotes('', {}).length, 0);
});

test('label hint moves its type to the top', () => {
  const g = [{ product: PRODUCTS.find((p) => p.id === 'primer'), score: 0.9 }];
  const m = mergeLabelHint(g, { id: 'mascara' });
  assert.equal(m[0].product.id, 'mascara');
  assert.equal(m[1].product.id, 'primer');
});

test('prep and step text follow the profile', () => {
  assert.match(prepTip({ oily: true }), /primer/);
  assert.match(stepHow('crease', { eyelid: 'Single-lid' }), /gradient/);
  assert.match(stepHow('wing', { eyeAngle: 'Downturned' }), /up/);
});
