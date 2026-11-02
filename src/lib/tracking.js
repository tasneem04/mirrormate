// MediaPipe Face Landmarker + Hand Landmarker, running in the browser (free, no server).
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let trackersPromise = null;

// Load both models once. Tries the GPU first, falls back to the CPU.
export function loadTrackers() {
  trackersPromise ??= (async () => {
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate) => ({
      face: await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
      hand: await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        // A bit lower than default: hands near the face are harder to see.
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      }),
    });
    try {
      return await make('GPU');
    } catch (e) {
      console.warn('GPU tracking failed, using CPU', e);
      return await make('CPU');
    }
  })();
  return trackersPromise;
}

// Pick the hand most likely to hold the brush: the one whose index fingertip is
// closest to an eye. Returns the 21 landmarks or null.
export function pickBrushHand(hands, face) {
  if (!hands?.length) return null;
  if (hands.length === 1 || !face) return hands[0];
  const eyes = [face[33], face[263]];
  const d = (h) => Math.min(...eyes.map((e) => Math.hypot(h[8].x - e.x, h[8].y - e.y)));
  return [...hands].sort((a, b) => d(a) - d(b))[0];
}

// VIDEO-mode timestamps must always go up, even across steps and restarts.
let lastTs = 0;
export function nextTs() {
  lastTs = Math.max(lastTs + 1, performance.now());
  return lastTs;
}

// A second face model in IMAGE mode, for still photos (goal images). Kept apart from the
// VIDEO-mode one so stills never confuse the live tracking.
let imageFacePromise = null;
export function loadImageFace() {
  imageFacePromise ??= (async () => {
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) => FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'IMAGE', numFaces: 1,
    });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  return imageFacePromise;
}
