// One-off test of every YouCam call the app uses, on one real selfie.
// Saves the results to src/demo/ so the app (and the demo video) can run without spending units.
//
//   npm run spike -- path/to/selfie.jpg
//
// Unit-safe: any result already saved in src/demo/ is skipped. Pass --force to redo the scan.
// Full first run costs about 42 units (skin 9 + tone 20 + face 10 + 3 try-ons).

import fs from 'node:fs';
import path from 'node:path';
import { uploadImage, startTask, waitForTask, vtoImageUrl, getUnits } from '../api/_youcam.js';
import { undertoneFromHex } from '../shared/color.js';
import { LOOK_IDS } from '../shared/looks.js';

const args = process.argv.slice(2);
const selfiePath = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
if (!selfiePath) {
  console.error('Usage: npm run spike -- path/to/selfie.jpg [--force]');
  process.exit(1);
}

const DEMO = path.resolve('src/demo');
fs.mkdirSync(DEMO, { recursive: true });
const scanFile = path.join(DEMO, 'scan.json');

const showUnits = async (label) => {
  try { console.log(label, JSON.stringify(await getUnits())); } catch (e) { console.log(label, 'unavailable:', e.message); }
};

await showUnits('Units before:');

const buffer = fs.readFileSync(selfiePath);
const contentType = selfiePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
fs.copyFileSync(selfiePath, path.join(DEMO, 'selfie.jpg'));

console.log('Uploading selfie...');
const fileId = await uploadImage(buffer, contentType);
console.log('file_id:', fileId);

// 1. Skin, tone and face analysis (once).
let scan;
if (fs.existsSync(scanFile) && !force) {
  scan = JSON.parse(fs.readFileSync(scanFile, 'utf8'));
  console.log('Scan already saved, skipping (use --force to redo).');
} else {
  scan = {};
  await Promise.all(
    ['skin', 'tone', 'face'].map(async (type) => {
      const taskId = await startTask(type, fileId);
      console.log(`${type}: task ${taskId}`);
      const r = await waitForTask(type, taskId);
      console.log(`${type}: ${r.status}`, r.error || '');
      scan[type] = r;
    }),
  );
  fs.writeFileSync(scanFile, JSON.stringify(scan, null, 2));
  console.log('Saved', scanFile);
}

const skinHex = scan.tone?.results?.color?.skin_color;
const undertone = skinHex ? undertoneFromHex(skinHex) : 'neutral';
console.log('Skin color', skinHex, '-> undertone', undertone);

// 2. One try-on per look (1 unit each).
for (const lookId of LOOK_IDS) {
  const out = path.join(DEMO, `vto-${lookId}.jpg`);
  if (fs.existsSync(out) && !force) { console.log(`vto ${lookId}: already saved`); continue; }
  const taskId = await startTask('vto', fileId, { lookId, undertone });
  const r = await waitForTask('vto', taskId);
  const url = vtoImageUrl(r.results);
  console.log(`vto ${lookId}: ${r.status}`, r.error || '', url ? '' : JSON.stringify(r).slice(0, 300));
  if (url) fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
}

await showUnits('Units after:');
