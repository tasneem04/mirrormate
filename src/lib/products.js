// Generic eye products and tools (no brands), and simple rules for "does this suit you?".
import { hexToLab, hueAngle, deltaE } from '../../shared/color.js';

// prompt = the text the image model compares the camera frame against.
// shade = true if it makes sense to sample a color from it.
export const PRODUCTS = [
  { id: 'palette', label: 'Eyeshadow palette', prompt: 'a photo of an eyeshadow palette with many colors', kind: 'shadow', shade: true },
  { id: 'single_shadow', label: 'Single eyeshadow', prompt: 'a photo of a single round eyeshadow pan', kind: 'shadow', shade: true },
  { id: 'liner_pencil', label: 'Eyeliner pencil', prompt: 'a photo of an eyeliner pencil', kind: 'liner', shade: true },
  { id: 'liner_liquid', label: 'Liquid liner pen', prompt: 'a photo of a liquid eyeliner pen', kind: 'liner', shade: true },
  { id: 'liner_gel', label: 'Gel liner pot', prompt: 'a photo of a small jar of gel eyeliner', kind: 'liner', shade: true },
  { id: 'mascara', label: 'Mascara', prompt: 'a photo of a mascara tube', kind: 'lashes', shade: false },
  { id: 'primer', label: 'Eye primer', prompt: 'a photo of a small squeeze tube of eye primer', kind: 'prep', shade: false },
  { id: 'concealer', label: 'Concealer', prompt: 'a photo of a concealer wand', kind: 'prep', shade: true },
  { id: 'flat_brush', label: 'Flat shadow brush', prompt: 'a photo of a flat makeup brush', kind: 'tool', shade: false },
  { id: 'blend_brush', label: 'Fluffy blending brush', prompt: 'a photo of a fluffy round blending makeup brush', kind: 'tool', shade: false },
  { id: 'angled_brush', label: 'Thin angled brush', prompt: 'a photo of a thin angled eyeliner brush', kind: 'tool', shade: false },
  { id: 'swab', label: 'Cotton swabs', prompt: 'a photo of cotton swabs', kind: 'tool', shade: false },
];
// Extra labels that catch "not an eye product" so the model doesn't force a wrong guess.
// Tested on real photos: without the lipstick label, lipsticks were guessed as primer or brushes.
export const NOT_PRODUCT = [
  { prompt: 'a photo of a face', say: "I see a face, not a product. Hold the item inside the box." },
  { prompt: 'a photo of a hand', say: 'I mostly see your hand. Hold the item so it fills the box.' },
  { prompt: 'a photo of a room', say: "I can't spot a product. Hold it closer, inside the box." },
  { prompt: 'a photo of a lipstick', say: 'That looks like a lipstick. This coach is for eye products only.' },
  { prompt: 'a photo of a bottle of nail polish', say: 'That looks like nail polish, not an eye product.' },
  { prompt: 'a photo of a closed black makeup case', say: 'Open it so the colors show, then scan again.' },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);

// Free swaps when a tool is missing.
export const TOOL_SWAPS = {
  flat_brush: 'No flat brush? Pat shadow on with your ring finger.',
  blend_brush: 'No blending brush? Use a clean fingertip with very light circles.',
  liner_pencil: 'No pencil? Press a dark shadow along the lashes with a thin angled brush or a damp cotton swab.',
  liner_liquid: 'No liquid liner? Use gel liner with a thin angled brush, or a sharp pencil.',
  swab: 'No cotton swabs? A clean fingertip can smudge liner too.',
};

// Tools the look needs that the user doesn't have. Gel liner + angled brush counts as liquid liner.
export function missingTools(look, ownedIds) {
  const owned = new Set(ownedIds);
  if (owned.has('liner_gel') && owned.has('angled_brush')) owned.add('liner_liquid');
  if (owned.has('liner_liquid') || owned.has('liner_gel')) owned.add('liner_pencil');
  return look.tools.filter((t) => !owned.has(t));
}

