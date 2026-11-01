// Small YouCam API client. Runs on the server only: it reads YOUCAM_API_KEY.
// Docs: https://docs.perfectcorp.com/develop/introduction
//
// Flow for every feature:
//   1. POST /s2s/v2.0/file           -> file_id + a pre-signed upload URL
//   2. PUT the image bytes to that URL
//   3. POST /s2s/<ver>/task/<type>    -> task_id
//   4. GET  /s2s/<ver>/task/<type>/<task_id> until task_status is success or error
// Units are only charged when a task succeeds.

import { buildEffects, LOOK_IDS, UNDERTONES } from '../shared/looks.js';

const BASE = 'https://yce-api-01.makeupar.com';

// Whitelist of task types this app may run. The server builds each request body,
// so a visitor can't spend units on anything else. Unit cost in comments.
export const TASKS = {
  // 4 SD concerns = 9 units. Needs a face photo with a short side of at least 480 px.
  skin: {
    path: '/s2s/v2.1/task/skin-analysis',
    body: (fileId) => ({
      src_file_id: fileId,
      dst_actions: ['skin_type', 'oiliness', 'moisture', 'dark_circle_v2'],
      format: 'json',
    }),
  },
  // Skin, eye, brow, lip and hair color as hex = 20 units.
  tone: {
    path: '/s2s/v2.0/task/skin-tone-analysis',
    body: (fileId) => ({ src_file_id: fileId, face_angle_strictness_level: 'medium' }),
  },
  // 5 face features = 10 units.
  face: {
    path: '/s2s/v2.0/task/face-attr-analysis',
    body: (fileId) => ({
      src_file_id: fileId,
      face_angle_strictness_level: 'medium',
      features: ['faceShape', 'eyeShape', 'eyelid', 'eyeAngle', 'eyebrowShape'],
    }),
  },
  // Makeup virtual try-on = 1 unit.
  vto: {
    path: '/s2s/v2.0/task/makeup-vto',
    body: (fileId, { lookId, undertone }) => {
      if (!LOOK_IDS.includes(lookId)) throw new Error('Unknown look');
      if (!UNDERTONES.includes(undertone)) throw new Error('Unknown undertone');
      return { src_file_id: fileId, effects: buildEffects(lookId, undertone), version: '1.0' };
    },
  },
};

function apiKey() {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new Error('YOUCAM_API_KEY is not set (see .env.example)');
  return key;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`YouCam ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Upload a JPEG/PNG buffer. Returns the file_id used by every task.
export async function uploadImage(buffer, contentType = 'image/jpeg') {
  const fileName = contentType === 'image/png' ? 'selfie.png' : 'selfie.jpg';
  const json = await call('POST', '/s2s/v2.0/file', {
    files: [{ content_type: contentType, file_name: fileName, file_size: buffer.length }],
  });
  const file = json?.data?.files?.[0] ?? json?.files?.[0];
  const req = file?.requests?.[0] ?? file?.requests;
  if (!file?.file_id || !req?.url) throw new Error('Unexpected file API response: ' + JSON.stringify(json).slice(0, 300));

  const put = await fetch(req.url, {
    method: req.method || 'PUT',
    headers: { 'Content-Type': contentType, ...(req.headers || {}) },
    body: buffer,
  });
  if (!put.ok) throw new Error(`Image upload failed: ${put.status}`);
  return file.file_id;
}

// Start a whitelisted task. Returns the task_id.
export async function startTask(type, fileId, opts = {}) {
  const task = TASKS[type];
  if (!task) throw new Error(`Unknown task type: ${type}`);
  const json = await call('POST', task.path, task.body(fileId, opts));
  const taskId = json?.data?.task_id;
  if (!taskId) throw new Error('No task_id in response: ' + JSON.stringify(json).slice(0, 300));
  return taskId;
}

// Check a task once. Returns { status: 'running'|'success'|'error', results, error }.
export async function getTask(type, taskId) {
  const task = TASKS[type];
  if (!task) throw new Error(`Unknown task type: ${type}`);
  const json = await call('GET', `${task.path}/${encodeURIComponent(taskId)}`);
  const d = json?.data || {};
  return {
    status: d.task_status || 'running',
    results: d.results ?? null,
    error: d.error || d.failure_reason || null,
    errorMessage: d.error_message || null,
  };
}

// Poll until done (used by the spike script; the browser polls through /api/task).
export async function waitForTask(type, taskId, { intervalMs = 2000, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await getTask(type, taskId);
    if (r.status === 'success' || r.status === 'error') return r;
    await new Promise((ok) => setTimeout(ok, intervalMs));
  }
  throw new Error(`Task ${type} timed out`);
}

// Pull the result image URL out of a try-on result (docs show two shapes).
export function vtoImageUrl(results) {
  if (!results) return null;
  if (Array.isArray(results)) return results[0]?.download_url || results[0]?.url || null;
  return results.url || results.download_url || null;
}

// Current unit balance (free call).
export async function getUnits() {
  const json = await call('GET', '/s2s/v1.0/client/credit');
  return (json.results || []).map((r) => ({ type: r.type, amount: r.amount_dec ?? r.amount }));
}
