// One-off test of every YouCam call the app uses, on one real selfie.
// Saves the results to src/demo/ so the app (and the demo video) can run without spending units.
//
//   npm run spike -- path/to/selfie.jpg
//
// Unit-safe: any result already saved in src/demo/ is skipped. Pass --force to redo the scan.
// Full first run costs about 42 units (skin 9 + tone 20 + face 10 + 3 try-ons).
// --looks=natural,winged limits the try-ons (1 unit each); --looks=best tries only the recommended look.

import fs from 'node:fs';
import path from 'node:path';
import { uploadImage, startTask, waitForTask, vtoImageUrl, getUnits } from '../api/_youcam.js';
import { undertoneFromHex, depthFromHex } from '../shared/color.js';
import { LOOK_IDS, stageIds } from '../shared/looks.js';
import { BROWS_ID, BROW_STAGE_IDS } from '../shared/brows.js';
import { buildProfile, recommendedLook } from '../src/lib/skinSummary.js';

const args = process.argv.slice(2);
const selfiePath = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
const redoVto = args.includes('--redo-vto'); // redo try-ons only, keep the saved scan
const looksArg = args.find((a) => a.startsWith('--looks='))?.slice(8);
// --stages=all|base,crease,... renders the step-by-step images (vto-<look>-<stage>.jpg).
// Without it, only the full look (last stage, with lips) is rendered as vto-<look>.jpg.
const stagesArg = args.find((a) => a.startsWith('--stages='))?.slice(9);
const outArg = args.find((a) => a.startsWith('--out='))?.slice(6);
if (!selfiePath) {
  console.error('Usage: npm run spike -- path/to/selfie.jpg [--force]');
  process.exit(1);
}

const DEMO = path.resolve('src/demo');
const OUT = path.resolve(outArg || DEMO);
fs.mkdirSync(OUT, { recursive: true });
// --out=src/demo/face-4 keeps a second sample face (its own selfie, scan and try-ons) apart.
const scanFile = path.join(OUT, 'scan.json');

const showUnits = async (label) => {
  try { console.log(label, JSON.stringify(await getUnits())); } catch (e) { console.log(label, 'unavailable:', e.message); }
};

await showUnits('Units before:');

const buffer = fs.readFileSync(selfiePath);
const contentType = selfiePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
if (path.resolve(selfiePath) !== path.join(OUT, 'selfie.jpg')) fs.copyFileSync(selfiePath, path.join(OUT, 'selfie.jpg'));

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
const depth = skinHex ? depthFromHex(skinHex) : 'medium';
console.log('Skin color', skinHex, '-> undertone', undertone, 'depth', depth);

// 2. One try-on per look (1 unit each).
const failed = ['skin', 'tone', 'face'].filter((t) => scan[t]?.status !== 'success');
// Colors come from the tone scan, so try-ons only need that one. A failed skin or face scan
// (e.g. error_large_face_angle) just leaves that results card empty.
if (failed.includes('tone')) { console.error('Tone scan failed - skipping try-ons.'); process.exit(1); }
if (failed.length) console.warn('Scan failed for', failed.join(', '), '- continuing (colors come from the tone scan).');
const best = recommendedLook(buildProfile(scan));
const looks = !looksArg ? LOOK_IDS : looksArg === 'best' ? [best] : looksArg.split(',').filter((l) => LOOK_IDS.includes(l) || l === BROWS_ID);
const browHex = scan.tone?.results?.color?.eyebrow_color || null;
console.log('Recommended look:', best, '- trying on:', looks.join(', '));
for (const lookId of looks) {
  // Brows: 'map' is the bare face (vto-bare), so only fill/blend/gel are rendered.
  const all = lookId === BROWS_ID ? BROW_STAGE_IDS.filter((x) => x !== 'map') : stageIds(lookId);
  const final = all[all.length - 1];
  const stages = !stagesArg ? [final] : stagesArg === 'all' ? all : stagesArg.split(',').filter((st) => all.includes(st));
  for (const stage of stages) {
    const name = stage === final && lookId !== BROWS_ID ? `vto-${lookId}` : `vto-${lookId}-${stage}`;
    const out = path.join(OUT, `${name}.jpg`);
    if ((fs.existsSync(out) || fs.existsSync(out.replace(/\.jpg$/, '.png'))) && !force && !redoVto) { console.log(`${name}: already saved`); continue; }
    const taskId = await startTask('vto', fileId, { lookId, undertone, depth, stage, browHex });
    const r = await waitForTask('vto', taskId);
    const url = vtoImageUrl(r.results);
    console.log(`${name}: ${r.status}`, r.error || '', url ? '' : JSON.stringify(r).slice(0, 300));
    if (!url) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    // YouCam may return a PNG (RGBA). Keep its real extension; demo mode loads .jpg or .png.
    const isPng = buf.subarray(0, 4).toString('hex') === '89504e47';
    fs.writeFileSync(isPng ? out.replace(/\.jpg$/, '.png') : out, buf);
    if (isPng) console.log('  saved as PNG; convert to JPEG to keep the demo small');
  }
}

await showUnits('Units after:');
