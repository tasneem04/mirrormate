// Step 1: take or upload a selfie, run the skin/tone/face analysis, show plain-English results.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera, cameraErrorMessage, snapshot, fileToDataUrl } from '../lib/camera.js';
import { analyzeSelfie, demo, setPasscode } from '../lib/api.js';
import { buildProfile, profileCards } from '../lib/skinSummary.js';
import { NAME } from '../brand.js';

const HOW = [
  ['Skin scan', 'A selfie tells us your skin type, undertone and eye shape.'],
  ['Pick a look', 'See three eye looks on your own face. Pick your goal.'],
  ['My makeup', 'Show your products. We say what suits you and what is missing.'],
  ['Live coach', 'Do your eyes in front of the camera. Get a tip as you go.'],
  ['Finish', 'Before, goal and after side by side, plus tips for next time.'],
];

// Small stroke icons for the result cards (no emoji).
const ICONS = {
  'Skin type': <path d="M12 3C8 9 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6-6-12z" />,
  'Your eyes': <><path d="M2 12Q12 3 22 12Q12 21 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  'Under the eyes': <path d="M4 10q8 8 16 0" />,
  'Face shape': <ellipse cx="12" cy="12" rx="7" ry="9" />,
};

function ResultIcon({ card }) {
  if (card.swatch) return <span className="swatch" style={{ background: card.swatch }} aria-hidden="true" />;
  return (
    <span className="icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{ICONS[card.title]}</svg>
    </span>
  );
}

export default function SkinScan({ session, update, next, config }) {
  const [phase, setPhase] = useState(session.profile ? 'results' : 'choose'); // choose | camera | working | results
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const canGoLive = config?.hasKey;
  const needsCode = config?.liveNeedsPasscode;
  const locked = needsCode && !code;

  useEffect(() => () => stopCamera(streamRef.current), []);

  async function openCamera() {
    setError('');
    setPhase('camera');
    try {
      streamRef.current = await startCamera(videoRef);
    } catch (e) {
      setError(cameraErrorMessage(e));
      setPhase('choose');
    }
  }

  async function analyze(dataUrl) {
    setPasscode(code.trim());
    setError('');
    setPhase('working');
    try {
      const r = await analyzeSelfie(dataUrl, setProgress);
      update({
        mode: 'live',
        selfie: dataUrl,
        scanMeta: { hash: r.hash, fileId: r.fileId, fileAt: r.fileAt },
        profile: buildProfile(r.scan),
      });
      setPhase('results');
    } catch (e) {
      setError(e.message);
      setPhase('choose');
    }
  }

  // Average brightness (0-255) of the middle of the frame, where the face is.
  function faceBrightness(video) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const vw = video.videoWidth, vh = video.videoHeight;
    c.getContext('2d').drawImage(video, vw * 0.3, vh * 0.2, vw * 0.4, vh * 0.6, 0, 0, 64, 64);
    const d = c.getContext('2d').getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4);
  }

  function takePhoto() {
    const b = faceBrightness(videoRef.current);
    if (b < 60) { setError('Too dark. Face a window or a lamp so light falls on your face, then tap Take photo again.'); return; }
    if (b > 225) { setError('Too bright. Move away from direct light, then tap Take photo again.'); return; }
    setError('');
    const dataUrl = snapshot(videoRef.current, { maxSide: 1280 });
    stopCamera(streamRef.current);
    analyze(dataUrl);
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (f) analyze(await fileToDataUrl(f));
  }

  // A sample photo replays a real saved YouCam scan of that face (no units).
  function useDemo(faceId) {
    demo.use(faceId);
    update({ mode: 'demo', demoFace: demo.id, selfie: demo.selfie, scanMeta: null, profile: buildProfile(demo.scan) });
    setPhase('results');
  }

  if (phase === 'results' && session.profile) {
    return (
      <section className="stack">
        <div>
          <h2>Your results</h2>
          <p className="muted">{session.mode === 'demo' ? 'Sample photo: a real saved scan.' : 'From your photo.'} We use this to pick your colors.</p>
        </div>
        <div className="grid-2">
          <img src={session.selfie} alt="Your selfie" style={{ borderRadius: 20, width: '100%', maxHeight: 520, objectFit: 'cover' }} />
          <div className="stack">
            {profileCards(session.profile).map((c) => (
              <div className="card result" key={c.title}>
                <ResultIcon card={c} />
                <div>
                  <h3>{c.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{c.text}</p>
                </div>
              </div>
            ))}
            <div className="actions">
              <button className="btn big" onClick={next}>Next: pick a look</button>
              <button className="btn ghost" onClick={() => setPhase('choose')}>Use another photo</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid-2">
      <div className="stack">
        <h1>Do your eyes. Get a <em>tip</em> as you go.</h1>
        <p className="lead">{NAME} watches while you do your eye makeup and gives one small tip at a time.</p>

        {phase === 'working' ? (
          <div className="card row" role="status"><span className="spinner" aria-hidden="true" /> {progress || 'Working...'}</div>
        ) : (
          <div className="stack">
            {canGoLive && needsCode && (
              <label className="stack small" style={{ gap: 6 }}>
                Live scan passcode
                <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" />
              </label>
            )}
            <div className="actions">
              <button className="btn big" onClick={openCamera} disabled={!canGoLive || locked}>Take a selfie</button>
              <label className={`btn big ghost ${!canGoLive || locked ? 'disabled' : ''}`} aria-disabled={!canGoLive || locked}>
                Upload a photo
                <input type="file" accept="image/jpeg,image/png" hidden onChange={onFile} disabled={!canGoLive || locked} />
              </label>
            </div>
            {demo.available && (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small muted" style={{ margin: 0 }}>Or use a sample photo (no camera needed):</p>
                <div className="actions">
                  {demo.faces.map((f) => (
                    <button key={f.id} className="btn ghost" onClick={() => useDemo(f.id)} aria-label={`Use sample photo: ${f.label}`}>
                      <img src={f.selfie} alt="" width="36" height="36" style={{ borderRadius: '50%', objectFit: 'cover' }} />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!canGoLive && <p className="small muted" style={{ margin: 0 }}>Live scan is off on this site. Use a sample photo to try every step.</p>}
            {canGoLive && locked && <p className="small muted" style={{ margin: 0 }}>Enter the passcode to scan your own photo.</p>}
            {!canGoLive && !demo.available && <p className="error">No API key and no demo data yet. See the README.</p>}
            <div className="small" style={{ margin: 0 }}>
              <strong>Selfie tips:</strong>
              <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                <li>Tap <strong>Take a selfie</strong>, then tap <strong>Allow</strong> when the browser asks for the camera.</li>
                <li>Come close: your face should fill the oval on screen.</li>
                <li>Look straight at the camera, with light in front of you.</li>
                <li>No glasses, hair off your face, no eye makeup yet.</li>
              </ol>
            </div>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {/* The camera is always rendered (hidden when not in use) so the video element exists before the stream starts. */}
      <div className="cam" hidden={phase !== 'camera'}>
        <video ref={videoRef} className="mirror" />
        <div className="oval" />
        <div className="hint">{phase === 'camera' && error ? error : 'Move closer until your face fills the oval, then tap Take photo'}</div>
        <div className="cam-btn"><button className="btn" onClick={takePhoto}>Take photo</button></div>
      </div>
      <div className="card stack" hidden={phase === 'camera'}>
        <h3>How it works</h3>
        <ol className="how">
          {HOW.map(([title, text], i) => (
            <li key={title}>
              <span className="num">{i + 1}</span>
              <span><strong>{title}.</strong> <span className="muted">{text}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
