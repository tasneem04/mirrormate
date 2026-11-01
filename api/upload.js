// POST /api/upload  { image: "data:image/jpeg;base64,..." }  ->  { fileId }
// Uploads the selfie to YouCam once. The browser reuses the fileId for every task.
import { uploadImage } from './_youcam.js';
import { checkPasscode } from './_guard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkPasscode(req, res)) return;
  try {
    const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(req.body?.image || '');
    if (!m) return res.status(400).json({ error: 'Send a JPEG or PNG data URL in "image"' });
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Image too large' });
    const fileId = await uploadImage(buffer, m[1]);
    res.status(200).json({ fileId });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
}
