// Step 5: before / goal / after side by side, plus 2-3 tips for next time from the coach log.
import React from 'react';
import { NEXT_TIME } from '../lib/coachRules.js';
import { fileToDataUrl } from '../lib/camera.js';

// Pick the tips to show: the fixes the coach gave most often, then a symmetry note.
function nextTimeTips(log) {
  const counts = log?.counts || {};
  const tips = Object.entries(counts)
    .filter(([id]) => NEXT_TIME[id])
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => NEXT_TIME[id]);
  const { right = {}, left = {} } = log?.eyeStats || {};
  if (right.wingAngle != null && left.wingAngle != null && Math.abs(right.wingAngle - left.wingAngle) > 8) {
    tips.push(NEXT_TIME.wing_sym);
  }
  if (!tips.length) tips.push('Great control today! Next time, try the same look a little faster, or move on to the next look.');
  return [...new Set(tips)].slice(0, 3);
}

// Draw the three photos side by side into one image to download.
async function downloadTrio(srcs) {
  const imgs = await Promise.all(srcs.map((src) => new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  })));
  const W = 480, H = 640, PAD = 16, LABEL = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W * 3 + PAD * 4;
  canvas.height = H + PAD * 2 + LABEL;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fbf7f5';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = 'bold 24px "DM Sans", sans-serif';
  g.textAlign = 'center';
  ['Before', 'Goal', 'After'].forEach((label, k) => {
    const x = PAD + k * (W + PAD);
    const img = imgs[k];
    if (img) {
      // cover-fit into W x H
      const s = Math.max(W / img.width, H / img.height);
      const sw = W / s, sh = H / s;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, PAD, W, H);
    }
    g.fillStyle = '#2a2326';
    g.fillText(label, x + W / 2, PAD + H + 34);
  });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.9);
  a.download = 'mirrormate-result.jpg';
  a.click();
}

export default function Finish({ session, update, restart }) {
  const { selfie, goal, after, look, coachLog } = session;
  const tips = nextTimeTips(coachLog);
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && update) update({ after: await fileToDataUrl(f, 1280) });
  }

  return (
    <section className="stack">
      <div>
        <h2>You did it!</h2>
        <p className="muted">Here is your {look?.name.toLowerCase()} next to the goal.</p>
      </div>
      <div className="trio">
        <figure><img src={selfie} alt="Before" /><figcaption>Before</figcaption></figure>
        <figure><img src={goal} alt="Goal look" /><figcaption>Goal</figcaption></figure>
        <figure className="after">{after ? <img src={after} alt="After" /> : <div className="card">No photo</div>}<figcaption>After</figcaption></figure>
      </div>
      <div className="card stack">
        <h3>Tips for next time</h3>
        <ol className="numbered">
          {tips.map((t) => <li key={t}>{t}</li>)}
        </ol>
      </div>
      <div className="actions">
        <button className="btn big" onClick={() => downloadTrio([selfie, goal, after])}>Save the comparison</button>
        <label className="btn ghost">
          {after ? 'Use a different after photo' : 'Upload your after photo'}
          <input type="file" accept="image/jpeg,image/png" hidden onChange={onFile} />
        </label>
        <button className="btn ghost" onClick={restart}>Try another look</button>
      </div>
    </section>
  );
}
