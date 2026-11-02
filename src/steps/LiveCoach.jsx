// Step 4: the live coach. Webcam + face/hand tracking in the browser, guide lines drawn over
// your eyes, and short tips (text + optional voice).
//   - While the brush is near the eye: motion tips from lib/coachRules.js.
//   - When the hand is away and the eyes are open: a color check of the eye zones vs a
//     "before" frame from the start of the step (lib/zoneCompare.js), against the expected
//     change taken from this step's goal image. It drives the tips and the "step done" check.
//   - No camera (or "Practice"): the same check runs on the sample face, which builds up from
//     the previous step image to this step's image, so the demo works without a webcam.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera, snapshot, brightness } from '../lib/camera.js';
import { loadTrackers, pickBrushHand, nextTs } from '../lib/tracking.js';
import { sampleFace, blendSamples, compareStep, judge, expectedFor, doneTracker, eyeOpen } from '../lib/zoneCompare.js';
import { loadGoalSamples, stepImages } from '../lib/stageImages.js';
import EyeCrop from './EyeCrop.jsx';
import {
  coachTip, newHistory, eyeFrame, creaseLine, creaseHeight, toolPoint, STEP_INFO, stepHow,
} from '../lib/coachRules.js';
import { speak, stopSpeaking } from '../lib/speech.js';

const LEVEL_COLOR = { good: '#23885d', fix: '#e08a2b', info: '#9aa3b2' };
const HOLD_MS = 1500; // keep each tip on screen at least this long
const CHECK_EVERY_MS = 200; // color check rate
const HAND_AWAY_MS = 800;   // the hand must be away this long before the color check talks
const PRACTICE_MS = 7000;   // practice: time to build up one step

// Is any hand point over or near an eye? Then the brush hides the lid and we skip the check.
function handNearEyes(hand, face, w, h) {
  if (!hand || !face) return false;
  return [[33, 133], [263, 362]].some(([a, b]) => {
    const cx = (face[a].x + face[b].x) / 2 * w, cy = (face[a].y + face[b].y) / 2 * h;
    const r = Math.hypot((face[a].x - face[b].x) * w, (face[a].y - face[b].y) * h) * 1.4;
    return hand.some((p) => Math.hypot(p.x * w - cx, p.y * h - cy) < r);
  });
}

const pctTxt = (v) => `${Math.round((v || 0) * 100)}%`;
function heightTxt(e) {
  if (e.height == null) return '—';
  const d = e.height - e.top;
  return d > 0.12 ? 'too high' : d < -0.15 ? 'low' : 'right';
}

