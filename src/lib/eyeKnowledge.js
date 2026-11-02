// Eye makeup knowledge table: beginner level and who each product suits. Sources: docs/knowledge.md §9-11.
// level: 1 easy, 2 some practice, 3 hard.
// suits[trait] = [rating, why]; rating: 'good' | 'ok' | 'avoid'. Traits: oily, dry, sensitive, hooded, mature.
const g = (why) => ['good', why];
const ok = (why) => ['ok', why];
const no = (why) => ['avoid', why];

export const FIT = {
  // ---- Shadows ----
  palette: { level: 1, suits: {
    oily: g('Powder grips oily lids best, over a primer.'),
    dry: ok('Thin layers of satin or matte; skip chalky mattes.'),
    hooded: g('Mattes just above the crease show when your eyes are open.'),
    mature: ok('Pick soft-matte or satin; heavy glitter shows texture.'),
  } },
  single_shadow: { level: 1, suits: {
    oily: g('Powder over a primer lasts on oily lids.'),
    dry: ok('Satin finishes look smoother on dry lids.'),
  } },
  cream_shadow: { level: 1, suits: {
    oily: no('Creams crease on oily lids unless set with powder.'),
    dry: g('Glides on and does not cling to dry patches.'),
    hooded: ok('Use a long-wear cream so it does not transfer to the fold.'),
    mature: g('Smooth, does not settle into fine lines. Pick satin, not glossy.'),
    sensitive: g('Little powder fallout near the eyes.'),
  } },
  shadow_stick: { level: 1, suits: {
    oily: ok('Long-wear sticks set; still use a primer.'),
    dry: g('Creamy and easy: swipe, then blend with a finger.'),
    hooded: g('Fast and transfer-resistant once set.'),
    mature: g('Easy, buildable satin finish.'),
  } },
  glitter_shadow: { level: 2, suits: {
    dry: no('Glitter shows dry texture.'),
    sensitive: no('Loose glitter can get in the eye and scratch it.'),
    mature: no('Chunky glitter draws attention to fine lines.'),
    hooded: ok('Keep it to the center of the lid.'),
  } },
  baked_shadow: { level: 1, suits: {
    mature: g('Cream-powder hybrid: smooth, little fallout.'),
    dry: g('Less chalky than pressed powder.'),
    oily: ok('Use a primer under it.'),
  } },
  // ---- Liners ----
  liner_pencil: { level: 1, suits: {
    oily: ok('Pick a waterproof or gel pencil; soft ones smudge.'),
    hooded: ok('Smudge it slightly so transfer looks intentional.'),
    mature: g('Soft line, easy to keep on the lash line.'),
    sensitive: ok('Keep it off the inner waterline.'),
  } },
  liner_kohl: { level: 1, suits: {
    oily: no('Very soft: migrates on oily lids.'),
    hooded: no('Transfers onto the fold.'),
    dry: g('Creamy and gentle.'),
    sensitive: ok('Only kohl made for the waterline goes there.'),
  } },
  liner_gel: { level: 2, suits: {
    oily: g('Sets and resists smudging; usually waterproof.'),
    hooded: g('Transfer-resistant once set.'),
    mature: ok('Draw short dashes, then connect.'),
  } },
  liner_liquid: { level: 3, suits: {
    oily: g('Lasts well once dry.'),
    hooded: g('Transfer-resistant once set; draw the wing with eyes open.'),
    dry: ok('Can flake on very dry lids.'),
    mature: ok('Can skip over crepey lids; a pencil base helps.'),
  } },
  liner_felt: { level: 2, suits: {
    oily: g('Long-wearing like liquid.'),
    hooded: g('Firm tip, steady wing. Draw it with eyes open.'),
    mature: ok('Firm tip does not move well over textured lids.'),
  } },
  // ---- Lashes ----
  mascara: { level: 1, suits: {
    oily: ok('Wax mascara can smudge under oily lids; try tubing or waterproof.'),
    hooded: ok('Curl first and keep it off the lid fold.'),
    sensitive: ok('Replace every 3 months; stop if it stings.'),
  } },
  mascara_tubing: { level: 1, suits: {
    oily: g('Polymer tubes resist oil: no panda eyes.'),
    hooded: g('Does not smudge onto the lid.'),
    sensitive: g('Comes off with warm water, no rubbing.'),
    dry: ok('Can feel a bit drying on lashes.'),
  } },
  lash_curler: { level: 1, suits: {
    hooded: g('Lifts lashes out from under the hood.'),
    sensitive: ok('Curl gently at the roots; never pull.'),
  } },
  // ---- Prep and set ----
  primer: { level: 1, suits: {
    oily: g('Stops creasing; a must for oily lids.'),
    hooded: g('Stops shadow transferring to the fold.'),
    mature: g('Smooths texture so shadow does not settle in lines.'),
    dry: ok('Pick a hydrating one.'),
  } },
  concealer: { level: 1, suits: {
    oily: ok('Set it with powder before shadow.'),
    dry: ok('Moisturize first so it does not settle.'),
    mature: ok('A thin layer; heavy coverage shows lines.'),
  } },
  setting_spray: { level: 1, suits: {
    oily: ok('Helps, but primer and powder matter more on oily lids.'),
    sensitive: ok('Pick fragrance- and alcohol-free; spray with eyes closed.'),
  } },
  // ---- Tools ----
  flat_brush: { level: 1, suits: {} },
  blend_brush: { level: 1, suits: { hooded: g('Blend just above the crease, with eyes open.') } },
  pencil_brush: { level: 2, suits: { hooded: g('Places color in the outer corner precisely.') } },
  smudge_brush: { level: 1, suits: { oily: g('Smudged liner hides any small transfer.') } },
  angled_brush: { level: 2, suits: { mature: g('Pressed shadow makes a soft line over textured lids.') } },
  swab: { level: 1, suits: {} },
};

