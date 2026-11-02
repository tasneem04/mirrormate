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
import { sampleFace, blendSamples, compareStep, judge, expectedFor, doneTracker, eyeOpen, medianSamples, faceLight, glassesLikely, stepProgress, DARK_L } from '../lib/zoneCompare.js';
import { loadGoalSamples, stepImages } from '../lib/stageImages.js';
import BeforeAfter from './BeforeAfter.jsx';
import {
  coachTip, newHistory, eyeFrame, creaseLine, creaseHeight, toolPoint, STEP_INFO, stepHow, stepGuide,
} from '../lib/coachRules.js';
import { speak, stopSpeaking } from '../lib/speech.js';

const LEVEL_COLOR = { good: '#23885d', fix: '#e08a2b', info: '#9aa3b2' };
const HOLD_MS = 2500; // keep each tip on screen at least this long (no flicker)
const CHECK_EVERY_MS = 200; // color check rate
const HAND_AWAY_MS = 800;   // the hand must be away this long before the color check talks
const PRACTICE_MS = 7000;   // practice: time to build up one step
const STEADY_MS = 1000;     // face still this long before the before frames are taken
const BASE_FRAMES = 15;     // before = median of this many frames
const TIP = (id, text, level = 'info') => ({ id, text, level });
const TIP_HOLD = TIP('hold', 'Hold still and look at the camera, hands down. Taking a before picture…');
const TIP_DARK = TIP('dark', 'Too dark. Face a lamp or window so I can see your makeup.', 'fix');
const TIP_GLASSES = TIP('glasses', 'Glasses can confuse the check. Take them off if you can.', 'fix');

// Where the face is and how big: to know if it is still, or moved far from the before frame.
function facePose(face, w, h) {
  const a = face[33], b = face[263], n = face[1];
  return { x: n.x * w, y: n.y * h, size: Math.hypot((a.x - b.x) * w, (a.y - b.y) * h) || 1 };
}
const moved = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) / p.size + Math.abs(p.size - q.size) / p.size;

// Is any hand point over or near an eye? Then the brush hides the lid and we skip the check.
function handNearEyes(hand, face, w, h) {
  if (!hand || !face) return false;
  return [[33, 133], [263, 362]].some(([a, b]) => {
    const cx = (face[a].x + face[b].x) / 2 * w, cy = (face[a].y + face[b].y) / 2 * h;
    const r = Math.hypot((face[a].x - face[b].x) * w, (face[a].y - face[b].y) * h) * 1.4;
    return hand.some((p) => Math.hypot(p.x * w - cx, p.y * h - cy) < r);
  });
}

