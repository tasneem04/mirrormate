// Step 4: the live coach. Webcam + face/hand tracking in the browser, guide lines drawn over
// your eyes, and short tips (text + optional voice) from the rules in lib/coachRules.js.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera, snapshot, brightness } from '../lib/camera.js';
import { loadTrackers, pickBrushHand } from '../lib/tracking.js';
import {
  coachTip, newHistory, eyeFrame, creaseLine, creaseHeight, toolPoint, STEP_INFO, stepHow,
} from '../lib/coachRules.js';
import { speak, stopSpeaking } from '../lib/speech.js';

const LEVEL_COLOR = { good: '#23885d', fix: '#e08a2b', info: '#9aa3b2' };
const HOLD_MS = 1500; // keep each tip on screen at least this long

// Draw the guide for the current step over both eyes, plus the tool dot.
// Drawn in raw camera pixels; the canvas is mirrored with CSS like the video.
function drawOverlay(canvas, video, face, hand, step, ctx) {
  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!face) return;
  const lw = Math.max(2, w / 400);
  g.lineCap = 'round';
  for (const side of ['right', 'left']) {
    const f = eyeFrame(face, side, w, h);
    const crease = creaseLine(f, creaseHeight(ctx.profile));
    g.setLineDash([]);
    if (step === 'base') {
      // Fill the lid zone: from the lash line up to the crease.
      g.beginPath();
      f.upperLid.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      [...crease].reverse().forEach((p) => g.lineTo(p.x, p.y));
      g.closePath();
      g.fillStyle = 'rgba(194, 87, 122, 0.22)';
      g.fill();
    } else if (step === 'outer') {
      // Outer third of the lid zone (upperLid and crease points run outer -> inner).
      const lid = f.upperLid.slice(0, 4);
      const top = crease.slice(0, 4);
      g.beginPath();
      lid.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      [...top].reverse().forEach((p) => g.lineTo(p.x, p.y));
      g.closePath();
      g.fillStyle = 'rgba(120, 50, 70, 0.35)';
      g.fill();
    } else if (step === 'crease') {
      g.beginPath();
      crease.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.setLineDash([lw * 4, lw * 3]);
      g.strokeStyle = 'rgba(194, 87, 122, 0.95)';
      g.lineWidth = lw * 1.5;
      g.stroke();
    } else if (step === 'liner') {
      g.beginPath();
      f.upperLid.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.strokeStyle = 'rgba(194, 87, 122, 0.9)';
      g.lineWidth = lw;
      g.stroke();
    } else if (step === 'wing') {
      // Target line from the outer lower lash toward the brow tail (60% of the way).
      const a = f.lowerOuter, b = f.browTail;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6);
      g.setLineDash([lw * 3, lw * 2]);
      g.strokeStyle = 'rgba(194, 87, 122, 0.95)';
      g.lineWidth = lw * 1.5;
      g.stroke();
    }
  }
  if (hand && step !== 'prep') {
    const t = toolPoint(hand, w, h, ctx.brushReach);
    g.setLineDash([]);
    g.beginPath();
    g.arc(t.x, t.y, lw * 4, 0, Math.PI * 2);
    g.fillStyle = LEVEL_COLOR[ctx.level] || LEVEL_COLOR.info;
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = lw;
    g.stroke();
  }
}