export const LEVEL_TEXT = { 1: 'Easy for beginners', 2: 'Takes a little practice', 3: 'Hard at first' };

// Shade guidance by undertone and skin depth (from the YouCam tone scan).
export const SHADE_GUIDE = {
  warm: {
    light: { use: 'peach, champagne, soft gold, warm taupe', avoid: 'very cool grey' },
    medium: { use: 'bronze, copper, golden brown, olive', avoid: 'icy silver, pastel blue' },
    deep: { use: 'bronze, copper, antique gold, terracotta, warm burgundy', avoid: 'pale chalky mattes, ashy grey' },
  },
  cool: {
    light: { use: 'taupe, soft pink, lilac, cool brown', avoid: 'orange and bright copper' },
    medium: { use: 'plum, mauve, grey-brown, silver', avoid: 'yellow-gold' },
    deep: { use: 'deep plum, aubergine, sapphire, warm charcoal', avoid: 'icy silver, pale pastels' },
  },
  neutral: {
    light: { use: 'soft brown, champagne, rose gold', avoid: 'very dark black-brown all over the lid' },
    medium: { use: 'medium brown, bronze, mauve', avoid: 'very pale mattes' },
    deep: { use: 'rich chocolate, bronze, plum, charcoal', avoid: 'pale, ashy or low-pigment shades' },
  },
};

export function shadeGuide(undertone, depth) {
  return (SHADE_GUIDE[undertone] || SHADE_GUIDE.neutral)[depth] || SHADE_GUIDE.neutral.medium;
}

// Brows: mapping rules, tools and color rules (the step list and the shade table live in
// shared/brows.js so the server try-on and the app use the same numbers).
export { BROW_STAGES, BROW_SHADES, BROW_HAIR_LABEL, browShade } from '../../shared/brows.js';
export const BROW_GUIDE = {
  map: {
    start: 'Straight up from the side of the nose (nose wing), past the inner eye corner.',
    arch: 'On the line from the nose wing through the outer edge of the iris, looking straight ahead.',
    end: 'On the line from the nose wing past the outer eye corner. The tail ends no lower than the start.',
  },
  tools: {
    spoolie: 'Brushes hairs up before and after filling, and softens color. Level 1.',
    pencil: 'Fine, sharp pencil for hair-like strokes and the outline. Level 1-2.',
    angled_brush: 'Stiff angled brush with brow powder: soft, natural fill. Level 2.',
    powder: 'Brow powder: the softest fill, good for beginners and for the front of the brow. Level 1.',
    pomade: 'Brow pomade: more hold and definition, easy to overdo. Level 3.',
    gel: 'Clear or tinted brow gel: sets the hairs in place; tinted gel adds a little color. Level 1.',
  },
  color: [
    'Pick one shade lighter than your hair (dark hair) or up to two shades darker (very fair hair), never black on fair skin.',
    'Grey or white brows: soft grey-taupe, not dark brown.',
    'Keep the front lightest; put most color from the arch to the tail.',
  ],
};

// Profile traits as fit keys. hooded comes from the YouCam eyelid result.
export function traitsOf(p) {
  const t = [];
  if (p?.oily) t.push('oily');
  if (p?.dry) t.push('dry');
  if (p?.sensitive) t.push('sensitive');
  if (/hooded/i.test(p?.eyelid || '')) t.push('hooded');
  if (p?.mature) t.push('mature');
  return t;
}

// [{ trait, rating, why }] for this profile, "avoid" first.
export function productFit(productId, profile) {
  const f = FIT[productId];
  if (!f) return [];
  const order = { avoid: 0, ok: 1, good: 2 };
  return traitsOf(profile)
    .filter((t) => f.suits[t])
    .map((t) => ({ trait: t, rating: f.suits[t][0], why: f.suits[t][1] }))
    .sort((a, b) => order[a.rating] - order[b.rating]);
}
