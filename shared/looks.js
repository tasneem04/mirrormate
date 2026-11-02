// The three eye looks. Shared by the server (to build YouCam try-on requests)
// and the browser (to show the steps of each look).
//
// Pattern names come from the YouCam pattern catalogs:
//   https://plugins-media.makeupar.com/wcm-saas/patterns/eyeshadow.json
//   https://plugins-media.makeupar.com/wcm-saas/patterns/eyeliner.json
//   https://plugins-media.makeupar.com/wcm-saas/patterns/eyelashes.json
// The number of palettes must equal the pattern's colorNum.

// Shades per undertone. Warm skin -> golden/bronze, cool -> taupe/plum, neutral -> soft brown.
const SHADES = {
  warm:    { light: '#E8C39E', mid: '#B07A4F', deep: '#6B3E26', liner: '#2B1B12' },
  cool:    { light: '#E6CFCF', mid: '#9C7A82', deep: '#4E3A4A', liner: '#1A1A1F' },
  neutral: { light: '#E9CBB2', mid: '#A27C64', deep: '#5A4034', liner: '#1E1A18' },
};

// Deep skin: pale shades vanish or look ashy, so use richer, darker colors (bronze, deep brown,
// plum, charcoal) and a shimmer lid that catches light. Sources in docs/knowledge.md ("Shades").
const DEEP_SHADES = {
  warm:    { light: '#B9763A', mid: '#6E3418', deep: '#2E1409', liner: '#0E0806', shimmer: '#E7B260' },
  cool:    { light: '#8C5A7A', mid: '#5A2D4E', deep: '#241A24', liner: '#0B0A0D', shimmer: '#D9A6C8' },
  neutral: { light: '#A8703F', mid: '#5E3426', deep: '#26191A', liner: '#0C0909', shimmer: '#E2B06A' },
};
// Intensity boost by skin depth (YouCam colorIntensity is 0..100).
const BOOST = { light: 0, medium: 10, deep: 30 };

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
let boost = 0; // set per request in buildEffects
const matte = (color, colorIntensity) => ({ color, texture: 'matte', colorIntensity: clamp(colorIntensity + boost) });
// Lid shade: shimmer on deep skin so it shows; matte otherwise.
const lid = (s, colorIntensity) => s.shimmer
  ? { color: s.light, texture: 'shimmer', shimmerColor: s.shimmer, shimmerIntensity: 60, colorIntensity: clamp(colorIntensity + boost) }
  : matte(s.light, colorIntensity);

export const LOOKS = [
  {
    id: 'natural',
    name: 'Soft natural',
    blurb: 'Light lid wash, a deeper outer corner and a thin line. Great first look.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil'],
    steps: ['prep', 'crease', 'base', 'liner'],
    effects: (s) => [
      { category: 'eye_shadow', pattern: { name: '2colors1' }, palettes: [lid(s, 45), matte(s.mid, 45)] },
      { category: 'eye_liner', pattern: { name: 'Upper6' }, palettes: [matte(s.liner, 50)] },
    ],
  },
  {
    id: 'smoky',
    name: 'Soft smoky',
    blurb: 'Three shades blended from light to deep, smudged liner. Practice blending.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil', 'swab'],
    steps: ['prep', 'crease', 'base', 'outer', 'liner'],
    effects: (s) => [
      { category: 'eye_shadow', pattern: { name: '3colors1' }, palettes: [lid(s, 55), matte(s.mid, 60), matte(s.deep, 65)] },
      { category: 'eye_liner', pattern: { name: 'Smoke11' }, palettes: [matte(s.deep, 55)] },
    ],
  },
  {
    id: 'winged',
    name: 'Winged liner',
    blurb: 'Neutral lid and a clean wing that points to the end of your brow.',
    tools: ['flat_brush', 'liner_liquid'],
    steps: ['prep', 'base', 'liner', 'wing'],
    effects: (s) => [
      { category: 'eye_shadow', pattern: { name: '1color1' }, palettes: [lid(s, 40)] },
      { category: 'eye_liner', pattern: { name: 'OpenWings1' }, palettes: [matte(s.liner, 80)] },
    ],
  },
];

export const LOOK_IDS = LOOKS.map((l) => l.id);
export const UNDERTONES = Object.keys(SHADES);
export const DEPTHS = Object.keys(BOOST);

// Build the YouCam makeup try-on "effects" list for a look and undertone.
// depth: 'light' | 'medium' | 'deep' (from the skin tone scan). Deep skin gets richer shades.
export function buildEffects(lookId, undertone, depth = 'medium') {
  const look = LOOKS.find((l) => l.id === lookId);
  if (!look) throw new Error(`Unknown look: ${lookId}`);
  boost = BOOST[depth] ?? 0;
  try {
    return look.effects(getShades(undertone, depth));
  } finally {
    boost = 0;
  }
}

export function getShades(undertone, depth) {
  const table = depth === 'deep' ? DEEP_SHADES : SHADES;
  return table[undertone] || table.neutral;
}
