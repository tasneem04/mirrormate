// Product recognition from the camera, fully in the browser and free. Two open Hugging Face models:
//
// 1. CLIP (Xenova/clip-vit-base-patch32, ~90 MB) in "zero-shot" mode names the product TYPE.
//    It scores how well the photo matches each product description. Fast, always used.
// 2. Florence-2 (onnx-community/Florence-2-base-ft, MIT, ~550 MB, optional) reads the TEXT on the
//    pack (<OCR>): the product name and words like "waterproof" or "cream". Only loads when the
//    user taps "Read the label". If the text names a type ("mascara", "eyeshadow palette"),
//    that type moves to the top of the guesses.
//
// Tested on 26 real product photos (docs/research.md, docs/product-model.md). The user always
// confirms the guess. Product facts come from the local table in products.js, not from the model.
import { PRODUCTS, NOT_PRODUCT, productById, typeFromText } from './products.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
let classifierPromise = null;

export function loadClassifier(onProgress) {
  classifierPromise ??= import('@huggingface/transformers').then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    return pipeline('zero-shot-image-classification', MODEL, {
      progress_callback: (p) => {
        if (p.status === 'progress' && onProgress) onProgress(Math.round(p.progress || 0));
      },
    });
  });
  return classifierPromise;
}

// Classify a canvas. Returns { guesses: [{ product, score }] (best first, up to 3), sure, notProduct }.
//   sure: the top guess is confident enough to say "Looks like" instead of "Maybe".
//   notProduct: a message when the frame looks like a face, a hand, a lipstick, a closed case...
export async function classifyProduct(canvas) {
  const classifier = await loadClassifier();
  const labels = [...PRODUCTS.map((p) => p.prompt), ...NOT_PRODUCT.map((n) => n.prompt)];
  const out = await classifier(canvas.toDataURL('image/jpeg', 0.9), labels, { hypothesis_template: '{}' });
  const not = NOT_PRODUCT.find((n) => n.prompt === out[0]?.label);
  const guesses = out
    .map((o) => ({ product: PRODUCTS.find((p) => p.prompt === o.label), score: o.score }))
    .filter((o) => o.product)
    .slice(0, 3);
  return { guesses, sure: !not && guesses[0]?.score >= 0.55, notProduct: not?.say || null };
}

// ---------- optional: read the label (Florence-2 OCR) ----------
const OCR_MODEL = 'onnx-community/Florence-2-base-ft';
// Tested: a quantized vision encoder garbles the output, so it stays fp32; the rest is 8-bit.
const OCR_DTYPE = { vision_encoder: 'fp32', embed_tokens: 'q8', encoder_model: 'q8', decoder_model_merged: 'q8' };
let ocrPromise = null;

export function loadLabelReader(onProgress) {
  ocrPromise ??= import('@huggingface/transformers').then(async (t) => {
    t.env.allowLocalModels = false;
    const files = {};
    const progress_callback = (p) => {
      if (p.status !== 'progress' || !onProgress) return;
      files[p.file] = p;
      const all = Object.values(files);
      const done = all.reduce((a, f) => a + (f.loaded || 0), 0);
      const total = all.reduce((a, f) => a + (f.total || 0), 0);
      onProgress(total ? Math.round((100 * done) / total) : 0);
    };
    const [model, processor, tokenizer] = await Promise.all([
      t.Florence2ForConditionalGeneration.from_pretrained(OCR_MODEL, { dtype: OCR_DTYPE, progress_callback }),
      t.AutoProcessor.from_pretrained(OCR_MODEL),
      t.AutoTokenizer.from_pretrained(OCR_MODEL),
    ]);
    return { model, processor, tokenizer, RawImage: t.RawImage };
  });
  ocrPromise.catch(() => { ocrPromise = null; }); // allow a retry after a failed download
  return ocrPromise;
}

// Read the text on a product. Returns { text, hint } where hint is { id } or { not } or null.
export async function readLabel(canvas, onProgress) {
  const { model, processor, tokenizer, RawImage } = await loadLabelReader(onProgress);
  const image = await RawImage.fromCanvas(canvas);
  const task = '<OCR>';
  const inputs = { ...tokenizer(processor.construct_prompts(task)), ...(await processor(image)) };
  const ids = await model.generate({ ...inputs, max_new_tokens: 60 });
  const raw = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0];
  const text = String(processor.post_process_generation(raw, task, image.size)[task] || '').trim();
  const clean = text.length >= 3 && /[a-z]{3}/i.test(text) ? text : '';
  return { text: clean, hint: typeFromText(clean) };
}

// Put the type named on the label first (or add it) in the CLIP guesses.
export function mergeLabelHint(guesses, hint) {
  if (!hint?.id) return guesses;
  const product = productById(hint.id);
  const rest = (guesses || []).filter((g) => g.product.id !== hint.id);
  return [{ product, score: 1, fromLabel: true }, ...rest].slice(0, 3);
}
