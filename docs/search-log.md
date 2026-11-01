# Search log

Every search behind the research, with what came back. The summary and conclusions are in
[research.md](research.md). Searches were run on 2026-11-02.

## Hugging Face (API search, sorted by downloads)

**Datasets**

| Query | Top results | Useful? |
|---|---|---|
| makeup | cyberagent/FFHQ-Makeup, NexaAIalex/Makeup, UniqueData/makeup-detection-dataset, robot "makeup container" runs | No. These are faces with or without makeup, unlabeled screenshots (no license), and robot logs |
| cosmetics / cosmetic | RoboCOIN organize-cosmetics (robot), Kgshop/cosmeticshop, Innovatiana retail set, ingredient lists | No eye-product photo labels |
| eyeshadow | (nothing) | |
| lipstick | NexaAIalex/Lipstick, robot pick-lipstick runs | Not eye products |
| beauty-product | thebeautyapi/beautyproducts (paid catalog sample, CC BY-NC), product reviews | No |

**Models**

| Query | Top results | Useful? |
|---|---|---|
| makeup | SDXL and Flux LoRAs (image generators), a small text model | No recognizer |
| cosmetics / cosmetic | text models, a cosmetic *defect* detector, sentence-similarity models | No |

**Conclusion:** no ready model or labeled dataset for eye products. We use CLIP zero-shot
(`Xenova/clip-vit-base-patch32`) and tested it ourselves: [product-test/results.txt](product-test/results.txt).

## Web searches

**1. "beginner eyeshadow application steps crease placement transition shade blending technique"**

Consensus: prime, then transition shade in the crease, darker outer corner, lighter lid, then blend.

- https://www.maybelline.com/makeup-tips/videos/how-to-apply-eyeshadow
- https://www.maybelline.co.in/makeup-tips/eye-makeup/how-to-apply-eyeshadow-for-beginners
- https://www.urbandecay.com/eyeshadow-looks-for-beginners.html
- https://slashedbeauty.com/?p=1639
- https://elfcosmetics.com/blogs/the-elf-word/how-and-where-to-apply-eyeshadow
- https://honest.com/blogs/beauty/how-to-apply-eyeshadow-in-5-easy-steps
- https://de.plouise.co.uk/blogs/news/how-to-apply-eyeshadow-for-beginners
- https://torontocaribbean.com/how-to-apply-eyeshadow-like-a-pro/

**2. "winged eyeliner angle guide lower lash line to end of eyebrow beginner steps"**

Consensus: extend the lower lash line toward the brow tail (about 45°) and never reach the brow.
Mark the angle with tape or a brush, dot the tip, connect it, then fill in. Gel liner is easier.

- https://www.masterclass.com/articles/how-to-do-a-perfect-winged-eyeliner
- https://www.makeup.com/en-ca/how-to-do-winged-eyeliner-canada
- https://www.cosmetify.com/blog/how-to-do-winged-eyeliner/
- https://cutoutandkeep.net/projects/the-perfect-wing
- https://nourishmantra.in/blogs/news/how-to-apply-winged-eyeliner-step-by-step-guide
- https://xlash.com/en-eu/blogs/magazine/how-to-apply-eyeliner-beginners-guide

**3. "eyeshadow colors for warm cool neutral undertone guide which shades suit"**

Consensus:
- Warm undertones suit gold, copper, orange and brown.
- Cool undertones suit blue, green, purple, silver and grey.
- Neutral undertones can wear both.

Several results were low quality, so only the consistent core was used.

- https://www.facescanada.com/blogs/beauty/eyeshadow-guide-for-different-skin-tones
- https://www.rmsbeauty.com/blogs/news/how-to-choose-the-best-eyeshadow-for-your-skin-undertone
- https://www.urbancompany.com/blog/how-to-choose-eyeshadow-colors
- https://www.makeup.com/best-pink-eyeshadow-for-your-skin-tone

**4. "essential eye makeup brushes for beginners flat shader fluffy blending brush angled liner brush what each does"**

Consensus:
- **Flat shader:** packs color on the lid.
- **Fluffy blender:** softens edges and puts color in the crease.
- **Angled brush:** for liner and wings, with gel liner, and for brows.

- https://SigmaBeauty.com/pages/essential-brushes-blog
- https://www.urbancompany.com/blog/all-you-want-to-know-about-eye-makeup-brushes-a-beginners-guide
- https://lorealparisusa.com/beauty-magazine/makeup/eye-makeup/eyeshadow-brushes
- https://www.maybelline.co.in/makeup-tips/eye-makeup/5-eye-makeup-brushes-one-must-have
- https://beaut.ie/beauty/four-brushes-need-create-eye-look-371645

**5. "hooded eyes eyeshadow placement above crease tips; eye primer oily lids"**

- **Hooded lids:** placement matters more than amount, and the natural crease isn't a good guide.
- **Oily lids:** a matte, long-wear primer helps, and setting it with powder can help more.

The search marked "above the crease" as unverified, so it was checked directly (next item).

- https://www.bustle.com/style/eyeshadow-tips-for-hooded-eyes
- https://coveteur.com/2020/09/28/hooded-eye-makeup-tips
- https://patrickta.com/blogs/articles/makeup-tips-to-try-for-hooded-eyes
- https://www.makeup.com/makeup-tutorials/eyes/eyeshadow-primer-for-oily-eyelids
- https://www.bustle.com/p/the-10-best-eye-primers-for-oily-lids-61697

**6. Direct check: Bustle, hooded eyes**

Confirmed: put the color "just above your natural crease" and "keep your eyes open as you put
eyeshadow on". https://www.bustle.com/style/eyeshadow-tips-for-hooded-eyes

## YouCam API docs (read for the build)

- Introduction and quick start: https://docs.perfectcorp.com/develop/introduction, https://docs.perfectcorp.com/develop/quick_start_guide
- **Skin analysis:** SD concerns, 9 units for 1 to 4 concerns, short side of at least 480 px. https://docs.perfectcorp.com/reference/ai_skin_analysis
- **Skin tone:** 20 units, returns skin, eye, brow, lip and hair color. https://docs.perfectcorp.com/reference/ai_skin_tone_analysis
- **Face attributes:** 10 units for 1 to 5 features, including eyelid type and eye shape. https://docs.perfectcorp.com/reference/ai_face_analyzer
- **Makeup try-on:** 1 unit; eye_shadow, eye_liner and eyelashes use patterns from the static catalogs. https://docs.perfectcorp.com/reference/makeup_vto
- **Unit balance:** a free call. https://docs.perfectcorp.com/reference/unit_system
