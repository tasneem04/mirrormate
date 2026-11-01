// Product recognition from the camera, fully in the browser and free.
// Uses CLIP (an open image-text model from Hugging Face) in "zero-shot" mode: it scores how well
// the photo matches each product description. No training, no server, no API key.
// The model (~90 MB) downloads once on this step and is cached by the browser.
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

// Classify a canvas. Returns the top product guesses: [{ product, score }], best first.
// Returns [] when the frame looks like a face/hand/room more than any product.
export async function classifyProduct(canvas) {
  const classifier = await loadClassifier();
  const labels = [...PRODUCTS.map((p) => p.prompt), ...NOT_PRODUCT];
  const out = await classifier(canvas.toDataURL('image/jpeg', 0.9), labels, { hypothesis_template: '{}' });
  if (NOT_PRODUCT.includes(out[0]?.label)) return [];
  return out
    .map((o) => ({ product: PRODUCTS.find((p) => p.prompt === o.label), score: o.score }))
    .filter((o) => o.product)
    .slice(0, 3);
}