function CheckPanel({ check, beforeSet, onRetake, practice }) {
  const c = check?.c;
  return (
    <div className="card check" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Live check</h3>
        {!practice && <button className="btn ghost small" onClick={onRetake}>Retake before</button>}
      </div>
      {!beforeSet && <p className="small muted" style={{ margin: 0 }}>Look at the camera with your eyes open and hands down: I'll save a "before" picture of your eyes.</p>}
      {beforeSet && !c && <p className="small muted" style={{ margin: 0 }}>Before saved. Apply, then lower the brush and look at the camera to check.</p>}
      {c && (
        <>
          <div className="bars">
            {[['Right eye', c.right], ['Left eye', c.left]].map(([name, e]) => (
              <React.Fragment key={name}>
                <span>{name}</span>
                <span className="bar"><i className={check.j.ok ? 'ok' : ''} style={{ width: pctTxt(Math.min(1, e.coverage)) }} /></span>
                <span>{pctTxt(e.coverage)}</span>
              </React.Fragment>
            ))}
          </div>
          <p className="small" style={{ margin: 0 }}>
            Height: {heightTxt(c.right)} / {heightTxt(c.left)} · Symmetry: {pctTxt(1 - c.symmetry.coverage)}
            {c.zone.blend && ` · Blend: ${[c.right.blend, c.left.blend].map((b) => (b == null ? '—' : b >= 0.5 ? 'soft' : 'harsh')).join(' / ')}`}
          </p>
          <p className="small muted" style={{ margin: 0 }}>{c.fromGoal ? 'Compared with the color change in your step image.' : 'Compared with the guide zone (no step image).'}</p>
          {check.done && <p style={{ margin: 0, color: '#23885d', fontWeight: 700 }}>✓ Step done</p>}
        </>
      )}
    </div>
  );
}

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
  const { look, goal, goalSteps, eyeFocus, profile } = session;
  const steps = look.steps;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const practiceRef = useRef(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [tip, setTip] = useState(null);
  const [status, setStatus] = useState('Opening the camera...');
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(true);
  const [useBrush, setUseBrush] = useState(true);
  const [goalData, setGoalData] = useState(null); // goal images as pixels + landmarks
  const [practice, setPractice] = useState(false);
  const [check, setCheck] = useState(null);       // { c, j, done }
  const [beforeSet, setBeforeSet] = useState(false);
  const [passed, setPassed] = useState({});       // step -> true once "step done"

  // Refs so the animation loop always sees the latest values without restarting.
  const stepRef = useRef(steps[0]);
  const voiceRef = useRef(voice);
  const reachRef = useRef(0.6);
  const historyRef = useRef(newHistory());
  const shownRef = useRef({ tip: null, at: 0 });
  const countsRef = useRef({});
  const streamRef = useRef(null);
  const goalRef = useRef(null);
  const practiceOn = useRef(false);
  const cmpRef = useRef({ before: null, expected: null, done: doneTracker(), lastCheck: 0, lastHand: 0, result: null, t0: 0 });
  const passedRef = useRef({});

  const images = goalSteps || {};
  const stepView = stepImages(look.id, steps[stepIdx], images, steps);

  useEffect(() => { voiceRef.current = voice; if (!voice) stopSpeaking(); }, [voice]);
  useEffect(() => { reachRef.current = useBrush ? 0.6 : 0; }, [useBrush]);

  // Load the goal images once (free, in the browser).
  useEffect(() => {
    let alive = true;
    if (goalSteps) loadGoalSamples(goalSteps).then((g) => { if (alive && g) { goalRef.current = g; setGoalData(g); } }).catch((e) => console.warn('goal images', e));
    return () => { alive = false; };
  }, [goalSteps]);

  // Fresh comparison state for each step (and when the goal images or the mode change).
  function resetCheck() {
    const step = steps[stepIdx];
    const g = goalRef.current;
    const { from, to, also } = stepImages(look.id, step, images, steps);
    const expected = g && from && to && g.samples[from] && g.samples[to]
      ? expectedFor(step, g.samples[from], g.samples[to], profile, also ? g.samples[also] : null) : null;
    cmpRef.current = {
      // Practice starts from the image the user would have at this point.
      before: practiceOn.current && g ? g.samples[also || from] || null : null,
      expected, done: doneTracker(), lastCheck: 0, lastHand: 0, result: null, t0: performance.now(), from: also || from, to,
    };
    setBeforeSet(Boolean(cmpRef.current.before));
    setCheck(null);
  }
  useEffect(() => { practiceOn.current = practice; resetCheck(); }, [stepIdx, goalData, practice]);

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

  // One color check: img = ImageData, face = landmarks of that image. Returns the judgment.
  function runCheck(img, face, now) {
    const step = stepRef.current;
    const st = cmpRef.current;
    if (step === 'prep') return null;
    const cur = sampleFace(img, face);
    // Before = average of the first 3 good frames; now = running average (less webcam noise).
    if (!st.before) {
      st.n = (st.n || 0) + 1;
      st.acc = blendSamples(st.acc, cur, 1 / st.n);
      if (st.n >= 3) { st.before = st.acc; setBeforeSet(true); }
      return null;
    }
    st.now = blendSamples(st.now, cur, 0.5);
    const c = compareStep(step, st.before, st.now, profile, st.expected);
    const j = judge(c);
    const done = st.done(j.ok, now);
    st.result = j;
    if (done && !passedRef.current[step]) {
      passedRef.current = { ...passedRef.current, [step]: true };
      setPassed(passedRef.current);
      if (voiceRef.current) speak('Step done. Nice work.', { minGapMs: 0 });
    }
    setCheck({ c, j, done: done || Boolean(passedRef.current[step]) });
    return j;
  }

  // Camera loop.
  useEffect(() => {
    let alive = true;
    let raf = 0;
    const video = videoRef.current;
    const grab = document.createElement('canvas');
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
        if (practiceOn.current) return;
        if (video.currentTime === lastTime || !video.videoWidth) return;
        lastTime = video.currentTime;
        const now = performance.now();
        const faceLm = face.detectForVideo(video, nextTs()).faceLandmarks?.[0] || null;
        // Hands every other frame keeps things smooth on slower laptops.
        const handFrame = frame % 2 === 0;
        if (handFrame) hands = hand.detectForVideo(video, nextTs()).landmarks;
        if (frame % 30 === 0) bright = brightness(video);
        frame++;
        const handLm = pickBrushHand(hands, faceLm);
        const w = video.videoWidth, h = video.videoHeight;
        const ctx = {
          w, h, now, brightness: bright, profile,
          brushReach: reachRef.current, level: shownRef.current.tip?.level,
        };
        const st = cmpRef.current;
        const near = handNearEyes(handLm, faceLm, w, h);
        if (near) st.lastHand = now;
        // Color check: hand away (the brush would hide the lid) and both eyes open.
        if (faceLm && !near && now - st.lastCheck > CHECK_EVERY_MS && eyeOpen(faceLm, 'right', w, h) && eyeOpen(faceLm, 'left', w, h)) {
          st.lastCheck = now;
          if (grab.width !== w) { grab.width = w; grab.height = h; }
          const g = grab.getContext('2d', { willReadFrequently: true });
          g.drawImage(video, 0, 0, w, h);
          runCheck(g.getImageData(0, 0, w, h), faceLm, now);
        }
        const checkTalks = st.result?.tip && now - st.lastHand > HAND_AWAY_MS;
        if (checkTalks) showTip(st.result.tip, now);
        else if (handFrame || !handLm) {
          const t = coachTip(stepRef.current, faceLm, handLm, historyRef.current, ctx);
          if (t) showTip(t, now);
        }
        drawOverlay(canvasRef.current, video, faceLm, handLm, stepRef.current, ctx);
      };
      loop();
    })().catch((e) => {
      console.error(e);
      setError('Could not start the camera or tracking.');
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopCamera(streamRef.current);
      stopSpeaking();
    };
  }, []);

  // No camera: switch to practice on the sample face once the goal images are ready.
  useEffect(() => { if (error && goalData) setPractice(true); }, [error, goalData]);

  // Practice loop: the "live" frame fades from the previous step image to this step's image,
  // and the same color check runs on it.
  useEffect(() => {
    if (!practice || !goalData) return;
    let alive = true, raf = 0;
    const canvas = practiceRef.current;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const st = cmpRef.current;
      const from = goalData.images[st.from], to = goalData.images[st.to];
      const base = from || to || goalData.images.bare || Object.values(goalData.images)[0];
      if (!base) return;
      const w = base.naturalWidth, h = base.naturalHeight;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const now = performance.now();
      const a = stepRef.current === 'prep' ? 0 : Math.min(1, Math.max(0, (now - st.t0 - 800) / PRACTICE_MS));
      g.globalAlpha = 1;
      g.drawImage(base, 0, 0, w, h);
      if (to && a > 0) { g.globalAlpha = a; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
      const ctx = { w, h, now, profile, brushReach: 0, level: shownRef.current.tip?.level };
      if (now - st.lastCheck > CHECK_EVERY_MS * 2) {
        st.lastCheck = now;
        const j = runCheck(g.getImageData(0, 0, w, h), goalData.face, now);
        if (j?.tip) showTip(j.tip, now);
      }
      drawOverlay(canvasRef.current, { videoWidth: w, videoHeight: h }, goalData.face, null, stepRef.current, ctx);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [practice, goalData]);

  function finish() {
    const after = practice && practiceRef.current?.width ? practiceRef.current.toDataURL('image/jpeg', 0.9)
      : videoRef.current?.videoWidth ? snapshot(videoRef.current, { maxSide: 1280 }) : null;
    update({ after, coachLog: { counts: { ...countsRef.current }, eyeStats: historyRef.current.eyeStats, passed: { ...passedRef.current } } });
    next();
  }

  const step = steps[stepIdx];
  const info = STEP_INFO[step];
  const last = stepIdx === steps.length - 1;
  const stepGoal = stepView.show || goal;
  const canPractice = Boolean(goalData);

  return (
    <section className="coach">
      <div className="stack">
        <div className="cam" style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} className="mirror" style={{ visibility: practice ? 'hidden' : 'visible' }} />
          {practice && <canvas ref={practiceRef} className="practice" />}
          <canvas ref={canvasRef} className={`overlay ${practice ? '' : 'mirror'}`} />
          {stepGoal && step !== 'prep' && (
            <div className="goal-pip step">
              <EyeCrop src={stepGoal} focus={eyeFocus} aspect={2} alt={`Goal for ${info.title}`} />
              <span>Goal: {info.title}</span>
            </div>
          )}
          {check?.done && <div className="done-badge">✓ Step done</div>}
          {practice && <div className="hint" style={{ top: 'auto', bottom: 10 }}>Practice: sample face, applying this step</div>}
          {status && !practice && <div className="hint" role="status">{status}</div>}
        </div>
        <div className={`tip ${tip?.level || 'info'}`} role="status" aria-live="polite">
          {tip ? tip.text : status && !practice ? 'Getting ready...' : stepHow(step, profile)}
        </div>
        {error && <p className="error" role="alert">{error} {canPractice ? 'Showing practice on the sample face instead.' : 'Allow camera access and reload.'}</p>}
        {error && !canPractice && <button className="btn big ghost" onClick={finish}>No camera? Skip to the end (upload an after photo there)</button>}
        <p className="small muted" style={{ margin: 0 }}>
          {practice ? 'The pink guide shows where to work. The check compares the eye colors with the step image.'
            : `The dot shows where the coach thinks your ${useBrush ? 'brush tip' : 'fingertip'} is. The pink guide shows where to work. Lower the brush and look at the camera to check a step.`}
        </p>
      </div>

      <aside className="stack">
        <div className="card goal stack">
          <h3>Goal for this step: {info.title}</h3>
          {stepGoal && <EyeCrop src={stepGoal} focus={eyeFocus} aspect={2.2} alt={`${info.title} on your face`} />}
          {stepGoal !== goal && goal && <p className="small muted" style={{ margin: 0 }}>Full look: {look.name}</p>}
          {stepGoal !== goal && goal && <EyeCrop src={goal} focus={eyeFocus} aspect={3} alt={`${look.name} on your face`} />}
        </div>

        {step !== 'prep' && <CheckPanel check={check} beforeSet={beforeSet} practice={practice} onRetake={resetCheck} />}

        <div className="card stack">
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s} className={`${i === stepIdx ? 'on' : i < stepIdx ? 'done' : ''} ${passed[s] ? 'passed' : ''}`}>
                {i < stepIdx ? '✓ ' : `${i + 1}. `}{STEP_INFO[s].title}
              </li>
            ))}
          </ol>
          <p className="small" style={{ margin: 0 }}><strong>{stepIdx + 1} of {steps.length} · {info.title}:</strong> {stepHow(step, profile)}</p>
          <div className="actions">
            {!last && <button className={`btn big ${check?.done ? 'good' : ''}`} onClick={() => setStepIdx((i) => i + 1)}>Next step</button>}
            {last && <button className="btn big" onClick={finish}>Finish and take photo</button>}
            {stepIdx > 0 && <button className="btn ghost small" onClick={() => setStepIdx((i) => i - 1)}>Previous</button>}
          </div>
        </div>

        <div className="card row small">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice tips
          </label>
          {!practice && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={useBrush} onChange={(e) => setUseBrush(e.target.checked)} /> I'm using a brush
            </label>
          )}
          {canPractice && !error && (
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
