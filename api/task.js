// POST /api/task  { type: "skin"|"tone"|"face"|"vto", fileId, lookId?, undertone? }  ->  { taskId }
// GET  /api/task?type=...&id=...  ->  { status, results, error, image? }
// The browser polls GET every 2 s. For a finished try-on, the server downloads the result
// image and returns it as a data URL, so the browser can cache it (YouCam URLs expire).
import { startTask, getTask, vtoImageUrl, TASKS } from './_youcam.js';
import { checkPasscode } from './_guard.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      if (!checkPasscode(req, res)) return;
      const { type, fileId, lookId, undertone, depth, stage } = req.body || {};
      if (!TASKS[type] || !fileId) return res.status(400).json({ error: 'Need a valid type and fileId' });
      const taskId = await startTask(type, fileId, { lookId, undertone, depth, stage });
      return res.status(200).json({ taskId });
    }

    if (req.method === 'GET') {
      const { type, id } = req.query;
      if (!TASKS[type] || !id) return res.status(400).json({ error: 'Need a valid type and id' });
      const r = await getTask(type, id);
      if (type === 'vto' && r.status === 'success') {
        const url = vtoImageUrl(r.results);
        if (url) {
          const img = await fetch(url);
          const mime = img.headers.get('content-type') || 'image/jpeg';
          r.image = `data:${mime};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
        }
      }
      return res.status(200).json(r);
    }

    res.status(405).json({ error: 'GET or POST only' });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
}
