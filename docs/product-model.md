# Which model recognizes a makeup product from a photo?

**Goal:** take a photo of the user's product, tell what type it is (and the name if possible), then look up what it's good or bad for given their skin.

**Pipeline:** photo → model (type, plus optional label text) → local `PRODUCT_KNOWLEDGE` table → advice for this user's skin.

**Constraints:** free, runs in the browser (no server cost, no YouCam units), fast enough for a live demo.

## Finding: there is no ready eye-cosmetic classifier on the Hub
Searches for makeup, cosmetic, mascara, eyeliner and eyeshadow classifiers found none we could use:
- `tuphamdf/skincare-detection` is a ViT trained on skincare, not eye products, and has no ONNX.
- Datasets exist, but nothing trained on them is usable here. Examples: a Mobiusi eyebrow-product set, and `thebeautyapi/beautyproducts`, which is CC BY-NC.

So the options are zero-shot vision-language models (scoring the photo against text descriptions) and a label reader (OCR).

## Tested candidates
All five were run with transformers.js on the same 26 real product photos. Raw numbers are in [product-test/model-ab.txt](product-test/model-ab.txt).

| Model | Size (download) | Runs in browser | Type accuracy (top-1 / top-3 of 26) | Licence | Notes |
|---|---|---|---|---|---|
| [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) | ~88 MB (q8) | Yes (current) | 8 / 12 (fp32: 9 / 15) | MIT | ~60 ms per photo. Smallest, fine with the user confirming from the top 3. |
| [Marqo/marqo-fashionSigLIP](https://huggingface.co/Marqo/marqo-fashionSigLIP) | ~205 MB (q8 text + vision) | Yes (separate text/vision models, no pipeline) | 8 / 16 | Apache-2.0 | Trained on product images. Much more confident on mascara and liquid liner (95%+). Runner-up. |
| [Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224) | ~200 MB | Yes | 5 / 8 | Apache-2.0 | Worse here. |
| [Xenova/clip-vit-base-patch16](https://huggingface.co/Xenova/clip-vit-base-patch16) | ~150 MB | Yes | 4 / 11 | MIT | Worse and slower. |
| [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft) | ~550 MB (vision fp32 + q8 rest) | Yes (WASM, ~1–1.5 s per read on CPU) | 5 / 26 as a type classifier | MIT | **Reads label text well.** Real reads: "chi-fi WATERPROOF CREME MASCARA", "BE A NATURAL EYESHADOW NUDE PALETTE", "EYE DRAMA BOLD BLACK", "SHISEIDO", "AVON". A quantized vision encoder produces garbage, so it must stay fp32. |

Also considered: [HuggingFaceTB/SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct) (Apache-2.0, ONNX). It can answer "what product is this?" in free text. But it's heavier and slower in the browser, and its answers still need mapping to our types, so we didn't adopt it for the hackathon.

The scores are harsh: 3 of the "brush" photos are palette-with-brushes shots, and some palettes are closed. Compare the models, not the absolute numbers.

## Recommendation (implemented)
1. **Type: keep CLIP B/32** as the always-on model. It's small, the fastest, and accuracy is comparable to the others. The app shows the top 3 guesses and the user taps the right one.
2. **Name and formula: add Florence-2-base-ft `<OCR>` as an optional "Read the label" button.** It loads only on tap, downloads once and is then cached.
   - The text is shown and saved as the product's name.
   - If the text names a type (e.g. "mascara", "eyeshadow palette"), `typeFromText` puts that type first. This is high precision when it fires.
   - If it names a non-eye product (lipstick, nail polish, foundation), the user is told.
   - Formula words (waterproof, cream, matte, shimmer) go through `formulaNotes` and become skin-specific tips.
3. **Knowledge:** `PRODUCT_KNOWLEDGE` gives what each product does, plus tips for oily, dry and sensitive skin. `productAdvice(id, profile)` shows the tip that matches the user's skin first. Brand facts are never invented; only type facts come from our table.
4. **Next upgrade after the hackathon:** fine-tune a small classifier, or a Marqo or CLIP linear probe, on a few hundred labelled eye-product photos. Marqo is the best base, given how confident it was on tubes.

## Code
- `src/lib/productVision.js`: `classifyProduct` (CLIP), `readLabel` (Florence-2 OCR) and `mergeLabelHint`.
- `src/lib/products.js`: `PRODUCT_KNOWLEDGE`, `productAdvice`, `typeFromText` and `formulaNotes`.
- `test/products.test.js`: these rules, tested against real OCR strings.