// Big progress bar: how much of this step's color change the camera sees so far.
const NEED = { base: 0.55, crease: 0.5, outer: 0.5, liner: 0.5, wing: 0.4 };
function Meter({ step, check, beforeSet, practice, onRetake }) {
  const good = Boolean(check?.done || check?.j?.ok);
  const pct = good ? 100 : Math.min(99, Math.round((check?.prog || 0) * 100));
  return (
    <div className={`meter ${good ? 'meter-ok' : ''}`} aria-live="polite">
      <div className="txt">
        <span>{good ? '✓ Looks good!' : check?.dark ? 'Paused: too dark' : !beforeSet ? 'Hold still, eyes open, hands down…' : 'Your progress on this step'}</span>
        <span>{beforeSet ? `${pct}%` : ''}</span>
      </div>
      <div className="track"><div className={`fill ${good ? 'ok' : ''}`} style={{ width: `${beforeSet ? pct : 0}%` }} /></div>
      {!practice && beforeSet && <button className="btn ghost small" style={{ justifySelf: 'start' }} onClick={onRetake}>Start this step again</button>}
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
  const stepView = stepImages(look.id, steps[stepIdx], images);

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
    const { from, to, also } = stepImages(look.id, step, images);
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
    if (voiceRef.current && info) speak(`${info.title}. ${stepHow(steps[stepIdx], profile, look.id)}`, { minGapMs: 0 });
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
    const live = !practiceOn.current;
    if (live) {
      const raw = faceLight(cur);
      st.light = st.light == null || raw == null ? raw : st.light * 0.7 + raw * 0.3; // smoothed
      const light = st.light;
      const pose = facePose(face, img.width, img.height);
      // Too dark: pause progress, say so.
      if (light != null && light < DARK_L) {
        st.result = { ok: false, tip: TIP_DARK };
        st.done(false, now);
        setCheck((p) => ({ ...(p || {}), dark: true }));
        return st.result;
      }
      // The before frame was taken on a bare lid; if the light or the face changed a lot before
      // any color went on, take it again.
      if (st.before && (st.prog || 0) < 0.1 && (moved(st.beforePose, pose) > 0.5 || Math.abs(light - st.beforeLight) > 12)) {
        st.before = null; st.now = null; st.frames = []; st.pose0 = null; setBeforeSet(false);
      }
      // Before = median of 15 frames once the face has been still for 1 s.
      if (!st.before) {
        if (!st.pose0 || moved(st.pose0, pose) > 0.08) { st.pose0 = pose; st.steadySince = now; st.frames = []; }
        st.pose0 = pose;
        if (now - st.steadySince >= STEADY_MS) st.frames.push(cur);
        if (st.frames.length >= BASE_FRAMES) {
          st.before = medianSamples(st.frames); st.frames = []; st.now = st.before; // smoothing starts from the bare lid
          st.beforePose = pose; st.beforeLight = light; st.prog = 0;
          st.glasses = glassesLikely(st.before);
          setBeforeSet(true);
        }
        st.result = { ok: false, tip: TIP_HOLD };
        setCheck({ prog: 0 });
        return st.result;
      }
    }
    // now = running average (less webcam noise).
    st.now = blendSamples(st.now, cur, live ? 0.3 : 0.5);
    const c = compareStep(step, st.before, st.now, profile, st.expected, { live });
    let j = judge(c);
    // Smooth progress over time so it does not jump with noise.
    st.prog = (st.prog || 0) * 0.7 + stepProgress(c) * 0.3;
    if (live && st.glasses && j.tip?.id === 'cmp_none' && !st.glassesShown) { st.glassesShown = true; j = { ...j, tip: TIP_GLASSES }; }
    const done = st.done(j.ok, now);
    st.result = j;
    if (done && !passedRef.current[step]) {
      passedRef.current = { ...passedRef.current, [step]: true };
      setPassed(passedRef.current);
      if (voiceRef.current) speak('Step done. Nice work.', { minGapMs: 0 });
    }
    setCheck({ c, j, prog: st.prog, done: done || Boolean(passedRef.current[step]) });
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
  const guide = stepGuide(look.id, step, profile);
  const last = stepIdx === steps.length - 1;
  const stepGoal = stepView.show || goal;
  const stepBefore = stepView.show && stepView.from ? images[stepView.from] : null;
  const canPractice = Boolean(goalData);
  const good = step !== 'prep' && Boolean(check?.done || check?.j?.ok);
  const go = (d) => setStepIdx((i) => Math.max(0, Math.min(steps.length - 1, i + d)));

  return (
    <section className="coach2">
      <div className="topbar">
        <div className="stepbar" aria-hidden="true">
          {steps.map((s2, i) => <i key={s2} className={i < stepIdx || passed[s2] ? 'done' : i === stepIdx ? 'on' : ''} />)}
        </div>
        <div className="steptitle">
          <h2>{info.title}</h2>
          <span className="step-count">Step {stepIdx + 1} of {steps.length}</span>
        </div>
      </div>

      <div className="views">
        <div className={`cam ${good ? 'cam-ok' : ''}`} style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} className="mirror" playsInline muted style={{ visibility: practice ? 'hidden' : 'visible' }} />
          {practice && <canvas ref={practiceRef} className="practice" />}
          <canvas ref={canvasRef} className={`overlay ${practice ? '' : 'mirror'}`} />
          {good && <div className="ok-badge" aria-hidden="true"><b>✓</b><span>Looks good!</span></div>}
          {practice && <div className="hint" style={{ left: "auto", right: 10, transform: "none" }}>Practice</div>}
          {status && !practice && <div className="hint" role="status">{status}</div>}
          <div className={`tip cam-tip ${good ? 'good tip-ok' : tip?.level || 'info'}`} role="status" aria-live="polite">
            {good ? `✓ Looks good! ${check?.j?.tip?.id === 'cmp_ok' || !check?.j?.tip ? 'Tap Next step.' : check.j.tip.text.replace(/^Looks good\.\s*/, '')}` : tip ? tip.text : guide.lines[0]}
          </div>
        </div>
        {step !== 'prep' && stepGoal && (
          <div className="goalbox">
            <p className="label">Goal for this step (drag to compare)</p>
            <BeforeAfter before={stepBefore} after={stepGoal} focus={eyeFocus} oneEye beforeLabel="Before" afterLabel="Goal" />
          </div>
        )}
      </div>


      {step !== 'prep' && <Meter step={step} check={check} beforeSet={beforeSet} practice={practice} onRetake={resetCheck} />}

      {error && <p className="error" role="alert">{error} {canPractice ? 'Showing practice on the sample face instead.' : 'Allow camera access and reload.'}</p>}

      <div className="card stack">
        <p className="tool-line"><strong>Use:</strong> {guide.tool}</p>
        <ol className="howto">{guide.lines.map((l) => <li key={l}>{l}</li>)}</ol>
        <p className="done-line">✓ Done when: {guide.done}</p>
        {step !== 'prep' && <p className="small muted" style={{ margin: 0 }}>Pink on the camera = where to put it. When you finish, lower the brush and look at the camera. Not sure? Just tap Next step.</p>}
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
        {error && !canPractice && <button className="btn ghost small" onClick={finish}>No camera? Skip to the end</button>}
      </div>

      <div className="coach-actions">
        <button className="btn ghost" onClick={() => (stepIdx > 0 ? go(-1) : back())}>{stepIdx > 0 ? '← Back' : 'Back'}</button>
        {!last && <button className={`btn big ${check?.done ? 'good' : ''}`} onClick={() => go(1)}>Next step →</button>}
        {last && <button className={`btn big ${check?.done ? 'good' : ''}`} onClick={finish}>Finish + photo</button>}
      </div>
    </section>
  );
}
