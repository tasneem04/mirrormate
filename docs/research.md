# Research notes: makeup basics and product recognition

Why the coach's rules and product checks work the way they do. Written 2026-11-02.

## 1. Eye makeup basics (what the coach teaches)

**Step order.** Most beginner guides use the same order: prep, transition shade in the crease,
lid color, darker outer corner, then blend. Liner and wing come after shadow. The app's steps
follow this order (`shared/looks.js`, `src/lib/coachRules.js` STEP_INFO).

- **Prep:** a thin layer of eye primer or concealer on the lids first. It matters most for oily lids.
- **Transition / crease shade:** a matte shade one or two shades darker than the skin, put in the
  crease with a fluffy brush.
- **Lid:** lighter or medium shades on the lid, patted on with a flat brush, starting at the
  center and going outward.
- **Outer corner:** the darkest shade on the outer corner, swept into the crease and blended
  into the transition shade.
- **Blending** is "the key to any eyeshadow look": small back-and-forth ("windshield wiper")
  strokes with a clean fluffy brush. The coach counts these direction changes.

**Winged liner.**
- **Angle:** follow the line from the outer end of the lower lash line toward the tail of the
  brow (about 45°). The coach compares the stroke angle to exactly this line.
- **Length:** the wing should **never reach the brow**. The coach says "Wing too long" past
  about 55% of the way.
- **Method:** mark the angle with tape or a brush handle, dot the tip, connect it to the lash
  line, then fill in.
- **Easier products:** gel liner with an angled brush is easier to control than liquid liner.
- **Uneven brows:** one side may need a slightly steeper angle. This is why the symmetry tip
  compares the two eyes rather than demanding one exact angle.

**Hooded lids.** Put the crease color "just above your natural crease" and "keep your eyes open
as you put eyeshadow on". The coach aims higher (0.5 instead of 0.4 of the lash-to-brow
distance) and says so.

**Tools a beginner needs.**
- **Flat shader brush:** packs color on the lid.
- **Fluffy blending brush:** puts shade in the crease and softens edges.
- **Angled liner brush:** used with gel liner, or for brows.

Free swaps when a tool is missing are in `src/lib/products.js` (TOOL_SWAPS).

**Undertone and color.** Warm undertones suit gold, copper, orange and brown. Cool undertones suit
blue, green, purple, silver and grey. Neutral undertones can wear both. The app gets the skin
color from the YouCam skin tone API and turns it into an undertone with a CIE Lab hue rule
(`shared/color.js`). This is a rule of thumb, not a lab test.

Sources:
- Step order and blending: [Maybelline: how to apply eyeshadow](https://www.maybelline.co.in/makeup-tips/eye-makeup/how-to-apply-eyeshadow-for-beginners), [e.l.f.: placement, blending, finish](https://elfcosmetics.com/blogs/the-elf-word/how-and-where-to-apply-eyeshadow), [Honest: eyeshadow in 5 steps](https://honest.com/blogs/beauty/how-to-apply-eyeshadow-in-5-easy-steps), [Urban Decay: looks for beginners](https://www.urbandecay.com/eyeshadow-looks-for-beginners.html)
- Winged liner: [MasterClass: winged eyeliner](https://www.masterclass.com/articles/how-to-do-a-perfect-winged-eyeliner), [Makeup.com: how to do winged eyeliner](https://www.makeup.com/en-ca/how-to-do-winged-eyeliner-canada), [Cosmetify: winged eyeliner](https://www.cosmetify.com/blog/how-to-do-winged-eyeliner/), [Cut Out + Keep: the perfect wing](https://cutoutandkeep.net/projects/the-perfect-wing)
- Hooded eyes: [Bustle: eyeshadow tips for hooded eyes](https://www.bustle.com/style/eyeshadow-tips-for-hooded-eyes)
- Brushes: [Sigma: essential brushes](https://SigmaBeauty.com/pages/essential-brushes-blog), [L'Oréal: eyeshadow brushes](https://lorealparisusa.com/beauty-magazine/makeup/eye-makeup/eyeshadow-brushes)
- Undertone and color: [Faces Canada: eyeshadow by skin tone](https://www.facescanada.com/blogs/beauty/eyeshadow-guide-for-different-skin-tones), [RMS Beauty: eyeshadow by undertone](https://www.rmsbeauty.com/blogs/news/how-to-choose-the-best-eyeshadow-for-your-skin-undertone)
- Oily lids and primer: [Makeup.com: primer for oily eyelids](https://www.makeup.com/makeup-tutorials/eyes/eyeshadow-primer-for-oily-eyelids)

## 2. Product recognition with Hugging Face

**What is on Hugging Face:**
- **Models:** searching "makeup", "cosmetics" and "eyeshadow" finds no ready-made model that
  recognizes eye makeup products. The hits are image generators (LoRAs), text models, and one
  cosmetic *defect* detector.
- **Datasets:** none are labeled eye-product photos we could use.
  - `NexaAIalex/Makeup` is unlabeled screenshots with no license.
  - `thebeautyapi/beautyproducts` is a paid product catalog sample (CC BY-NC).
  - `UniqueData/makeup-detection-dataset` is faces before and after makeup (CC BY-NC-ND).
- Training our own model was not possible by the deadline.

**What we use instead:** CLIP (`Xenova/clip-vit-base-patch32`) through transformers.js, in
"zero-shot" mode. It compares the camera photo with text descriptions ("a photo of an
eyeliner pencil", ...) and needs no training. It runs in the browser for free; the model
downloads once (~90 MB).

**Real test (26 photos from Wikimedia Commons, the app's exact labels).** Only fair photos are
counted, with the product visible and open:

| Product | Correct first guess |
|---|---|
| Open eyeshadow palette | 4 of 4 |
| Fluffy brush (even lying on a palette) | 2 of 2 |
| Liquid liner pen | 3 of 5 (4 of 5 in the top 3) |
| Modern mascara tube | 2 of 3 |

**Failures:**
- A closed palette (a plain black box) and the back of a palette were not recognized.
- Old-style squeeze-tube mascara was guessed as "primer".
- A lipstick, which isn't on the label list, was forced into an eye product label.

**Changes made after the test:**
- "Not an eye product" labels (lipstick, nail polish, a closed case, face, hand) give a clear
  message instead of a wrong guess.
- The app says "Looks like" only when the top score is at least 55%, and "Maybe" otherwise.
- The user always confirms the guess from the top 3, or picks from the list.
- The scan hint says "Open palettes so the colors show".
- The **shade is never guessed by the model**: the user taps the shade on the frozen photo,
  and the app reads the real pixel color.

Raw output: [product-test/results.txt](product-test/results.txt). Photo sources:
[product-test/test-photos.md](product-test/test-photos.md). To rerun it on your own photos, run
`node scripts/product-test.mjs path/to/photos`. Every search and link is in [search-log.md](search-log.md).

**Limits to be honest about:** tubes (mascara, liquid liner, primer) look alike. The model
can't read the shade name, and it doesn't know brands (on purpose).