// Does a shade suit this person? Returns { level: 'great'|'ok'|'careful', text }.
// Rules of thumb only:
//   - very close to skin color -> fine as a base, won't show as color
//   - warm undertone loves golden/orange-brown hues; cool loves pink/plum/ash hues
//   - liner should be clearly darker than skin
export function shadeVerdict(product, shadeHex, profile) {
  if (!shadeHex) return null;
  const [L, a, b] = hexToLab(shadeHex);
  const chroma = Math.hypot(a, b);
  const hue = (hueAngle([L, a, b]) + 360) % 360;
  const skinHex = profile?.skinHex;
  const skinL = skinHex ? hexToLab(skinHex)[0] : 60;
  const tone = profile?.undertone || 'neutral';

  if (product.kind === 'liner') {
    if (L > skinL - 25) return { level: 'careful', text: 'This liner is close to your skin tone, so it will barely show. A darker shade works better for lining.' };
    return { level: 'great', text: L < 25 ? 'Deep and clear: good for a defined line.' : 'Soft dark shade: good for a gentle line.' };
  }
  if (product.id === 'concealer') {
    if (skinHex && deltaE(shadeHex, skinHex) < 12) return { level: 'great', text: 'Close match to your skin. Good for under the eyes and as a lid base.' };
    return { level: 'ok', text: 'Not an exact match to your skin. Use a thin layer and blend the edges.' };
  }

  // Eyeshadow
  if (skinHex && deltaE(shadeHex, skinHex) < 10) return { level: 'ok', text: 'Very close to your skin. Great as a base shade, but it won\'t show as color.' };
  // Guides: the crease "transition" shade is a matte one or two shades darker than your skin.
  if (skinHex && skinL - L >= 5 && skinL - L <= 20 && deltaE(shadeHex, skinHex) < 25 && chroma < 35) {
    return { level: 'great', text: 'A little darker than your skin: a perfect crease (transition) shade.' };
  }
  if (skinL - L < -12 && profile?.depth === 'deep') return { level: 'careful', text: 'Much lighter than your skin. Use it as a highlight only, or it can look chalky.' };

  // Guides: warm undertones suit golds, coppers, oranges and browns; cool undertones suit
  // blues, greens, purples, silvers and greys; neutral undertones can wear both.
  const warmHue = hue >= 25 && hue <= 85; // golden, orange, warm brown
  const coolHue = hue > 150 || hue < 15 || (chroma < 10 && L < 75); // green, blue, purple, pink-plum, ash/grey
  if (tone === 'warm') {
    if (warmHue) return { level: 'great', text: 'Warm shade on warm skin: a great match.' };
    if (coolHue) return { level: 'careful', text: 'Cool or ashy shades can look a bit dull on warm skin. Mix with a warm brown.' };
  }
  if (tone === 'cool') {
    if (coolHue) return { level: 'great', text: 'Cool shade on cool skin: a great match.' };
    if (warmHue && chroma > 30) return { level: 'careful', text: 'Strong orange tones can fight with cool skin. Use a light hand.' };
  }
  return { level: 'ok', text: 'This shade works for you.' };
}

// Average color around a point of a canvas (a small square, skipping very dark/bright pixels).
export function sampleColor(canvas, x, y, radius = 6) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const x0 = Math.max(0, Math.round(x - radius));
  const y0 = Math.max(0, Math.round(y - radius));
  const size = radius * 2;
  const d = ctx.getImageData(x0, y0, size, size).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < 8 || lum > 250) continue; // glare or deep shadow
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (!n) return null;
  return '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------- Product knowledge (see docs/knowledge.md for sources) ----------
// What each product is for, and how it behaves on each skin type. No brands.
//   good: who it suits best. tips: { oily, dry, sensitive, any } short coach-style lines.
export const PRODUCT_KNOWLEDGE = {
  palette: {
    what: 'Powder shadows. Mattes for crease and depth, shimmers for the lid.',
    tips: {
      oily: 'Powder suits oily lids. Use a primer under it so it does not crease.',
      dry: 'Powder can cling to dry patches. Moisturize first, use satin or matte, thin layers.',
      sensitive: 'Tap off extra powder to cut fallout near the eyes.',
      any: 'Mattes go in the crease, shimmer on the center of the lid.',
    },
  },
  single_shadow: {
    what: 'One powder shade. Good as a crease or lid color.',
    tips: {
      oily: 'Powder holds best on oily lids over a primer.',
      dry: 'Moisturize first. Satin finishes look smoother on dry lids.',
      any: 'Pat it on for color, sweep it for a soft wash.',
    },
  },
  liner_pencil: {
    what: 'The easiest liner. Soft, smudgeable, good for beginners.',
    tips: {
      oily: 'Kohl pencils smudge on oily lids. A waterproof or gel pencil lasts longer.',
      sensitive: 'Keep it on the lash line, not the inner waterline, if your eyes water.',
      any: 'Warm the tip on your hand for a smoother line. Smudge with a swab for a smoky look.',
    },
  },
  liner_liquid: {
    what: 'Sharpest line, best for wings. Hardest to control.',
    tips: {
      oily: 'Liquid liner lasts well on oily lids once dry.',
      dry: 'Can flake on very dry lids. Moisturize, then let it dry before liner.',
      any: 'Dots first, then connect. Keep your eye open while it dries.',
    },
  },
  liner_gel: {
    what: 'Rich, long-wearing liner. Easier than liquid with an angled brush.',
    tips: {
      oily: 'Gel is smudge-resistant: a good pick for oily lids.',
      any: 'Work fast: gel sets quickly. Close the lid tightly after each use.',
    },
  },
  mascara: {
    what: 'Lengthens and darkens lashes. Always the last eye step.',
    tips: {
      oily: 'Tubing or waterproof mascara smudges less under oily lids.',
      sensitive: 'Replace it every 3 months. Stop if your eyes sting.',
      any: 'Wiggle at the roots, then pull up. Wipe the wand first to avoid clumps.',
    },
  },
  primer: {
    what: 'Grips shadow and stops creasing. Most useful on oily or hooded lids.',
    tips: {
      oily: 'A must for oily lids. A thin layer, then wait 30 seconds.',
      dry: 'Pick a hydrating one. A thin layer is enough.',
      any: 'Use a rice-grain amount for both lids.',
    },
  },
  concealer: {
    what: 'Evens the lid and under the eyes. Can act as a shadow base.',
    tips: {
      oily: 'Set it with a little powder before shadow, or it will crease.',
      dry: 'Moisturize first so it does not settle into lines.',
      any: 'Tap, do not rub. A thin layer goes further.',
    },
  },
  flat_brush: { what: 'Packs color on the lid.', tips: { any: 'Pat, do not swipe, for the most color.' } },
  blend_brush: { what: 'Softens edges and places crease color.', tips: { any: 'Clean brush, light hand, small side-to-side moves.' } },
  angled_brush: { what: 'For gel liner, tightlining, or a thin line of dark shadow.', tips: { any: 'Press along the lashes in short dashes.' } },
  swab: { what: 'Fixes mistakes and smudges liner.', tips: { any: 'A swab with a dot of micellar water cleans up a wing.' } },
};

