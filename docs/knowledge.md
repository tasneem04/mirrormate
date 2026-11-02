# MirrorMate knowledge base (eye makeup)

The coach's facts in one place. Tips follow the coach style: one action and one reason, at most 2 lines. Where each fact is used in the app is shown in *italics*. Step order, wing, brushes and undertone details are in [research.md](research.md).

## 1. Skin types and how to spot them
Wash with a gentle cleanser, pat dry, wait 30 minutes and add nothing. Then press blotting paper on the forehead, nose, cheeks and chin.

| Type | Signs | For eye makeup |
|---|---|---|
| Oily | Shine and oil on all areas, large pores | Lids crease shadow fast. Primer, powder shadow, set any cream. |
| Dry | Tight, flaky, no oil on the paper | Moisturize first. Cream or satin shadow in thin layers. Skip chunky glitter. |
| Combination | Oil only on the T-zone (forehead, nose, chin) | Primer on the lids. Light moisturizer all over. |
| Normal | Comfortable, little shine | Most formulas work. A primer still makes it last longer. |
| Sensitive | Redness, stinging, itching (on top of any type) | Fragrance-free products, patch-test, keep liner off the inner waterline. |

Skin type changes with season, hormones and age, so re-check now and then.
*App: the YouCam skin scan (skin_type, oiliness, moisture) → `buildProfile` gives `oily`, `dry` and `sensitive` → `prepTip` card, prep step text, product advice.*

## 2. Undertone (for picking shades)
- **Warm:** veins look greenish and gold jewellery suits you. Bronze, copper, gold and warm browns look good.
- **Cool:** veins look bluish and silver suits you. Taupe, plum, grey-brown and silver look good.
- **Neutral:** you can't tell, and both suit you. Most browns work.
- **Depth:** on deep skin, light matte shades can look ashy. Pick richer browns or shimmer.

*App: `shadeVerdict` checks each shade you scan against your undertone and depth.*

## 3. Skin prep before eye makeup (about 2 minutes)
1. Cleanse, or splash with water in the morning.
2. Moisturize: a light layer for oily skin, richer for dry skin. Wait 1 minute so the product doesn't slide.
3. Pat a thin layer of eye primer or concealer on the lids. Wait 30 seconds.
4. Oily lids: press on a little translucent powder or a skin-tone matte shadow.
5. Sensitive skin: patch-test a new product on the inner arm or behind the ear for a few days first.

*App: `STEP_INFO.prep` and `stepHow('prep', profile)`.*

## 4. Eye shapes and lid types

| Shape or lid | Spot it | Shadow | Liner |
|---|---|---|---|
| Hooded | Skin folds over the crease and hides the lid when the eyes are open | Put the transition shade **above** the fold, checking with eyes open. Keep the lid lighter. | Thin line, wing angled **up** toward the brow tail. Tightline to add depth. |
| Monolid (single lid) | No visible crease | A gradient: darkest at the lashes, fading lighter upward. Don't draw a fake crease. | Thicker, so it shows with eyes open. A lifted wing. |
| Deep-set | Eyes sit back under a strong brow bone | Light or shimmer on the lid. Dark only on the outer corner. | Thin liner. A heavy dark lid closes the eye. |
| Almond | Ends taper slightly up and the iris touches both lids | Follow your natural crease. Anything works. | Any style. |
| Downturned | Outer corners point down | Place and blend shadow up and out above the outer corner. | Wing **up**, not out. Stop the lower liner before the outer corner. Curl your lashes. |
| Upturned | Outer corners point up | Balance with a little shadow on the outer lower lash line. | A short wing. |

*App: the YouCam face features (eyelid, eyeShape, eyeAngle) feed `EYELID_TEXT`, `SHAPE_TEXT` and `ANGLE_TEXT`. `creaseHeight` sits higher for hooded lids. `stepHow` has special text for single lids, deep-set eyes and downturned or hooded wings.*

## 5. Beginner steps (the coach's order)
Prep → crease (transition) → lid (base) → outer corner → liner → wing → mascara.

