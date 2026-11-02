// Turns raw YouCam results into a simple profile and plain-English cards.
import { shadeGuide } from './eyeKnowledge.js';
import { undertoneFromHex, depthFromHex } from '../../shared/color.js';

// The skin analysis "json" format returns results.output = [{ type, region, ui_score, ... }].
// ui_score is 1-100 where HIGHER means the skin looks BETTER for that concern
// (e.g. high oiliness score = not oily). Tolerant of small format differences.
function skinItems(skin) {
  const out = skin?.results?.output ?? skin?.results ?? [];
  return Array.isArray(out) ? out : [];
}

function scoreOf(items, type) {
  const hit = items.find((i) => i.type === type && (!i.region || i.region === 'whole'))
    || items.find((i) => i.type === type);
  const v = hit?.ui_score ?? hit?.score ?? hit?.raw_score;
  return typeof v === 'number' ? v : null;
}

// Skin type label, if the API returned one in any text field of the skin_type item.
function skinTypeLabel(items) {
  const hit = items.find((i) => i.type === 'skin_type' && (!i.region || i.region === 'whole'))
    || items.find((i) => i.type === 'skin_type');
  if (!hit) return null;
  for (const v of Object.values(hit)) {
    if (typeof v === 'string' && /normal|oily|dry|combination|redness/i.test(v)) return v;
  }
  return null;
}

export function buildProfile(scan) {
  const items = skinItems(scan?.skin);
  const color = scan?.tone?.results?.color || {};
  const faceRes = scan?.face?.results || {};
  const eyelid = faceRes.eyelid || {};
  const skinHex = color.skin_color || null;

  const oiliness = scoreOf(items, 'oiliness');
  const moisture = scoreOf(items, 'moisture');
  const darkCircles = scoreOf(items, 'dark_circle_v2');
  let skinType = skinTypeLabel(items);
  if (!skinType && oiliness != null && moisture != null) {
    if (oiliness < 55 && moisture >= 55) skinType = 'Oily';
    else if (moisture < 55 && oiliness >= 55) skinType = 'Dry';
    else if (oiliness < 55 && moisture < 55) skinType = 'Combination';
    else skinType = 'Normal';
  }

  return {
    skinHex,
    skinError: scan?.skin?.error || null,
    // Brow shade comes from the measured brow color plus skin depth (YouCam's hair color is
    // unreliable on our samples: two different heads both came back "Blonde").
    browHex: color.eyebrow_color || null,
    undertone: skinHex ? undertoneFromHex(skinHex) : 'neutral',
    depth: skinHex ? depthFromHex(skinHex) : 'medium',
    skinType,
    oily: /oily|combination/i.test(skinType || '') || (oiliness != null && oiliness < 55),
    dry: /dry/i.test(skinType || '') || (moisture != null && moisture < 50),
    sensitive: /redness|sensitive/i.test(skinType || ''),
    darkCircles: darkCircles != null && darkCircles < 60,
    scores: { oiliness, moisture, darkCircles },
    eyeColorName: color.eye_color_name || null,
    eyeColor: color.eye_color || null,
    faceShape: faceRes.faceshape || faceRes.faceShape || null,
    eyelid: eyelid.left_eyelid || eyelid.right_eyelid || null, // Hooded-lid, Single-lid, Double-lid, Deep-Set
    eyeShape: eyelid.left_shape || eyelid.right_shape || null, // Narrow, Round, Almond
    eyeAngle: eyelid.left_angle || eyelid.right_angle || null, // Upturned, Downturned, Average
    browShape: faceRes.eyebrow?.left_shape || null,
  };
}

const UNDERTONE_TEXT = {
  warm: 'Warm (golden). Bronze, copper, peach and warm browns look great on you.',
  cool: 'Cool (pink). Taupe, plum, mauve and grey-browns look great on you.',
  neutral: 'Neutral. Soft browns and most nudes suit you.',
};

