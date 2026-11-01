# MirrorMate: a live eye-makeup coach

Beginners watch makeup tutorials but can't copy them. MirrorMate watches you **while** you do your
eyes and gives short live tips: "go higher", "blend more", "wing too low". Scope: eyes only
(eyeshadow and eyeliner).

Built for the **YouCam API Skin AI & eCommerce VTO Hackathon**.

**Live demo:** _add your Vercel link here_ · **Video:** _add link_

## How it works

1. **Skin scan.** Take or upload a selfie. The YouCam API reads your skin type, skin tone and eye
   shape. The app turns that into plain words, for example: "Undertone: warm. Bronze and copper
   suit you." It also says "Hooded lids: put crease color a little higher".
2. **Pick a look.** Three eye looks (soft natural, soft smoky, winged liner) are rendered **on your
   own selfie** with the YouCam makeup try-on API, in shades picked for your undertone. The one you
   pick becomes your goal picture.
3. **My makeup.** Hold your products and brushes up to the camera. A free image model running in
   your browser names the product type. Tap the shade and the app says whether it suits your
   skin. It also lists the tools the look needs that you're missing, with free swaps.
4. **Live coach.** The webcam view sits next to your goal picture. Face and hand tracking run in the
   browser. A pink guide shows where to work (lid zone, crease line, wing angle) and a dot shows
   where the coach thinks your brush tip is. Tips appear as text and, if you want, spoken aloud.
   Step by step: get ready, shadow base, crease, liner, wing.
5. **Finish.** Before / goal / after side by side, plus 2 or 3 tips for next time based on what the
   coach saw most.

## YouCam APIs used

| API | What MirrorMate uses it for | Units |
|---|---|---|
| **AI Skin Analysis** (`task/skin-analysis`, SD: skin_type, oiliness, moisture, dark_circle_v2) | Skin type, so the app can say "use a primer" or "moisturize first" | 9 |
| **AI Facial Color Tones Analyzer** (`task/skin-tone-analysis`) | Skin color, which the app turns into an undertone (warm/cool/neutral) and depth. These choose the try-on shades and the "does this shade suit you" checks | 20 |
| **AI Face Attributes Analyzer** (`task/face-attr-analysis`: faceShape, eyeShape, eyelid, eyeAngle, eyebrowShape) | Eye shape and lid type. Hooded lids move the coach's crease target higher, and the look recommendation uses them | 10 |
| **AI Makeup Virtual Try-On** (`task/makeup-vto`: eye_shadow + eye_liner) | Renders each look on the user's own selfie as the goal picture | 1 per look |

All calls go through a small server (`api/`) that holds the API key. The flow:
1. Upload the photo with `POST /s2s/v2.0/file`, then PUT it to the pre-signed URL.
2. Start a task with `POST /task/<type>`.
3. The browser polls `GET /task/<type>/<id>` every 2 seconds.

**Unit-saving:** one full run costs about 42 units.
- **Cache:** every result is cached in the browser by image hash, so the same photo is never paid
  for twice.
- **Demo mode:** uses saved results (`src/demo/`) and makes no YouCam calls.
- **Passcode:** on the public site, live calls can require a passcode (`LIVE_PASSCODE`).

## What runs where (no paid AI)

- **Face and hand tracking:** MediaPipe Face Landmarker + Hand Landmarker, in the browser (free).
- **Product recognition:** CLIP (`Xenova/clip-vit-base-patch32`, an open model from Hugging Face)
  through transformers.js, in the browser, zero-shot (no training). It downloads once (~90 MB).
- **Live tips:** simple rules in [`src/lib/coachRules.js`](src/lib/coachRules.js), covered by unit tests.
- **Voice:** the browser's built-in speech (Web Speech API).
- **Privacy:** the camera video never leaves the browser. Only the selfie goes to YouCam, and only in
  live mode.

### How the live tips work (and their honest limits)

The app can't see the makeup itself. It knows where your eyes, brows and hand are, so every tip
is about **where the brush is and how it moves**:

- **Zones:** for each eye it builds a frame. 0 is the lash line, 1 is the brow, and the crease
  sits at about 0.4 (0.5 for hooded lids).
- **Base and crease:** the brush height is compared to the zone ("go lower", "go higher").
- **Blending:** side-to-side direction changes are counted ("blend more").
- **Liner:** shake is measured as distance from a best-fit line ("steady hand").
- **Wing:** the stroke angle is compared to the line from the outer lower lash to the end of
  the brow ("wing too low").
- **Symmetry:** crease height and wing angle are compared between the two eyes.
- **No guessing:** if the hand isn't visible, it says so instead of guessing.

## Setup

Needs Node 20+.

```bash
npm install
cp .env.example .env      # then put your YouCam API key in .env
npm run dev               # http://localhost:5173
npm test                  # coach rule tests
```

Get a YouCam API key at https://yce.perfectcorp.com/ai-api (API Keys tab).

### Make demo data (optional, costs about 42 units once)

```bash
npm run spike -- path/to/selfie.jpg
```

This runs every YouCam call once on the selfie and saves the results to `src/demo/`. The app then
offers "Use the demo scan" with no further unit use. It skips anything already saved, so running it
again costs nothing. `npm run units` shows your unit balance.

## Deploy (Vercel, free)

1. Push this repo to GitHub and import it in Vercel. The framework is detected from `vercel.json`.
2. Add the environment variables `YOUCAM_API_KEY` and (recommended) `LIVE_PASSCODE`.
3. Deploy. `api/*.js` become serverless functions and the React app is served from `dist/`.

The site uses HTTPS, which the browser needs for camera access.

## Project layout

```
api/            serverless functions (hold the key): upload.js, task.js, config.js, _youcam.js client
server/dev.js   local dev server (same handlers + Vite)
shared/         looks.js (3 looks + try-on effects), color.js (Lab, undertone)
src/steps/      SkinScan, PickLook, MyMakeup, LiveCoach, Finish
src/lib/        api (cache/poll), camera, tracking, coachRules, products, productVision, skinSummary, speech
scripts/        spike-youcam.mjs (make demo data), units.mjs (unit balance)
test/           coach rule tests
```

## License

MIT, see [LICENSE](LICENSE).
