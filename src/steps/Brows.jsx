// Step 5: eyebrows, step by step. 1) map the shape with start / arch / end guide lines drawn
// from the face landmarks, 2) outline and fill with light strokes, 3) blend with a spoolie,
// 4) set with gel. Each step has a YouCam eyebrow try-on picture (intensity rising per step)
// and the same color-grid check as the eye coach, applied to the brow zone (lib/browCoach.js).
// No camera (or "Practice"): the check runs on the sample face, fading from one step picture
// to the next.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera, snapshot } from '../lib/camera.js';
import { loadTrackers, pickBrushHand, nextTs } from '../lib/tracking.js';
import { doneTracker } from '../lib/zoneCompare.js';
import {
  browGeometry, sampleBrows, blendBrowSamples, expectedBrows, compareBrows, judgeMap, judgeBrow,
} from '../lib/browCoach.js';
import { demoBrowImages, liveBrowImages, liveBrowCost, loadBrowSamples } from '../lib/stageImages.js';
import { BROW_STAGES, BROW_SHADES, BROW_HAIR_LABEL, browShade } from '../../shared/brows.js';
import { demo } from '../lib/api.js';
import EyeCrop from './EyeCrop.jsx';
import { speak, stopSpeaking } from '../lib/speech.js';

const HOLD_MS = 1500;
const CHECK_EVERY_MS = 250;
const HAND_AWAY_MS = 800;
const PRACTICE_MS = 6000;
const GUIDE = { start: 'Start', arch: 'Arch', end: 'End' };
const pctTxt = (v) => `${Math.round((v || 0) * 100)}%`;

// Hand over a brow? Then the pencil hides it and the check waits.
function handNearBrows(hand, face, w, h) {
  if (!hand || !face) return false;
  return [[55, 46], [285, 276]].some(([a, b]) => {
    const cx = (face[a].x + face[b].x) / 2 * w, cy = (face[a].y + face[b].y) / 2 * h;
    const r = Math.hypot((face[a].x - face[b].x) * w, (face[a].y - face[b].y) * h) * 0.9;
    return hand.some((p) => Math.hypot(p.x * w - cx, p.y * h - cy) < r);
  });
}

