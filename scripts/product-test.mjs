// Tests the in-browser product model (CLIP zero-shot) on your own photos, in Node.
// Put photos in one subfolder per true type, e.g. photos/palette/a.jpg, photos/mascara/b.jpg.
//
//   node scripts/product-test.mjs path/to/photos
//
// Prints the top 3 guesses per photo using the exact labels from src/lib/products.js.
// First run downloads the model (a few hundred MB in Node), later runs are fast.
// Results from our test: docs/product-test/results.txt (summary in docs/research.md).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PRODUCTS, NOT_PRODUCT } from '../src/lib/products.js';

const photosDir = process.argv[2];
if (!photosDir) {
  console.error('Usage: node scripts/product-test.mjs path/to/photos');
  process.exit(1);
}

const { pipeline, RawImage } = createRequire(import.meta.url)('@huggingface/transformers');
const clf = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
const labels = [...PRODUCTS.map((p) => p.prompt), ...NOT_PRODUCT.map((n) => n.prompt)];
const short = (l) => PRODUCTS.find((p) => p.prompt === l)?.id || l.replace('a photo of ', 'NOT: ');

for (const truth of fs.readdirSync(photosDir)) {
  const dir = path.join(photosDir, truth);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    try {
      const out = await clf(await RawImage.read(path.join(dir, f)), labels, { hypothesis_template: '{}' });
      const top = out.slice(0, 3).map((o) => `${short(o.label)} ${(o.score * 100).toFixed(0)}%`).join(', ');
      console.log(`${truth.padEnd(13)} ${f}  ->  ${top}`);
    } catch (e) {
      console.log(`${truth.padEnd(13)} ${f}  ->  ERROR ${e.message.slice(0, 80)}`);
    }
  }
}
