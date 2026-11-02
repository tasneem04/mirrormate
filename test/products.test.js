// Tests for the product knowledge table and label-text rules. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, PRODUCT_KNOWLEDGE, productAdvice, typeFromText, formulaNotes, FIT, CLIP_PRODUCTS, normalizeIdentify, identifyWins, productFit, shadeGuide, SHADE_GUIDE, missingTools } from '../src/lib/products.js';
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

test('saved demo scan: combination prep tip, friendly face shape, smoky look', async () => {
  const fs = await import('node:fs');
  const { buildProfile, prepTip, profileCards, recommendedLook } = await import('../src/lib/skinSummary.js');
  const p = buildProfile(JSON.parse(fs.readFileSync(new URL('../src/demo/scan.json', import.meta.url))));
  assert.equal(p.skinType, 'Combination');
  assert.match(prepTip(p), /^Combination/);
  assert.equal(profileCards(p).find((c) => c.title === 'Face shape')?.text, 'Heart.');
  assert.ok(recommendedLook(p));
});

test('every product has a beginner level and fit table', () => {
  for (const p of PRODUCTS) assert.ok(FIT[p.id] && [1, 2, 3].includes(FIT[p.id].level), p.id);
  assert.ok(CLIP_PRODUCTS.length < PRODUCTS.length);
});

test('fit warns first for the profile', () => {
  const f = productFit('liner_kohl', { oily: true, eyelid: 'Hooded-lid' });
  assert.equal(f[0].rating, 'avoid');
  assert.match(productAdvice('glitter_shadow', { sensitive: true }).join(' '), /Careful|eye/);
});

test('shade guide covers every undertone and depth', () => {
  for (const u of Object.keys(SHADE_GUIDE)) for (const d of ['light', 'medium', 'deep']) assert.ok(shadeGuide(u, d).use, u + d);
  assert.match(shadeGuide('cool', 'deep').use, /plum/);
});

test('new label words map to subtypes', () => {
  assert.equal(typeFromText('Lash Sensational TUBING mascara').id, 'mascara_tubing');
  assert.equal(typeFromText('Kajal kohl pencil').id, 'liner_kohl');
  assert.equal(typeFromText('Fixing spray').id, 'setting_spray');
  assert.equal(typeFromText('Baked eyeshadow').id, 'baked_shadow');
});

test('gemini output is cleaned and only wins when sure', () => {
  const r = normalizeIdentify({ type: 'mascara', confidence: 1.4, brand: 'Max Factor', goodFor: ['Oily', 'aliens'], badFor: 'x' });
  assert.equal(r.type, 'mascara');
  assert.equal(r.confidence, 1);
  assert.deepEqual(r.goodFor, ['oily']);
  assert.deepEqual(r.badFor, []);
  assert.ok(identifyWins(r));
  assert.ok(!identifyWins(normalizeIdentify({ type: 'mascara', confidence: 0.4 })));
  assert.equal(normalizeIdentify({ type: 'rocket' }).type, null);
  assert.ok(normalizeIdentify({ type: 'not_eye', confidence: 0.9 }).notEye);
});
