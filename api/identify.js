// POST /api/identify { image: data URL } -> normalized product JSON (see normalizeIdentify).
// Optional "Smart identify" with Gemini Flash. Needs GEMINI_API_KEY; /api/config reports hasGemini.
import crypto from 'node:crypto';
import { checkPasscode } from './_guard.js';
import { PRODUCTS, normalizeIdentify, IDENTIFY_TRAITS } from '../src/lib/products.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const cache = new Map(); // sha256(image) -> result, so the same photo is never sent twice

const PROMPT = `You identify one eye-makeup product or tool in a photo. Read any visible label text.
Answer ONLY JSON with these keys:
type: one of ${PRODUCTS.map((p) => `"${p.id}" (${p.label})`).join(', ')}, or "not_eye" if it is not an eye product (lipstick, nail polish, face, etc.).
confidence: 0..1.
brand, name: from the label if visible, else "".
finish: matte, satin, shimmer, metallic, glitter, or "".
formula: e.g. waterproof, tubing, cream, powder, gel, liquid, pencil, or "".
goodFor, badFor: arrays from ${JSON.stringify(IDENTIFY_TRAITS)} (skin and eye types).
note: one short beginner tip for this product.
Mascara and liquid liner tubes look alike: check the wand or tip and the label words.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Smart identify is off (no GEMINI_API_KEY)' });
  if (!checkPasscode(req, res)) return;
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(req.body?.image || '');
  if (!m) return res.status(400).json({ error: 'Send a JPEG or PNG data URL in "image"' });
  if (m[2].length > 6 * 1024 * 1024) return res.status(413).json({ error: 'Image too large' });
  const hash = crypto.createHash('sha256').update(m[2]).digest('hex');
  if (cache.has(hash)) return res.status(200).json({ ...cache.get(hash), cached: true });
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || `Gemini ${r.status}`);
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
    const out = normalizeIdentify(JSON.parse(text));
    if (cache.size > 500) cache.clear();
    cache.set(hash, out);
    res.status(200).json(out);
  } catch (e) {
    console.error('identify:', e.message);
    res.status(502).json({ error: 'Smart identify failed. Try again.' });
  }
}
