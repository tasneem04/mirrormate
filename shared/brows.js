// Eyebrows: a step-by-step section of its own (map -> fill -> blend -> gel).
// Shared by the browser, the API (try-on validation) and the spike script.
import { hexToLab } from './color.js';

// Steps, in order. 'map' adds no product: it is the guide-line step (start, arch, end drawn
// from face landmarks in the live view), so its picture is the bare face.
export const BROW_STAGES = [
  {
    id: 'map', title: 'Map the shape', tool: 'Pencil (or a brush handle) and a mirror',
    tip: 'Find three points: the start above the inner eye corner, the arch above the outer edge of your iris, and the end on the line from your nose wing past the outer eye corner.',
  },
  {
    id: 'fill', title: 'Outline and fill with light strokes', tool: 'Sharp pencil or angled brush with brow powder',
    tip: 'Draw short, hair-like flicks in the direction the hairs grow. Keep the front soft and put most color from the arch to the tail. Light pressure: you can always add more.',
  },
  {
    id: 'blend', title: 'Blend with a spoolie', tool: 'Spoolie (clean mascara-type brush)',
    tip: 'Brush up through the front and along the body to soften any hard lines, so it looks like hair, not a drawn line.',
  },
  {
    id: 'gel', title: 'Set with gel', tool: 'Clear or tinted brow gel',
    tip: 'Comb the hairs up at the front, then along toward the tail. It holds the shape all day and adds a little color.',
  },
];
export const BROW_STAGE_IDS = BROW_STAGES.map((s) => s.id);
export const BROWS_ID = 'brows';

// Brow shade by hair color and skin depth. Rule of thumb: dark hair -> one shade lighter
// than the hair (never jet black, it looks harsh); fair hair -> one or two shades darker.
export const BROW_SHADES = {
  black:     { light: { hex: '#3a2e2a', name: 'soft black-brown' }, medium: { hex: '#2f2522', name: 'espresso' }, deep: { hex: '#261d1a', name: 'soft black' } },
  darkBrown: { light: { hex: '#4a3a31', name: 'dark brown' }, medium: { hex: '#3d2e27', name: 'dark brown' }, deep: { hex: '#2e221e', name: 'espresso' } },
  brown:     { light: { hex: '#6b5344', name: 'medium brown' }, medium: { hex: '#5a4436', name: 'medium brown' }, deep: { hex: '#3d2e27', name: 'dark brown' } },
  auburn:    { light: { hex: '#7a5040', name: 'auburn' }, medium: { hex: '#6a4535', name: 'warm auburn' }, deep: { hex: '#4f3328', name: 'deep auburn' } },
  blonde:    { light: { hex: '#9a8270', name: 'taupe' }, medium: { hex: '#85705f', name: 'light ash brown' }, deep: { hex: '#6b5648', name: 'soft brown' } },
  grey:      { light: { hex: '#8a8580', name: 'soft grey' }, medium: { hex: '#757070', name: 'grey-taupe' }, deep: { hex: '#5e5a58', name: 'charcoal grey' } },
};
export const BROW_HAIR_LABEL = { black: 'black', darkBrown: 'dark brown', brown: 'brown', auburn: 'red / auburn', blonde: 'blonde', grey: 'grey / white' };

// Hair class from the measured brow color. The brow patch mixes hair and skin, so on deep
// skin it reads too light; there, anything but a clearly light brow counts as dark brown.
export function browHairClass(browHex, depth = 'medium') {
  if (!browHex) return depth === 'light' ? 'brown' : 'darkBrown';
  const [L, a, b] = hexToLab(browHex);
  const chroma = Math.hypot(a, b);
  if (depth === 'deep') return L > 60 ? 'brown' : 'darkBrown';
  if (chroma < 6 && L > 55) return 'grey';
  if (L < 20) return 'black';
  if (L < 40) return 'darkBrown';
  if (a > 14 && a > b * 0.8) return 'auburn';
  if (L < 55) return 'brown';
  return 'blonde';
}

export function browShade(browHex, depth = 'medium') {
  const hair = browHairClass(browHex, depth);
  const row = BROW_SHADES[hair];
  return { hair, ...(row[depth] || row.medium) };
}

// YouCam makeup-vto eyebrow effect per step. Color builds a little each step; the spoolie
// step softens the edges (lower definition), gel sets them crisp. Pattern 'Original12'
// follows the person's own brow shape with fine strokes, so it stays natural.
const BROW_RENDER = {
  fill: { colorIntensity: 22, definition: 35 },
  blend: { colorIntensity: 30, definition: 15 },
  gel: { colorIntensity: 38, definition: 45 },
};
const BROW_BOOST = { light: 0, medium: 4, deep: 8 }; // color shows less on deeper skin
export function buildBrowEffects(stage, browHex, depth = 'medium') {
  if (stage === 'bare' || stage === 'map') return [{ category: 'eye_shadow', pattern: { name: '1color1' }, palettes: [{ color: '#A8703F', texture: 'matte', colorIntensity: 0 }] }];
  const r = BROW_RENDER[stage || 'gel'];
  if (!r) throw new Error(`Unknown brow stage: ${stage}`);
  const { hex } = browShade(browHex, depth);
  return [{
    category: 'eyebrows',
    pattern: { type: 'shape', name: 'Original12', curvature: 0, thickness: 0, definition: r.definition },
    palettes: [{ color: hex, colorIntensity: Math.min(100, r.colorIntensity + (BROW_BOOST[depth] ?? 0)), texture: 'matte' }],
  }];
}
