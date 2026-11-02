// Browser side of the YouCam calls: upload, start task, poll, and cache.
// Unit-safe by design:
//   - Every result is cached in localStorage by image hash, so the same selfie is never paid twice.
//   - Demo mode uses the saved results in src/demo/ and makes no YouCam calls at all.

// Saved demo results (created by `npm run spike`). Missing files just mean "no demo yet".
// Sample face 1 lives in src/demo/ (with the step-by-step images); the others in src/demo/face-N/.
const demoImages = import.meta.glob(['../demo/*.{jpg,png}', '../demo/face-*/*.{jpg,png}'], { eager: true, query: '?url', import: 'default' });
const demoJson = import.meta.glob(['../demo/scan.json', '../demo/face-*/scan.json'], { eager: true, import: 'default' });

// Sample faces, shown in the picker in this order. Photo credits: public/samples/CREDITS.md.
export const DEMO_FACES = [
  { id: 'face-1', dir: '../demo', label: 'Deep skin' },
  { id: 'face-4', dir: '../demo/face-4', label: 'Fair skin' },
  { id: 'face-5', dir: '../demo/face-5', label: 'Olive skin' },
].filter((f) => demoJson[`${f.dir}/scan.json`] && demoImages[`${f.dir}/selfie.jpg`])
  .map((f) => ({ ...f, selfie: demoImages[`${f.dir}/selfie.jpg`], scan: demoJson[`${f.dir}/scan.json`] }));

let current = DEMO_FACES[0] || null;
const img = (name) => (current && demoImages[`${current.dir}/${name}.jpg`]) || null;

export const demo = {
  available: DEMO_FACES.length > 0,
  faces: DEMO_FACES,
  get id() { return current?.id || null; },
  get selfie() { return current?.selfie || null; },
  get scan() { return current?.scan || null; },
  // Pick which sample face the rest of the app shows.
  use(id) { current = DEMO_FACES.find((f) => f.id === id) || current; return current; },
  vto: (lookId) => img(`vto-${lookId}`),
  // Step-by-step try-on image (one layer more each step). The last stage is the full look.
  vtoStep: (lookId, stage) => img(`vto-${lookId}-${stage}`),
};

let passcode = '';
export const setPasscode = (p) => { passcode = p; };

export async function getConfig() {
  try {
    const r = await fetch('/api/config');
    return r.ok ? await r.json() : { hasKey: false };
  } catch {
    return { hasKey: false };
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-live-passcode': passcode },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Start a task and poll every 2 s until it finishes (max ~2 minutes).
async function runTask(type, body) {
  const { taskId } = await request('POST', '/api/task', { type, ...body });
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const r = await request('GET', `/api/task?type=${type}&id=${encodeURIComponent(taskId)}`);
    if (r.status === 'success') return r;
    if (r.status === 'error') throw new Error(friendlyError(r.error, r.errorMessage));
  }
  throw new Error('This is taking too long. Please try again.');
}

function friendlyError(code, message) {
  const map = {
    error_src_face_too_small: 'Your face is too small in the photo. Tap Take a selfie again and hold the camera closer, so your face fills the oval.',
    error_below_min_image_size: 'The photo is too small. Try again with the camera closer.',
    error_no_face: 'No face found. Face the camera in good light.',
  };
  const text = `${code || ''} ${message || ''}`.toLowerCase();
  if (text.includes('dark')) return 'Your photo is too dark. Face a window or a lamp so light falls on your face, then take the selfie again.';
  if (text.includes('bright') || text.includes('overexpos')) return 'Your photo is too bright. Move away from direct light and take the selfie again.';
  if (text.includes('blur')) return 'Your photo is blurry. Hold still and take the selfie again.';
  return map[code] || message || code || 'Something went wrong.';
}

// ---------- cache ----------
function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: skip caching */ }
}

export async function hashString(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- public calls ----------

// Skin + tone + face analysis of one selfie. About 39 units, once per photo.
export async function analyzeSelfie(dataUrl, onProgress = () => {}) {
  const hash = await hashString(dataUrl);
  const key = `mm:scan:${hash}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, hash };

  onProgress('Uploading your photo...');
  const { fileId } = await request('POST', '/api/upload', { image: dataUrl });
  onProgress('Reading your skin and face. This takes about 20 seconds...');
  const [skin, tone, face] = await Promise.all(['skin', 'tone', 'face'].map((type) => runTask(type, { fileId })));
  const result = { scan: { skin, tone, face }, fileId, fileAt: Date.now() };
  cacheSet(key, result); // only reached when all three succeeded
  return { ...result, hash };
}

// Virtual try-on of one look on the selfie. 1 unit, once per photo + look + undertone + stage.
// stage: optional step layer ('base', 'crease', ...); none = the full look with lips.
// Re-uploads the photo (free) if the old file id may have expired.
export async function tryOnLook({ hash, dataUrl, fileId, fileAt, lookId, undertone, depth, stage, browHex }) {
  const key = `mm:vto3:${hash}:${lookId}:${undertone}:${depth}:${stage || 'full'}${browHex ? ':' + browHex : ''}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  let id = fileId;
  if (!id || Date.now() - (fileAt || 0) > 30 * 60 * 1000) {
    id = (await request('POST', '/api/upload', { image: dataUrl })).fileId;
  }
  const r = await runTask('vto', { fileId: id, lookId, undertone, depth, stage, browHex });
  if (!r.image) throw new Error('The try-on finished but sent no image.');
  cacheSet(key, r.image);
  return r.image;
}

// Optional Gemini product identify. Cached by photo hash so each photo is sent at most once.
export async function smartIdentify(dataUrl) {
  const key = `mm:id1:${await hashString(dataUrl)}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const out = await request('POST', '/api/identify', { image: dataUrl });
  cacheSet(key, out);
  return out;
}