| Common mistake | Coach tip |
|---|---|
| Hard edge on the crease | "Blend side to side with a clean brush until there is no line." |
| Too much color at once | "Tap off the brush. Build in thin layers." |
| Crease color too low on hooded lids | "Go just above the fold. Check with eyes open." |
| Shadow creases after an hour | "Primer first, then powder over cream." |
| Liner gap at the lashes | "Stay tight to the lashes, or tightline the upper waterline." |
| Wing too long or droopy | "Aim toward the brow tail. Short is fine." |
| Fallout under the eye | "Do eyes before concealer, or tap the fallout off at the end." |
| Uneven eyes | "Match the wing tip height, not the length." |
| Clumpy mascara | "Wipe the wand. Wiggle at the roots, then pull up." |

*App: the `coachRules.js` live tips and the `NEXT_TIME` tips.*

## 6. Essential brushes and free swaps

| Tool | Job | Free swap |
|---|---|---|
| Flat shader brush | Packs color on the lid | Fingertip (great for shimmer) |
| Fluffy blending brush | Crease and soft edges | Clean, dry makeup sponge corner |
| Angled liner brush | Gel liner, wing, setting pencil | Cotton swab with a sharp tip, or the pencil itself |
| Cotton swab | Clean-up | Tissue corner with micellar water |

*App: `TOOL_SWAPS` and `missingTools`.*

## 7. Product types by skin type

| Product | Oily | Dry | Sensitive |
|---|---|---|---|
| Powder shadow | Best choice | Satin or cream better | Matte formulas, fewer glitters |
| Cream shadow | Set it with powder | Best choice | Fragrance-free |
| Pencil liner | Pick a waterproof one and set it with shadow | Soft kohl glides on | Keep it off the waterline |
| Gel liner | Long-wear, a good choice | Fine | Fine |
| Liquid liner | Waterproof formula | Fine | Latex-free if reactive |
| Mascara | Waterproof or tubing | Fine | Remove gently with an oil cleanser |
| Primer | A must | A thin, hydrating one | Fragrance-free |
| Concealer as base | Set with powder | Hydrating, thin layer | — |

*App: `PRODUCT_KNOWLEDGE`, `productAdvice(id, profile)`, and `formulaNotes` for words on the label (waterproof, cream, matte, shimmer).*

## 8. Advanced tips
- **Cut crease:** prime and set the lid, then blend a matte brown above the crease. Look straight ahead with the eye open and use a small flat brush to press a thin layer of opaque concealer along the crease, keeping the edge sharp. Set it with powder by pressing, not sweeping. Put the lid color up to the line. Hooded lids: place the cut **above** the natural fold.
- **Smoky eye:** smudge dark pencil along the lash line, then blend it up with a medium shade and soften the top edge with a light shade. Keep the darkest color closest to the lashes. Do the eyes before the face base so you can clean up fallout.
- **Tightlining:** lift the upper lid gently. Press waterproof gel or pencil into the upper waterline, between the lashes. It makes lashes look thicker and works well on hooded lids. Skip it if your eyes are sensitive.
- **Lower lash line:** keep a heavy dark line off the lower lashes on small or downturned eyes. Use a soft smudged shade on the outer third instead.
- **Mature or crepey lids:** use matte or satin shades and thin layers. Hydrate first, and skip chunky glitter.

## 9. Product subtypes: what they do, beginner level, who they suit

Level: 1 easy, 2 some practice, 3 hard. The full table lives in `src/lib/eyeKnowledge.js` (FIT); the app shows warnings first ("Careful: ...") for the user's traits.

**Liners**
| Type | What it does | Level | Good for | Watch out |
|---|---|---|---|---|
| Pencil | Firm, forgiving soft line | 1 | beginners, mature lids | soft ones smudge on oily lids |
| Kohl / kajal | Very soft, made to smudge: smoky liner | 1 | dry lids, smoky looks | migrates on oily and hooded lids |
| Gel (pot or pencil) | Creamy, then sets; sharp or smudged; usually waterproof | 2 | oily and hooded lids | blend fast before it sets |
| Felt-tip pen | Liquid with a firm marker tip: steadiest wing | 2 | first wings, oily, hooded | stiff tip skips over textured/mature lids |
| Liquid (brush or dip) | Sharpest, longest line | 3 | oily, hooded (transfer-resistant once dry) | least forgiving; can flake on dry lids |

