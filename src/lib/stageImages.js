// Step-by-step goal images: real YouCam try-ons of the selfie, one layer more each step.
// Also loads them as pixels + landmarks so the live coach can compare against them.
import { stageIds, stageForStep } from '../../shared/looks.js';
import { demo, tryOnLook } from './api.js';
import { loadImageFace } from './tracking.js';
import { sampleFace } from './zoneCompare.js';

export const STAGE_LABEL = { base: 'Lid', crease: 'Crease', liner: 'Liner', smoke: 'Smoke', wing: 'Wing', lips: 'Lips' };

// Demo cache: { bare, base, crease, ..., <last stage> = full look }.
export function demoStageImages(lookId) {
  const ids = stageIds(lookId);
  const out = {};
  const bare = demo.vto('bare');
  if (bare) out.bare = bare;
  ids.forEach((id, i) => {
    const url = i === ids.length - 1 ? demo.vto(lookId) : demo.vtoStep(lookId, id);
    if (url) out[id] = url;
  });
  return out;
}

// Live: one try-on per stage (cached per photo), plus the zero-strength 'bare' reference.
// The full look is already the goal, so it is not paid again. Returns the same shape as above.
export async function liveStageImages({ session, lookId, goal, onImage = () => {} }) {
  const { scanMeta, selfie, profile } = session;
  const ids = stageIds(lookId);
  const out = { [ids[ids.length - 1]]: goal };
  for (const stage of ['bare', ...ids.slice(0, -1)]) {
    out[stage] = await tryOnLook({ ...scanMeta, dataUrl: selfie, lookId, undertone: profile.undertone, depth: profile.depth, stage });
    onImage(stage, out[stage]);
  }
  return out;
}

// Units a live step set costs (bare + every stage except the full look).
export const liveStageCost = (lookId) => stageIds(lookId).length;

// For a coach step: which goal image to show, and which pair defines the expected change.
const EXPECT = {
  base: ['bare', 'base'], crease: ['base', 'crease'], liner: ['crease', 'liner'],
  outer: ['liner', 'smoke'], wing: ['liner', 'wing'],
};
const STAGE_STEP = { base: 'base', crease: 'crease', liner: 'liner', smoke: 'outer', wing: 'wing' };
// coachSteps: the look's coach order. 'also' = 'bare' when the layer under this one is coached
// later (smoky/natural do the crease before the lid), so the user starts from bare skin there.
export function stepImages(lookId, step, images = {}, coachSteps = []) {
  const show = images[stageForStep(lookId, step)] || null;
  let [from, to] = EXPECT[step] || [];
  // Natural/winged have no 'smoke'; the coach order may differ from the render order.
  if (!images[to]) to = stageForStep(lookId, step);
  if (!images[from]) from = images.bare ? 'bare' : null;
  const fromIdx = coachSteps.indexOf(STAGE_STEP[from]);
  const also = from && from !== 'bare' && images.bare && (fromIdx < 0 || fromIdx > coachSteps.indexOf(step)) ? 'bare' : null;
  return { show, from, to, also };
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not load image'));
    im.src = src;
  });
}

export function pixelsOf(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// Load every goal image, find the face once (all renders share the selfie's geometry), and
// sample the eye grid of each. Returns { face, images: {stage: HTMLImageElement}, samples }.
export async function loadGoalSamples(images) {
  const entries = Object.entries(images).filter(([, v]) => v);
  if (!entries.length) return null;
  const loaded = Object.fromEntries(await Promise.all(entries.map(async ([k, v]) => [k, await loadImage(v)])));
  const ref = loaded.bare || loaded.base || Object.values(loaded)[0];
  const detector = await loadImageFace();
  const face = detector.detect(ref).faceLandmarks?.[0];
  if (!face) return null;
  const samples = {};
  for (const [k, im] of Object.entries(loaded)) samples[k] = sampleFace(pixelsOf(im), face);
  return { face, images: loaded, samples };
}

// Where the eyes are in a photo, for eye-only thumbnails. Normalized { cx, cy, w, ratio }.
export async function eyeFocusOf(src) {
  try {
    const im = await loadImage(src);
    const face = (await loadImageFace()).detect(im).faceLandmarks?.[0];
    if (!face) return null;
    const x0 = face[46].x, x1 = face[276].x; // brow tails
    const cy = (face[159].y + face[386].y + face[52].y + face[282].y) / 4;
    const w = Math.min(1, (x1 - x0) * 1.2);
    // Keep the crop inside the photo (a face near the edge would show empty space).
    const cx = Math.min(1 - w / 2, Math.max(w / 2, (x0 + x1) / 2));
    return { cx, cy, w, ratio: im.naturalHeight / im.naturalWidth };
  } catch {
    return null;
  }
}
