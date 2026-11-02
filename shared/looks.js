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

// Deep skin: pale shades vanish or look ashy, so use richer colors (bronze, deep brown, plum)
// and a shimmer lid that catches light. Depth comes from blended shadow, not heavy liner.
// Sources in docs/knowledge.md section 10.
const DEEP_SHADES = {
  warm:    { light: '#B9763A', mid: '#6E3418', deep: '#3A1A10', liner: '#1A0E09', shimmer: '#E7B260' },
  cool:    { light: '#8C5A7A', mid: '#5A2D4E', deep: '#341C30', liner: '#150E14', shimmer: '#D9A6C8' },
  neutral: { light: '#A8703F', mid: '#5A2E36', deep: '#3A1F22', liner: '#170E0E', shimmer: '#E2B06A' },
};
// Shadow intensity boost by skin depth (YouCam colorIntensity is 0..100). Kept small so it
// looks like real makeup; the richer deep shades do most of the work.
const BOOST = { light: 0, medium: 5, deep: 10 };

// Lip colors (satin, natural intensity) per look, undertone and depth.
// natural = nude rose, smoky = berry / deep mauve, winged = red / brick.
const LIPS = {
  natural: { warm: ['#C98A7A', '#B06F5E', '#8A4B3E'], cool: ['#C9878F', '#A8656F', '#7E4450'], neutral: ['#C68580', '#A8695F', '#7F4843'] },
  smoky:   { warm: ['#9E4F5A', '#86404B', '#6A2C36'], cool: ['#9A4C6A', '#7E3656', '#5E2440'], neutral: ['#9B5060', '#7F3D4E', '#6E2A3A'] },
  winged:  { warm: ['#B8432F', '#9E3526', '#7C2A1F'], cool: ['#B0283E', '#962036', '#74182A'], neutral: ['#B23A35', '#962E2B', '#752320'] },
};
const LIP_INTENSITY = { natural: 45, smoky: 50, winged: 55 };
const DEPTH_INDEX = { light: 0, medium: 1, deep: 2 };

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
let boost = 0; // set per request in buildEffects
const matte = (color, colorIntensity) => ({ color, texture: 'matte', colorIntensity: clamp(colorIntensity + boost) });
// Lid shade: shimmer on deep skin so it shows; matte otherwise.
const lid = (s, colorIntensity) => s.shimmer
  ? { color: s.light, texture: 'shimmer', shimmerColor: s.shimmer, shimmerIntensity: 45, colorIntensity: clamp(colorIntensity + boost) }
  : matte(s.light, colorIntensity);
// Liner is never boosted: a soft, low-intensity line that hugs the lashes looks real.
const line = (color, colorIntensity) => ({ color, texture: 'matte', colorIntensity });
const shadow = (name, palettes) => ({ category: 'eye_shadow', pattern: { name }, palettes });
const liner = (name, color, ci) => ({ category: 'eye_liner', pattern: { name }, palettes: [line(color, ci)] });
const lips = (color, ci) => ({ category: 'lip_color', shape: { name: 'original' }, palettes: [{ color, texture: 'satin', colorIntensity: ci }], style: { type: 'full' } });