**Shadows**
| Type | What it does | Level | Good for | Watch out |
|---|---|---|---|---|
| Powder (palette/single) | Buildable, blends | 1 | oily lids (over primer), hooded | chalky mattes look dry on dry/mature lids |
| Cream (pot) | Fast even wash with a finger | 1 | dry, mature (satin, not glossy), sensitive | creases on oily lids unless set |
| Stick | Cream in a crayon: quickest one-shade look | 1 | dry, hooded, mature | still use primer on oily lids |
| Baked | Baked from a cream: silky, low fallout, works wet | 1 | mature, dry | primer on oily lids |
| Glitter | Sparkle topper for the lid center | 2 | special looks | sensitive eyes (particles), dry and mature lids |

**Lashes, prep and set**
- Regular mascara: waxes/oils coat lashes; builds volume, can smudge on oily or hooded lids.
- Tubing mascara: polymers wrap each lash in a tube; lengthens, does not smudge, removes with warm water (good for oily, hooded, sensitive). It does not build much volume and can feel drying.
- Lash curler: clamp at the roots ~5 s, then midway; before mascara only. Lifts lashes out from under a hood.
- Primer: must-have for oily and hooded lids; smooths mature lids.
- Setting spray: helps wear, damps a brush to stop glitter fallout. Primer and powder matter more on oily lids. Sensitive eyes: fragrance/alcohol-free, eyes closed.

**Brushes**
- Flat shader: pats color onto the lid. Blending (fluffy): softens edges in small circles. Pencil: precise color in the outer V, inner corner, lower lash line. Angled: pressed shadow or gel as a line (soft line on mature lids). Smudger: short dense brush that smokes out liner.

## 10. Shade guidance by undertone and depth

Shown on the results screen as "Best shades for you" (`SHADE_GUIDE`), and used by the try-on: deep skin gets richer shades and +30 intensity (`shared/looks.js`).

| Undertone | Light | Medium | Deep |
|---|---|---|---|
| Warm | peach, champagne, soft gold, warm taupe | bronze, copper, golden brown, olive | bronze, copper, antique gold, terracotta, warm burgundy |
| Cool | taupe, soft pink, lilac, cool brown | plum, mauve, grey-brown, silver | deep plum, aubergine, sapphire, warm charcoal |
| Neutral | soft brown, champagne, rose gold | medium brown, bronze, mauve | rich chocolate, bronze, plum, charcoal |

Avoid on deep skin: pale chalky mattes, ashy grey, icy silver, low-pigment shades (they turn grey or disappear). Swatch on the jaw in daylight.

## 11. Smart identify (optional, Gemini)

With `GEMINI_API_KEY` set, "Smart identify" sends one product photo to Gemini Flash (server side, cached by image hash) and gets back type, brand/name, finish, formula and good-for/bad-for traits. Its type overrides the on-device guess only at confidence >= 0.7. Without a key the button is hidden.

