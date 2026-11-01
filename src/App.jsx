// MirrorMate app shell: holds the shared state and moves between the 5 steps.
//   scan -> look -> makeup -> coach -> finish
// "Pick a look" comes before "My makeup" so the tools check knows which look you chose.
import React, { useEffect, useState } from 'react';
import SkinScan from './steps/SkinScan.jsx';
import PickLook from './steps/PickLook.jsx';
import MyMakeup from './steps/MyMakeup.jsx';
import LiveCoach from './steps/LiveCoach.jsx';
import Finish from './steps/Finish.jsx';
import { getConfig } from './lib/api.js';
import { NAME, PARTNER, TAGLINE } from './brand.js';

document.title = PARTNER ? `${NAME} × ${PARTNER}` : NAME;

const STEPS = [
  { id: 'scan', label: 'Skin scan' },
  { id: 'look', label: 'Pick a look' },
  { id: 'makeup', label: 'My makeup' },
  { id: 'coach', label: 'Live coach' },
  { id: 'finish', label: 'Finish' },
];

export default function App() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(null);
  // Shared state, filled in step by step.
  const [session, setSession] = useState({
    mode: 'demo',     // 'demo' (saved results, no units) or 'live' (real YouCam calls)
    selfie: null,     // image URL or data URL of the "before" photo
    scanMeta: null,   // { hash, fileId, fileAt } for re-using the upload
    profile: null,    // from lib/skinSummary.buildProfile
    look: null,       // a LOOKS entry
    goal: null,       // try-on image of the chosen look
    items: [],        // products the user has: [{ key, productId, shade, verdict }]
    coachLog: null,   // { counts: {tipId: n}, eyeStats }
    after: null,      // final photo
  });

  useEffect(() => { getConfig().then(setConfig); }, []);

  const update = (patch) => setSession((s) => ({ ...s, ...patch }));
  const next = () => { setStep((i) => Math.min(i + 1, STEPS.length - 1)); window.scrollTo(0, 0); };
  const back = () => { setStep((i) => Math.max(i - 1, 0)); window.scrollTo(0, 0); };
  const restart = () => { setStep(0); setSession((s) => ({ ...s, look: null, goal: null, coachLog: null, after: null })); };

  const props = { session, update, next, back, config };
  const current = STEPS[step].id;

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <span className="brand-name">{NAME}</span>
              {PARTNER && <span className="brand-partner"> × {PARTNER}</span>}
              {TAGLINE && <span className="brand-tag">{TAGLINE}</span>}
            </div>
          </div>
          <span className="step-count">Step {step + 1} of {STEPS.length}</span>
        </div>
        <ol className="progress" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      </header>

      <main>
        {current === 'scan' && <SkinScan {...props} />}
        {current === 'look' && <PickLook {...props} />}
        {current === 'makeup' && <MyMakeup {...props} />}
        {current === 'coach' && <LiveCoach {...props} />}
        {current === 'finish' && <Finish {...props} restart={restart} />}
      </main>

      <p className="footer-note">
        {session.mode === 'demo' ? 'Demo mode: saved scan results, no live analysis.' : 'Live mode.'} Camera
        tracking runs only in your browser. Video is never uploaded.
      </p>
    </div>
  );
}