// Liner patterns (eyeliner.json): Smoke28 = soft thin line on the upper lashes,
// Smoke17 = smudged outer corner, OpenWings5 = small thin wing. No thickness field exists
// in makeup-vto, so thickness comes from the pattern.
//
// stages(s, lip): cumulative layers, one try-on image each. The last stage is the full look.
export const LOOKS = [
  {
    id: 'natural',
    name: 'Soft natural',
    blurb: 'Light lid wash, a deeper crease and a soft thin line. Great first look.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil'],
    steps: ['prep', 'crease', 'base', 'liner'],
    stages: (s, lip) => {
      const base = shadow('1color1', [lid(s, 45)]);
      const crease = shadow('2colors1', [lid(s, 45), matte(s.mid, 50)]);
      const ln = liner('Smoke28', s.liner, 35);
      return [
        { id: 'base', effects: [base] },
        { id: 'crease', effects: [crease] },
        { id: 'liner', effects: [crease, ln] },
        { id: 'lips', effects: [crease, ln, lip] },
      ];
    },
  },
  {
    id: 'smoky',
    name: 'Soft smoky',
    blurb: 'Three shades blended from light to deep, softly smudged liner. Practice blending.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil', 'swab'],
    steps: ['prep', 'crease', 'base', 'outer', 'liner'],
    stages: (s, lip) => {
      const base = shadow('1color1', [lid(s, 55)]);
      const crease = shadow('2colors1', [lid(s, 55), matte(s.mid, 60)]);
      const smoke = shadow('3colors1', [lid(s, 55), matte(s.mid, 65), matte(s.deep, 65)]);
      const thin = liner('Smoke28', s.liner, 35);
      const smudge = liner('Smoke17', s.deep, 30);
      return [
        { id: 'base', effects: [base] },
        { id: 'crease', effects: [crease] },
        { id: 'liner', effects: [crease, thin] },
        { id: 'smoke', effects: [smoke, smudge] },
        { id: 'lips', effects: [smoke, smudge, lip] },
      ];
    },
  },
  {
    id: 'winged',
    name: 'Winged liner',
    blurb: 'Neutral lid and a thin wing that points to the end of your brow.',
    tools: ['flat_brush', 'liner_liquid'],
    steps: ['prep', 'base', 'liner', 'wing'],
    stages: (s, lip) => {
      const base = shadow('1color1', [lid(s, 35)]);
      const crease = shadow('2colors1', [lid(s, 35), matte(s.mid, 30)]);
      const thin = liner('Smoke28', s.liner, 40);
      const wing = liner('OpenWings5', s.liner, 50);
      return [
        { id: 'base', effects: [base] },
        { id: 'crease', effects: [crease] },
        { id: 'liner', effects: [crease, thin] },
        { id: 'wing', effects: [crease, wing] },
        { id: 'lips', effects: [crease, wing, lip] },
      ];
    },
  },
];

export const LOOK_IDS = LOOKS.map((l) => l.id);
export const UNDERTONES = Object.keys(SHADES);
export const DEPTHS = Object.keys(BOOST);

// Stage ids of a look, in order (the last one is the full look).
export function stageIds(lookId) {
  return LOOKS.find((l) => l.id === lookId)?.stages(SHADES.neutral, null).map((st) => st.id) || [];
}

// Which step image to show as the goal for a coach step.
const STEP_STAGE = { base: 'base', crease: 'crease', outer: 'smoke', wing: 'wing' };
export function stageForStep(lookId, step) {
  const ids = stageIds(lookId);
  if (step === 'liner') return ids.includes('smoke') ? 'smoke' : 'liner';
  return ids.includes(STEP_STAGE[step]) ? STEP_STAGE[step] : null;
}

export function lipColor(lookId, undertone, depth) {
  const row = (LIPS[lookId] || LIPS.natural)[undertone] || LIPS.natural.neutral;
  return row[DEPTH_INDEX[depth] ?? 1];
}

// Build the YouCam makeup try-on "effects" list for a look and undertone.
// depth: 'light' | 'medium' | 'deep'. stage: a stage id; default = the full look (with lips).

export function buildEffects(lookId, undertone, depth = 'medium', stage = null) {
  const look = LOOKS.find((l) => l.id === lookId);
  if (!look) throw new Error(`Unknown look: ${lookId}`);
  // 'bare': a zero-strength layer. YouCam retouches the whole photo a little, so the live coach
  // compares goal images against this (not the raw selfie) to find where makeup goes.
  if (stage === 'bare') return [{ category: 'eye_shadow', pattern: { name: '1color1' }, palettes: [{ color: '#A8703F', texture: 'matte', colorIntensity: 0 }] }];
  boost = BOOST[depth] ?? 0;
  try {
    const lip = lips(lipColor(lookId, undertone, depth), LIP_INTENSITY[lookId]);
    const stages = look.stages(getShades(undertone, depth), lip);
    const st = stage ? stages.find((x) => x.id === stage) : stages[stages.length - 1];
    if (!st) throw new Error(`Unknown stage: ${stage}`);
    return st.effects;
  } finally {
    boost = 0;
  }
}

export function getShades(undertone, depth) {
  const table = depth === 'deep' ? DEEP_SHADES : SHADES;
  return table[undertone] || table.neutral;
}
