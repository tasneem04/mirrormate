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
  warm:    { light: '#D9A77A', mid: '#9A5E3A', deep: '#5A3020', smoke: '#2A1A14', liner: '#120B08' },
  cool:    { light: '#D2B0B0', mid: '#866470', deep: '#43303E', smoke: '#221A20', liner: '#0C0B0E' },
  neutral: { light: '#D8B094', mid: '#8E6650', deep: '#4E362C', smoke: '#241A17', liner: '#0E0B0A' },
};

// Deep skin: pale shades vanish or look ashy, so use richer colors (bronze, deep brown, plum)
// and a shimmer lid that catches light. Depth comes from blended shadow, not heavy liner.
// Sources in docs/knowledge.md section 10.
const DEEP_SHADES = {
  warm:    { light: '#B9763A', mid: '#6E3418', deep: '#3A1A10', smoke: '#1E120E', liner: '#0A0605', shimmer: '#E7B260' },
  cool:    { light: '#8C5A7A', mid: '#5A2D4E', deep: '#341C30', smoke: '#1C1220', liner: '#0A080A', shimmer: '#D9A6C8' },
  neutral: { light: '#A8703F', mid: '#6E3A28', deep: '#3A2420', smoke: '#2A1A16', liner: '#0A0808', shimmer: '#E2B06A' },
};
// Shadow intensity boost by skin depth (YouCam colorIntensity is 0..100). Deep skin needs a
// little more so the shadow reads on camera.
const BOOST = { light: 0, medium: 3, deep: 6 };

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
// Liner and lashes are never boosted: they are near-black already.
const line = (color, colorIntensity) => ({ color, texture: 'matte', colorIntensity });
const shadow = (name, palettes) => ({ category: 'eye_shadow', pattern: { name }, palettes });
const liner = (name, color, ci) => ({ category: 'eye_liner', pattern: { name }, palettes: [line(color, ci)] });
const lashes = (name, ci) => ({ category: 'eyelashes', pattern: { name }, palettes: [{ color: '#000000', colorIntensity: ci }] });
const lips = (color, ci) => ({ category: 'lip_color', shape: { name: 'original' }, palettes: [{ color, texture: 'satin', colorIntensity: ci }], style: { type: 'full' } });

// Patterns (catalogs above). Tested on the sample faces so each step is clearly visible at
// phone size but still blends like real makeup:
//   eye_shadow 1color1 = lid wash, 2colors6 = light inner lid + deeper outer lid/corner,
//   4colors1 = smoky outer V wrapped under the outer lower lashes.
//   eye_liner Smoke28 = thin line on the upper lashes, Smoke17 = smudged outer corner,
//   OpenWings17 = sharp, lifted wing.  eyelashes UpperDense1 / Natural3 = mascara.
//
// stages(s, lip): cumulative layers, one try-on image each. The last stage is the full look.
export const LOOKS = [
  {
    id: 'natural',
    name: 'Soft natural',
    blurb: 'Warm lid color, a soft deeper corner, a thin line and mascara. Great first look.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil'],
    steps: ['prep', 'base', 'crease', 'liner'],
    stages: (s, lip) => {
      const base = shadow('1color1', [lid(s, 60)]);
      const crease = shadow('2colors1', [lid(s, 60), matte(s.mid, 70)]);
      const ln = liner('Smoke28', s.liner, 65);
      const lash = lashes('Natural3', 70);
      return [
        { id: 'base', effects: [base] },
        { id: 'crease', effects: [crease] },
        { id: 'liner', effects: [crease, ln, lash] },
        { id: 'lips', effects: [crease, ln, lash, lip] },
      ];
    },
  },
  {
    id: 'smoky',
    name: 'Smoky eye',
    blurb: 'Brown lid, a dark smoky outer corner, smudged liner under the eye and mascara.',
    tools: ['flat_brush', 'blend_brush', 'liner_pencil', 'swab'],
    steps: ['prep', 'base', 'crease', 'outer', 'liner'],
    stages: (s, lip) => {
      const base = shadow('1color1', [lid(s, 75)]);
      const crease = shadow('2colors6', [lid(s, 75), matte(s.deep, 90)]);
      const smoke = shadow('4colors1', [lid(s, 75), matte(s.mid, 85), matte(s.smoke, 92), matte(s.deep, 85)]);
      const smudge = liner('Smoke17', s.liner, 80);
      const lash = lashes('UpperDense1', 85);
      return [
        { id: 'base', effects: [base] },
        { id: 'crease', effects: [crease] },
        { id: 'smoke', effects: [smoke] },
        { id: 'liner', effects: [smoke, smudge, lash] },
        { id: 'lips', effects: [smoke, smudge, lash, lip] },
      ];
    },
  },
  {
    id: 'winged',
    name: 'Winged liner',
    blurb: 'Soft brown lid and a sharp black wing that points to the end of your brow.',
    tools: ['flat_brush', 'liner_liquid'],
    steps: ['prep', 'base', 'liner', 'wing'],
    stages: (s, lip) => {
      const base = shadow('2colors1', [lid(s, 50), matte(s.mid, 55)]);
      const thin = liner('Smoke28', s.liner, 90);
      const wing = liner('OpenWings17', s.liner, 95);
      const lash = lashes('UpperDense1', 80);
      return [
        { id: 'base', effects: [base] },
        { id: 'liner', effects: [base, thin] },
        { id: 'wing', effects: [base, wing, lash] },
        { id: 'lips', effects: [base, wing, lash, lip] },
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
const STEP_STAGE = { base: 'base', crease: 'crease', outer: 'smoke', liner: 'liner', wing: 'wing' };
export function stageForStep(lookId, step) {
  const ids = stageIds(lookId);
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