// Start, arch and end guide lines on both brows (dashed), with labels on the map step.
function drawGuides(canvas, w, h, face, stage, mirror) {
  if (!canvas) return;
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!face) return;
  const lw = Math.max(2, w / 450);
  g.lineCap = 'round';
  for (const side of ['right', 'left']) {
    const geo = browGeometry(face, side, w, h);
    if (stage === 'map') {
      // Faint outline of the brow itself.
      g.setLineDash([]);
      g.beginPath();
      [...geo.upper, ...[...geo.lower].reverse()].forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.lineWidth = lw * 0.7;
      g.stroke();
    }
    for (const [k, line] of Object.entries(geo.guides)) {
      g.setLineDash([lw * 3, lw * 2]);
      g.beginPath();
      g.moveTo(line.a.x, line.a.y);
      g.lineTo(line.b.x, line.b.y);
      g.strokeStyle = k === 'arch' ? 'rgba(194, 87, 122, 0.95)' : 'rgba(255, 255, 255, 0.9)';
      g.lineWidth = lw * (stage === 'map' ? 1.4 : 0.9);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(line.at.x, line.at.y, lw * 2.2, 0, Math.PI * 2);
      g.fillStyle = k === 'arch' ? '#c2577a' : '#fff';
      g.fill();
      if (stage === 'map') {
        // The canvas may be mirrored with the video; flip the text back so it reads normally.
        g.save();
        g.translate(line.b.x, line.b.y - lw * 3);
        if (mirror) g.scale(-1, 1);
        g.font = `700 ${Math.round(lw * 6)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = lw * 1.5;
        g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        g.strokeText(GUIDE[k], 0, 0);
        g.fillStyle = '#fff';
        g.fillText(GUIDE[k], 0, 0);
        g.restore();
      }
    }
  }
}

function BrowCheck({ check, stage, beforeSet, practice, onRetake }) {
  const c = check?.c;
  return (
    <div className="card check" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Brow check</h3>
        {!practice && stage !== 'map' && <button className="btn ghost small" onClick={onRetake}>Retake before</button>}
      </div>
      {stage === 'map' && (check?.notes?.length
        ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{check.notes.map((n) => <li key={n.id + n.text}>{n.text}</li>)}</ul>
        : <p className="small muted" style={{ margin: 0 }}>Look straight at the camera. The lines show where your brow should start, peak and end.</p>)}
      {stage !== 'map' && !beforeSet && <p className="small muted" style={{ margin: 0 }}>Look at the camera with your hands down: I'll save a "before" picture of your bare brows.</p>}
      {stage !== 'map' && beforeSet && !c && <p className="small muted" style={{ margin: 0 }}>Before saved. Add color, then lower the pencil and look at the camera.</p>}
      {stage !== 'map' && c && (
        <div className="bars">
          {[['Right brow', c.right], ['Left brow', c.left]].map(([name, e]) => (
            <React.Fragment key={name}>
              <span>{name}</span>
              <span className="bar"><i className={check.j.ok ? 'ok' : ''} style={{ width: pctTxt(Math.min(1, e.coverage)) }} /></span>
              <span>{pctTxt(e.coverage)}</span>
            </React.Fragment>
          ))}
          <span>Tail</span><span className="small muted" style={{ gridColumn: 'span 2' }}>{[c.right, c.left].map((e) => (e.tail == null ? '—' : e.tail < e.targetTail - 0.12 ? 'short' : e.tail > e.targetTail + 0.14 ? 'long' : 'right')).join(' / ')}</span>
          <span>Arch</span><span className="small muted" style={{ gridColumn: 'span 2' }}>{[c.right, c.left].map((e) => (e.peak == null ? '—' : Math.abs(e.peak - e.targetPeak) <= 0.18 ? 'right' : e.peak < e.targetPeak ? 'too far in' : 'too far out')).join(' / ')}</span>
        </div>
      )}
    </div>
  );
}

export default function Brows({ session, update, next, back }) {
  const { mode, profile, eyeFocus } = session;
  const live = mode === 'live';
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const practiceRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [images, setImages] = useState(() => (live ? { map: session.goalSteps?.bare || session.selfie } : demoBrowImages()));
  const [data, setData] = useState(null);       // { face, images, samples }
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState('');
  const [tip, setTip] = useState(null);
  const [check, setCheck] = useState(null);
  const [beforeSet, setBeforeSet] = useState(false);
  const [passed, setPassed] = useState({});
  const [practice, setPractice] = useState(false);
  const [camError, setCamError] = useState('');
  const [status, setStatus] = useState('Opening the camera...');
  const [voice, setVoice] = useState(true);

  const stage = BROW_STAGES[idx].id;
  const stageRef = useRef(stage);
  const voiceRef = useRef(voice);
  const dataRef = useRef(null);
  const practiceOn = useRef(false);
  const shownRef = useRef({ tip: null, at: 0 });
  const countsRef = useRef({});
  const passedRef = useRef({});
  const streamRef = useRef(null);
  // before = bare brows, captured once for the whole section (every step compares to it).
  const cmpRef = useRef({ before: null, n: 0, acc: null, now: null, expected: null, done: doneTracker(), lastCheck: 0, lastHand: 0, result: null, t0: 0 });

  const hasPictures = BROW_STAGES.slice(1).every((s) => images[s.id]);
  const shade = profile ? browShade(profile.browHex, profile.depth) : null;

  useEffect(() => { voiceRef.current = voice; if (!voice) stopSpeaking(); }, [voice]);

  useEffect(() => {
    let alive = true;
    loadBrowSamples(images).then((d) => { if (alive && d) { dataRef.current = d; setData(d); } }).catch((e) => console.warn('brow images', e));
    return () => { alive = false; };
  }, [images]);

  function resetStep(keepBefore = true) {
    const st = cmpRef.current;
    const d = dataRef.current;
    const expected = d && stage !== 'map' && d.samples.map && d.samples[stage] ? expectedBrows(d.samples.map, d.samples[stage]) : null;
    const before = practiceOn.current && d ? d.samples.map : keepBefore ? st.before : null;
    cmpRef.current = { before, n: 0, acc: null, now: null, expected, done: doneTracker(), lastCheck: 0, lastHand: 0, result: null, t0: performance.now() };
    setBeforeSet(Boolean(before));
    setCheck(null);
  }
  useEffect(() => { practiceOn.current = practice; resetStep(!practice); }, [idx, data, practice]);

  useEffect(() => {
    stageRef.current = stage;
    shownRef.current = { tip: null, at: 0 };
    setTip(null);
    const s = BROW_STAGES[idx];
    if (voiceRef.current) speak(`${s.title}. ${s.tip}`, { minGapMs: 0 });
  }, [idx]);

  function showTip(t, now) {
    if (!t) return;
    const shown = shownRef.current;
    if (shown.tip?.id === t.id) return;
    if (shown.tip && now - shown.at < HOLD_MS) return;
    shownRef.current = { tip: t, at: now };
    setTip(t);
    if (t.level === 'fix') countsRef.current[t.id] = (countsRef.current[t.id] || 0) + 1;
    if (voiceRef.current && t.level !== 'info') speak(t.text);
  }

  // One check on a frame (ImageData + its landmarks).
  function runCheck(img, face, now) {
    const s = stageRef.current;
    const st = cmpRef.current;
    if (s === 'map') {
      const j = judgeMap(browGeometry(face, 'right', img.width, img.height), browGeometry(face, 'left', img.width, img.height));
      setCheck({ notes: j.notes, j });
      st.result = j;
      return j;
    }
    const cur = sampleBrows(img, face);
    if (!st.before) {
      st.n += 1;
      st.acc = blendBrowSamples(st.acc, cur, 1 / st.n);
      if (st.n >= 3) { st.before = st.acc; setBeforeSet(true); }
      return null;
    }
    st.now = blendBrowSamples(st.now, cur, 0.5);
    const c = compareBrows(st.before, st.now, st.expected);
    const j = judgeBrow(s, c);
    const done = st.done(j.ok, now);
    st.result = j;
    if (done && !passedRef.current[s]) {
      passedRef.current = { ...passedRef.current, [s]: true };
      setPassed(passedRef.current);
      if (voiceRef.current) speak('Step done. Nice work.', { minGapMs: 0 });
    }
    setCheck({ c, j, done: done || Boolean(passedRef.current[s]) });
    return j;
  }

  // Camera loop.
  useEffect(() => {
    let alive = true, raf = 0;
    const video = videoRef.current;
    const grab = document.createElement('canvas');
    (async () => {
      streamRef.current = await startCamera(video);
      setStatus('Loading face tracking...');
      const { face, hand } = await loadTrackers();
      if (!alive) return;
      setStatus('');
      let lastTime = -1, frame = 0, hands = null;
      const loop = () => {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        if (practiceOn.current) return;
        if (video.currentTime === lastTime || !video.videoWidth) return;
        lastTime = video.currentTime;
        const now = performance.now();
        const faceLm = face.detectForVideo(video, nextTs()).faceLandmarks?.[0] || null;
        if (frame++ % 2 === 0) hands = hand.detectForVideo(video, nextTs()).landmarks;
        const w = video.videoWidth, h = video.videoHeight;
        const st = cmpRef.current;
        const near = handNearBrows(pickBrushHand(hands, faceLm), faceLm, w, h);
        if (near) st.lastHand = now;
        if (faceLm && !near && now - st.lastCheck > CHECK_EVERY_MS) {
          st.lastCheck = now;
          if (grab.width !== w) { grab.width = w; grab.height = h; }
          const g = grab.getContext('2d', { willReadFrequently: true });
          g.drawImage(video, 0, 0, w, h);
          runCheck(g.getImageData(0, 0, w, h), faceLm, now);
        }
        if (st.result?.tip && now - st.lastHand > HAND_AWAY_MS) showTip(st.result.tip, now);
        drawGuides(canvasRef.current, w, h, faceLm, stageRef.current, true);
      };
      loop();
    })().catch((e) => { console.error(e); setCamError('Could not start the camera or tracking.'); });
    return () => { alive = false; cancelAnimationFrame(raf); stopCamera(streamRef.current); stopSpeaking(); };
  }, []);

  useEffect(() => { if (camError && data) setPractice(true); }, [camError, data]);

  // Practice: fade from the previous step picture to this one and run the same check.
  useEffect(() => {
    if (!practice || !data) return;
    let alive = true, raf = 0;
    const canvas = practiceRef.current;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const s = stageRef.current;
      const i = BROW_STAGES.findIndex((x) => x.id === s);
      const from = data.images[BROW_STAGES[Math.max(0, i - 1)].id] || data.images.map;
      const to = data.images[s];
      if (!from) return;
      const w = from.naturalWidth, h = from.naturalHeight;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const now = performance.now();
      const st = cmpRef.current;
      const a = s === 'map' ? 0 : Math.min(1, Math.max(0, (now - st.t0 - 800) / PRACTICE_MS));
      g.globalAlpha = 1;
      g.drawImage(from, 0, 0, w, h);
      if (to && a > 0) { g.globalAlpha = a; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
      if (now - st.lastCheck > CHECK_EVERY_MS * 2) {
        st.lastCheck = now;
        const j = runCheck(g.getImageData(0, 0, w, h), data.face, now);
        if (j?.tip) showTip(j.tip, now);
      }
      drawGuides(canvasRef.current, w, h, data.face, s, false);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [practice, data]);

  async function makePictures() {
    setMaking(true); setMakeError('');
    try {
      const out = await liveBrowImages({ session, onImage: (s, url) => setImages((m) => ({ ...m, [s]: url })) });
      setImages((m) => ({ ...m, ...out }));
    } catch (e) {
      setMakeError(e.message || 'Could not make the brow pictures.');
    } finally {
      setMaking(false);
    }
  }

  function finish(skip = false) {
    if (!skip) {
      const after = practice && practiceRef.current?.width ? practiceRef.current.toDataURL('image/jpeg', 0.9)
        : videoRef.current?.videoWidth ? snapshot(videoRef.current, { maxSide: 1280 }) : null;
      const log = session.coachLog || { counts: {} };
      const counts = { ...(log.counts || {}) };
      for (const [k, n] of Object.entries(countsRef.current)) counts[k] = (counts[k] || 0) + n;
      update({ ...(after ? { after } : {}), coachLog: { ...log, counts, browsPassed: { ...passedRef.current } } });
    }
    next();
  }

  const info = BROW_STAGES[idx];
  const last = idx === BROW_STAGES.length - 1;
  const stepPic = images[stage] || null;
  const otherDemoFace = !live && demo.id !== 'face-1';

  return (
    <section className="coach">
      <div className="stack">
        <div className="cam" style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} className="mirror" style={{ visibility: practice ? 'hidden' : 'visible' }} />
          {practice && <canvas ref={practiceRef} className="practice" />}
          <canvas ref={canvasRef} className={`overlay ${practice ? '' : 'mirror'}`} />
          {stepPic && stage !== 'map' && (
            <div className="goal-pip step">
              <EyeCrop src={stepPic} focus={eyeFocus} aspect={2} alt={`Goal for ${info.title}`} />
              <span>Goal: {info.title}</span>
            </div>
          )}
          {check?.done && <div className="done-badge">✓ Step done</div>}
          {practice && <div className="hint" style={{ top: 'auto', bottom: 10 }}>Practice: sample face, {stage === 'map' ? 'guide lines' : 'adding brow color'}</div>}
          {status && !practice && <div className="hint" role="status">{status}</div>}
        </div>
        <div className={`tip ${tip?.level || 'info'}`} role="status" aria-live="polite">
          {tip ? tip.text : info.tip}
        </div>
        {camError && <p className="error" role="alert">{camError} {data ? 'Showing practice on the sample face instead.' : 'Allow camera access and reload.'}</p>}
        <p className="small muted" style={{ margin: 0 }}>
          Dashed lines: <strong>start</strong> (nose wing straight up past the inner eye corner), <strong>arch</strong> (nose wing through the outer edge of the iris) and <strong>end</strong> (nose wing past the outer eye corner).
        </p>
      </div>

      <aside className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Brows step by step</h3>
          <div className="strip" style={{ padding: 0 }}>
            {BROW_STAGES.map((s, i) => (
              <figure key={s.id} style={{ cursor: 'pointer', opacity: i === idx ? 1 : 0.7 }} onClick={() => setIdx(i)}>
                {images[s.id] ? <EyeCrop src={images[s.id]} focus={eyeFocus} aspect={1.6} alt={`${i + 1}. ${s.title}`} /> : <div className="card small muted" style={{ aspectRatio: '1.6', display: 'grid', placeItems: 'center' }}>—</div>}
                <figcaption>{passed[s.id] ? '✓ ' : ''}{i + 1}. {s.title.split(' ')[0]}</figcaption>
              </figure>
            ))}
          </div>
          <p className="small" style={{ margin: 0 }}><strong>{idx + 1} of 4 · {info.title}.</strong> {info.tip}</p>
          <p className="small muted" style={{ margin: 0 }}><strong>Tool:</strong> {info.tool}</p>
          {otherDemoFace && <p className="small muted" style={{ margin: 0 }}>Brow step pictures are saved for sample 1 only. The guide lines and the check still work here.</p>}
          {live && !hasPictures && (
            <button className="btn ghost small" disabled={making} onClick={makePictures}>
              {making ? 'Making brow pictures...' : `Make my brow step pictures (${liveBrowCost()} units)`}
            </button>
          )}
          {makeError && <p className="error small" style={{ margin: 0 }}>{makeError}</p>}
          <div className="actions">
            {!last && <button className={`btn big ${check?.done ? 'good' : ''}`} onClick={() => setIdx((i) => i + 1)}>Next step</button>}
            {last && <button className="btn big" onClick={() => finish(false)}>Finish and take photo</button>}
            {idx > 0 && <button className="btn ghost small" onClick={() => setIdx((i) => i - 1)}>Previous</button>}
            <button className="btn ghost small" onClick={() => finish(true)}>Skip brows</button>
          </div>
        </div>

        <BrowCheck check={check} stage={stage} beforeSet={beforeSet} practice={practice} onRetake={() => resetStep(false)} />

        {shade && (
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Your brow shade</h3>
            <div className="row" style={{ gap: 10 }}>
              <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, background: shade.hex, border: '1px solid #0002' }} />
              <span className="small">{shade.name} ({shade.hex}), for {BROW_HAIR_LABEL[shade.hair]} brows on {profile.depth} skin. One shade lighter than your hair looks softest; never darker.</span>
            </div>
            <details className="small">
              <summary>Shades for other hair colors ({profile.depth} skin)</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {Object.entries(BROW_SHADES).map(([hair, row]) => {
                  const s = row[profile.depth] || row.medium;
                  return <li key={hair}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: s.hex, marginRight: 6 }} />{BROW_HAIR_LABEL[hair]}: {s.name}</li>;
                })}
              </ul>
            </details>
          </div>
        )}

        <div className="card row small">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice tips
          </label>
          {data && !camError && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> Practice on the sample face
            </label>
          )}
          <button className="btn ghost small" onClick={back}>Back</button>
        </div>
      </aside>
    </section>
  );
}