## Sources
- Cleveland Clinic, Understanding skin types: https://health.clevelandclinic.org/understanding-skin-types
- CeraVe, What skin type do I have: https://www.cerave.com/skin-smarts/skincare-tips-advice/what-skin-type-do-i-have
- Verywell Health, How to know your skin type: https://www.verywellhealth.com/how-to-know-your-skin-type-8747816
- Healthline, Skin type test: https://www.healthline.com/health/beauty-skin-care/skin-type-test
- Complete Family Dermatology, Skin types: https://www.completefamilydermatology.com/skin-types/
- American Academy of Dermatology, How to test skin care products: https://www.aad.org/public/everyday-care/skin-care-basics/care/test-skin-care-products
- Charlotte Tilbury, Eyeshadow for different eye shapes: https://www.charlottetilbury.com/us/secrets/eyeshadow-for-different-eye-shapes
- Folsom Skin, Hooded and monolid eye makeup: https://folsomskin.com/blog/hooded-monolid-eye-makeup
- RMS Beauty, Makeup for every eye shape: https://www.rmsbeauty.com/blogs/news/makeup-for-every-eye-shape
- TryOnMyLook, Eye shapes: https://tryonmylook.com/eye-shapes
- Merle Norman, Artistry for eye shapes: https://www.merlenorman.com/artistry-for-eye-shapes.html
- Byrdie, How to keep eyeshadow from creasing: https://www.byrdie.com/how-to-keep-eyeshadow-from-creasing-7483153
- The Authored, Cream vs powder eyeshadow: https://theauthored.com/makeup/eyes/cream-vs-powder-eyeshadow/
- The Authored, Makeup for mature eyes: https://theauthored.com/beauty-guides/features-and-skin-tone/makeup-for-mature-eyes/
- Glamour, Eyeshadow for mature skin: https://www.glamour.com/story/how-to-apply-eyeshadow-for-mature-skin
- Allure, Best eyeshadow for mature skin: https://www.allure.com/story/best-eye-shadow-for-mature-skin
- Ipsy, How to do a cut crease: https://www.ipsy.com/blog/how-to-do-a-cut-crease
- HowTo Beauty Edition, Cut crease concealer technique: https://howtobeautyedition.com/en/makeup/eyes/eye-looks/cut-crease-concealer-the-three-things-that-matter/
- Allure, Every type of eyeliner: https://www.allure.com/story/eyeliner-types-how-to-use-them
- Makeup Artist Pro, Types of eyeliner (level table): https://makeupartistpro.com/article/types-of-eyeliners
- Women's Health, Liquid vs kohl vs pencil: https://www.womenshealthmag.com/beauty/a19941647/eyeliner-types/
- Byrdie, Eyeliner for oily lids: https://www.byrdie.com/best-eyeliner-for-oily-lids
- Who What Wear, Liquid liner for oily and hooded lids: https://www.whowhatwear.com/best-eyeliners
- L'Oréal Paris, Tubing mascara: https://www.lorealparisusa.com/beauty-magazine/makeup/eye-makeup/how-to-use-tubing-mascara
- Byrdie, What is tubing mascara: https://www.byrdie.com/tubing-mascara-7209863
- Healthline, Tubing mascara: https://www.healthline.com/health/what-is-tubing-mascara
- Harper's Bazaar, Eyeshadow for mature eyes: https://www.harpersbazaar.com/beauty/makeup/a71932266/best-eyeshadow-for-mature-eyes/
- Marie Claire, Eyeshadow for mature skin: https://www.marieclaire.com/beauty/makeup/best-eyeshadows-for-mature-skin/
- Prevention, Eyeshadow for mature skin (cream, stick, baked): https://www.prevention.com/beauty/makeup/g71027632/best-eye-shadow-for-mature-skin/
- Real Simple, Best eyeshadow colors for every skin tone: https://www.realsimple.com/best-eyeshadow-colors-for-skin-tone-7106826
- L'Oréal Paris, Eyeshadow brushes guide: https://www.lorealparisusa.com/beauty-magazine/makeup/eye-makeup/eyeshadow-brushes
- Vogue, Rules for curling lashes: https://www.vogue.com/article/the-5-important-rules-for-curling-your-lashes
- Makeup.com, Glitter without fallout: https://www.makeup.com/makeup-tutorials/eyes/how-to-apply-glitter-eyeshadow-without-fallout
- American Academy of Ophthalmology, Using eye makeup safely: https://www.aao.org/Eye-Health/Tips-Prevention/eye-makeup
- YouCam makeup-vto API (eye_shadow colorIntensity, shimmer, metallic): https://yce.perfectcorp.com/document/index.html
- Plus the step-order, liner, brush and undertone sources in [research.md](research.md).

Product names in sources are not endorsements. MirrorMate recommends product *types*, never brands.
