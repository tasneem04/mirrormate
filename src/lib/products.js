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
// Extra labels that catch "not a product" so the model doesn't force a wrong guess.
export const NOT_PRODUCT = ['a photo of a face', 'a photo of a hand', 'a photo of a room'];

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
  if (skinL - L < -12 && profile?.depth === 'deep') return { level: 'careful', text: 'Much lighter than your skin. Use it as a highlight only, or it can look chalky.' };

  const warmHue = hue >= 25 && hue <= 85; // golden, orange, warm brown
  const coolHue = hue > 290 || hue < 15 || (chroma < 10 && L < 75); // pink, plum, mauve, ash/grey
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