export default function LiveCoach({ session, update, next, back }) {
  const { look, goal, profile } = session;
  const steps = look.steps;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [tip, setTip] = useState(null);
  const [status, setStatus] = useState('Opening the camera...');
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(true);
  const [useBrush, setUseBrush] = useState(true);

  // Refs so the animation loop always sees the latest values without restarting.
  const stepRef = useRef(steps[0]);
  const voiceRef = useRef(voice);
  const reachRef = useRef(0.6);
  const historyRef = useRef(newHistory());
  const shownRef = useRef({ tip: null, at: 0 });
  const countsRef = useRef({});
  const streamRef = useRef(null);

  useEffect(() => { voiceRef.current = voice; if (!voice) stopSpeaking(); }, [voice]);
  useEffect(() => { reachRef.current = useBrush ? 0.6 : 0; }, [useBrush]);
  useEffect(() => {
    stepRef.current = steps[stepIdx];
    historyRef.current.samples = []; // fresh start for each step (eye stats are kept)
    shownRef.current = { tip: null, at: 0 };
    setTip(null);
    const info = STEP_INFO[steps[stepIdx]];
    if (voiceRef.current && info) speak(`${info.title}. ${stepHow(steps[stepIdx], profile)}`, { minGapMs: 0 });
  }, [stepIdx]);

  // Show a new tip, but hold each one for a moment so the text doesn't flicker.
  function showTip(t, now) {
    const shown = shownRef.current;
    if (shown.tip?.id === t.id) return;
    if (shown.tip && now - shown.at < HOLD_MS) return;
    shownRef.current = { tip: t, at: now };
    setTip(t);
    if (t.level === 'fix') countsRef.current[t.id] = (countsRef.current[t.id] || 0) + 1;
    if (voiceRef.current && t.level !== 'info') speak(t.text);
  }

  useEffect(() => {
    let alive = true;
    let raf = 0;
    const video = videoRef.current;
    (async () => {
      streamRef.current = await startCamera(video);
      setStatus('Loading face and hand tracking...');
      const { face, hand } = await loadTrackers();
      if (!alive) return;
      setStatus('');
      let lastTime = -1, frame = 0, hands = null, bright = null;
      const loop = () => {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        if (video.currentTime === lastTime || !video.videoWidth) return;
        lastTime = video.currentTime;
        const now = performance.now();
        const faceLm = face.detectForVideo(video, now).faceLandmarks?.[0] || null;
        // Hands every other frame keeps things smooth on slower laptops.
        const handFrame = frame % 2 === 0;
        if (handFrame) hands = hand.detectForVideo(video, now).landmarks;
        if (frame % 30 === 0) bright = brightness(video);
        frame++;
        const handLm = pickBrushHand(hands, faceLm);
        const ctx = {
          w: video.videoWidth, h: video.videoHeight, now, brightness: bright, profile,
          brushReach: reachRef.current, level: shownRef.current.tip?.level,
        };
        if (handFrame || !handLm) {
          const t = coachTip(stepRef.current, faceLm, handLm, historyRef.current, ctx);
          if (t) showTip(t, now);
        }
        drawOverlay(canvasRef.current, video, faceLm, handLm, stepRef.current, ctx);
      };
      loop();
    })().catch((e) => {
      console.error(e);
      setError('Could not start the camera or tracking. Allow camera access and reload.');
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopCamera(streamRef.current);
      stopSpeaking();
    };
  }, []);

  function finish() {
    const after = videoRef.current?.videoWidth ? snapshot(videoRef.current, { maxSide: 1280 }) : null;
    update({ after, coachLog: { counts: { ...countsRef.current }, eyeStats: historyRef.current.eyeStats } });
    next();
  }

  const step = steps[stepIdx];
  const info = STEP_INFO[step];
  const last = stepIdx === steps.length - 1;

  return (
    <section className="coach">
      <div className="stack">
        <div className="cam" style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} className="mirror" />
          <canvas ref={canvasRef} className="overlay mirror" />
          {goal && <div className="goal-pip"><img src={goal} alt="" /><span>Goal</span></div>}
          {status && <div className="hint" role="status">{status}</div>}
        </div>
        <div className={`tip ${tip?.level || 'info'}`} role="status" aria-live="polite">
          {tip ? tip.text : status ? 'Getting ready...' : stepHow(step, profile)}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {error && <button className="btn big ghost" onClick={finish}>No camera? Skip to the end (upload an after photo there)</button>}
        <p className="small muted" style={{ margin: 0 }}>
          The dot shows where the coach thinks your {useBrush ? 'brush tip' : 'fingertip'} is. The pink guide shows where to work.
        </p>
      </div>

      <aside className="stack">
        <div className="card goal stack">
          <h3>Your goal: {look.name}</h3>
          {goal && <img src={goal} alt={`${look.name} on your face`} />}
        </div>

        <div className="card stack">
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s} className={i === stepIdx ? 'on' : i < stepIdx ? 'done' : ''}>
                {i < stepIdx ? '✓ ' : `${i + 1}. `}{STEP_INFO[s].title}
              </li>
            ))}
          </ol>
          <p className="small" style={{ margin: 0 }}><strong>{stepIdx + 1} of {steps.length} · {info.title}:</strong> {stepHow(step, profile)}</p>
          <div className="actions">
            {!last && <button className="btn big" onClick={() => setStepIdx((i) => i + 1)}>Next step</button>}
            {last && <button className="btn big" onClick={finish}>Finish and take photo</button>}
            {stepIdx > 0 && <button className="btn ghost small" onClick={() => setStepIdx((i) => i - 1)}>Previous</button>}
          </div>
        </div>

        <div className="card row small">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice tips
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={useBrush} onChange={(e) => setUseBrush(e.target.checked)} /> I'm using a brush
          </label>
          <button className="btn ghost small" onClick={back}>Back</button>
        </div>
      </aside>
    </section>
  );
}
