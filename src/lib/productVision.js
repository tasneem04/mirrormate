// Product recognition from the camera, fully in the browser and free.
// Uses CLIP (an open image-text model from Hugging Face) in "zero-shot" mode: it scores how well
// the photo matches each product description. No training, no server, no API key.
// The model (~90 MB) downloads once on this step and is cached by the browser.
//
// Tested on 26 real product photos (see docs/research.md): open palettes and brushes are recognized
// well; tubes (mascara / liquid liner / primer) look alike and get mixed up, so the user always
// confirms the guess from the top 3.
import { PRODUCTS, NOT_PRODUCT } from './products.js';

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