// Advice lines for a product and a skin profile: the matching skin-type tips first, then the general one.
export function productAdvice(productId, profile) {
  const k = PRODUCT_KNOWLEDGE[productId];
  if (!k) return [];
  const out = [];
  if (profile?.oily && k.tips.oily) out.push(k.tips.oily);
  if (profile?.dry && k.tips.dry) out.push(k.tips.dry);
  if (profile?.sensitive && k.tips.sensitive) out.push(k.tips.sensitive);
  if (k.tips.any) out.push(k.tips.any);
  return out;
}

// Map words from the label model (caption or text it read) to a product type.
// Order matters: specific words first. Returns { id } for an eye product, { not } for others, or null.
const TEXT_RULES = [
  [/mascara|lash/i, 'mascara'],
  [/gel\s*(eye)?liner/i, 'liner_gel'],
  [/liquid\s*(eye)?liner|eyeliner pen|felt.?tip/i, 'liner_liquid'],
  [/kohl|kajal|(eye)?liner pencil|eye pencil/i, 'liner_pencil'],
  [/primer/i, 'primer'],
  [/concealer/i, 'concealer'],
  [/palette|eye\s*shadows?|eyeshadow/i, 'palette'],
  [/cotton (swab|bud)|q-?tip/i, 'swab'],
  [/blend(ing)? brush|fluffy brush/i, 'blend_brush'],
  [/angled brush|liner brush/i, 'angled_brush'],
  [/(flat|shader) brush/i, 'flat_brush'],
  [/eyeliner|liner/i, 'liner_liquid'],
];
const NOT_EYE_RULES = [
  [/lipstick|lip balm|lip gloss|lip liner/i, 'That looks like a lip product. This coach is for eye products only.'],
  [/nail polish/i, 'That looks like nail polish, not an eye product.'],
  [/foundation|bb cream|blush|bronzer/i, 'That looks like a face product. This coach is for eye products only.'],
];
export function typeFromText(text) {
  if (!text) return null;
  for (const [re, id] of TEXT_RULES) if (re.test(text)) return { id };
  for (const [re, say] of NOT_EYE_RULES) if (re.test(text)) return { not: say };
  return null;
}

// Formula words often printed on the pack (read by the label model) and what they mean for this skin.
const FORMULA_RULES = [
  { re: /water\s*proof|smudge\s*proof|long\s*wear|24\s*h/i, tip: () => 'Waterproof or long-wear: stays put on oily lids. Remove it with an oil cleanser.' },
  { re: /cre+me|cream|balm|stick/i, tip: (p) => (p?.oily ? 'Cream formula: it can crease on oily lids. Use a primer and set it with powder.' : 'Cream formula: easy to blend with a finger, kind to dry lids.') },
  { re: /matte/i, tip: () => 'Matte: best for the crease and for depth. It also hides lid texture.' },
  { re: /shimmer|glitter|metallic|foil|sparkle/i, tip: (p) => (p?.dry ? 'Shimmer can show dry texture. Keep it to the center of the lid.' : 'Shimmer: pat it on the center of the lid with a finger or damp brush.') },
];
export function formulaNotes(text, profile) {
  if (!text) return [];
  return FORMULA_RULES.filter((r) => r.re.test(text)).map((r) => r.tip(profile));
}