const EYELID_TEXT = {
  'Hooded-lid': 'Hooded lids: put crease color a little above your natural fold, and check with eyes open. Angle the wing up so the hood does not hide it. The coach aims higher for you.',
  'Single-lid': 'Single lids: build a gradient, darkest at the lashes, lighter going up. No fake crease. A thicker, lifted liner shows with eyes open.',
  'Double-lid': 'Visible fold: classic crease placement works well for you.',
  'Deep-Set': 'Deep-set eyes: lighter shades on the lid bring them forward. Keep dark colors to the outer corner.',
};

const SHAPE_TEXT = {
  Almond: 'Almond eyes: almost every look suits you, wings included.',
  Round: 'Round eyes: a wing that goes outward makes them look longer.',
  Narrow: 'Narrow eyes: keep liner thin in the inner half and thicker toward the outer corner.',
};

const ANGLE_TEXT = {
  Downturned: 'Outer corners point down a little: aim shadow and wing up toward the brow tail, and keep dark liner off the outer lower lashes.',
  Upturned: 'Outer corners lift up: follow your natural shape, keep the wing short.',
};

// Skin prep before eye makeup, by skin type (docs/knowledge.md).
export function prepTip(p) {
  if (p?.sensitive) return 'Sensitive skin: use a fragrance-free moisturizer, patch-test new products, and skip the inner waterline.';
  if (/combination/i.test(p?.skinType || '') || (p?.oily && p?.dry)) return 'Combination skin: light moisturizer all over, eye primer on the lids, a little powder on the T-zone.';
  if (p?.oily) return 'Oily skin: gentle cleanse, oil-free moisturizer, then eye primer. Set the lids with a little powder.';
  if (p?.dry) return 'Dry skin: cleanse, moisturize and wait a minute before makeup. Use a hydrating primer or cream shadow.';
  return 'Cleanse, a light moisturizer, wait a minute, then a thin layer of eye primer or concealer.';
}

// Cards for the results screen: [{ title, text, swatch? }]
export function profileCards(p) {
  const cards = [];
  cards.push({
    title: 'Skin type',
    text: p.skinType
      ? `${p.skinType}.${p.oily ? ' Your lids may get oily: an eye primer helps shadow stay put.' : ''}${p.dry ? ' Your skin looks dry: moisturize first, and use creamy or satin shadows.' : ''}`
      : p.skinError === 'error_large_face_angle'
        ? 'Could not read this one: the face is turned a little. Your colors still come from your skin tone.'
        : 'Could not read this one. Try a photo with more even light.',
  });
  cards.push({
    title: 'Skin tone',
    text: `${p.depth[0].toUpperCase() + p.depth.slice(1)} skin. Undertone: ${UNDERTONE_TEXT[p.undertone]}`,
    swatch: p.skinHex,
  });
  const sg = shadeGuide(p.undertone, p.depth);
  cards.push({ title: 'Best shades for you', text: `Try ${sg.use}. Skip ${sg.avoid}.${p.depth === 'deep' ? ' Pick rich, highly pigmented shadows so they show.' : ''}` });
  const eyeBits = [EYELID_TEXT[p.eyelid], SHAPE_TEXT[p.eyeShape], ANGLE_TEXT[p.eyeAngle]].filter(Boolean);
  cards.push({
    title: 'Your eyes',
    text: eyeBits.join(' ') || 'Most eye looks will work for you.',
    swatch: p.eyeColor,
  });
  cards.push({ title: 'Before makeup', text: prepTip(p) });
  if (p.darkCircles) {
    cards.push({ title: 'Under the eyes', text: 'Some darkness under the eyes. A little concealer before shadow makes the look brighter.' });
  }
  if (p.faceShape && p.faceShape !== 'Unknown') {
    const FACE = { InvTriangle: 'Heart', Oblong: 'Long', Long: 'Long' };
    cards.push({ title: 'Face shape', text: `${FACE[p.faceShape] || p.faceShape}.` });
  }
  return cards;
}

// Suggest a look for this profile.
export function recommendedLook(p) {
  if (p.eyeAngle === 'Downturned' || p.eyeShape === 'Round') return 'winged';
  if (p.eyelid === 'Hooded-lid' || p.eyelid === 'Deep-Set') return 'smoky';
  return 'natural';
}
