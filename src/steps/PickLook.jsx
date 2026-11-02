// Step 2: show the 3 eye looks rendered on HER selfie (YouCam makeup try-on). The pick becomes the goal.
// Each look also has a step strip: real try-ons with one layer more each step (lid, crease,
// liner, smoke/wing, lips). These become the per-step goals in the live coach.
import React, { useEffect, useState } from 'react';
import { LOOKS, stageIds } from '../../shared/looks.js';
import { tryOnLook, demo } from '../lib/api.js';
import { recommendedLook } from '../lib/skinSummary.js';
import { demoStageImages, liveStageImages, liveStageCost, eyeFocusOf, STAGE_LABEL } from '../lib/stageImages.js';
import EyeCrop from './EyeCrop.jsx';

function StepStrip({ lookId, images, focus }) {
  const ids = stageIds(lookId).filter((id) => images?.[id]);
  if (!ids.length) return null;
  return (
    <div className="strip" aria-label="Step by step">
      {ids.map((id, i) => (
        <figure key={id}>
          <EyeCrop src={images[id]} focus={focus} aspect={1.6} alt={`Step ${i + 1}: ${STAGE_LABEL[id]}`} />
          <figcaption>{i + 1}. {STAGE_LABEL[id]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function PickLook({ session, update, next, back }) {
  const { profile, mode, selfie, scanMeta } = session;
  const [images, setImages] = useState({});  // lookId -> image url
  const [errors, setErrors] = useState({});  // lookId -> message
  const [steps, setSteps] = useState(() => (session.goalSteps && session.look ? { [session.look.id]: session.goalSteps } : {})); // lookId -> {stage: url}
  const [stepBusy, setStepBusy] = useState('');
  const [focus, setFocus] = useState(session.eyeFocusFor === session.selfie ? session.eyeFocus : null);
  const [picked, setPicked] = useState(session.look?.id || recommendedLook(profile));
  const recommended = recommendedLook(profile);

  useEffect(() => {
    let alive = true;
    for (const look of LOOKS) {
      if (mode === 'demo') {
        setImages((m) => ({ ...m, [look.id]: demo.vto(look.id) || selfie }));
        setSteps((m) => ({ ...m, [look.id]: demoStageImages(look.id) }));
        continue;
      }
      // Live: 1 unit per look, cached per photo, so going back and forth is free.
      tryOnLook({ ...scanMeta, dataUrl: selfie, lookId: look.id, undertone: profile.undertone, depth: profile.depth })
        .then((img) => alive && setImages((m) => ({ ...m, [look.id]: img })))
        .catch((e) => alive && setErrors((m) => ({ ...m, [look.id]: e.message })));
    }
    return () => { alive = false; };
  }, [mode, selfie, scanMeta, profile.undertone]);

  // Eye position on the selfie (free, in the browser) so the strip can zoom to the eyes.
  useEffect(() => {
    if (focus || !selfie) return;
    let alive = true;
    eyeFocusOf(selfie).then((f) => alive && f && setFocus(f));
    return () => { alive = false; };
  }, [selfie]);

  async function makeSteps(lookId) {
    setStepBusy(lookId);
    try {
      const all = await liveStageImages({
        session, lookId, goal: images[lookId],
        onImage: (stage, url) => setSteps((m) => ({ ...m, [lookId]: { ...m[lookId], [stage]: url } })),
      });
      setSteps((m) => ({ ...m, [lookId]: all }));
    } catch (e) {
      setErrors((m) => ({ ...m, [lookId]: `Step images: ${e.message}` }));
    } finally {
      setStepBusy('');
    }
  }

  function choose() {
    const look = LOOKS.find((l) => l.id === picked);
    update({ look, goal: images[picked] || selfie, goalSteps: steps[picked] || null, eyeFocus: focus, eyeFocusFor: selfie });
    next();
  }

  const pickedLook = LOOKS.find((l) => l.id === picked);
  const pickedHasSteps = Object.keys(steps[picked] || {}).length > 2;

  return (
    <section className="stack">
      <div>
        <h2>Pick your look</h2>
        <p className="muted">Shown on your face, in colors for your {profile.undertone} undertone. The strip shows how it builds up, step by step.</p>
      </div>
      <div className="grid-3" role="radiogroup" aria-label="Eye looks">
        {LOOKS.map((look) => (
          <button
            key={look.id}
            className={`card look ${picked === look.id ? 'on' : ''}`}
            role="radio"
            aria-checked={picked === look.id}
            onClick={() => setPicked(look.id)}
          >
            <div className="img" style={{ position: 'relative' }}>
              {mode === 'demo' && !demo.vto(look.id) && images[look.id] && <span className="badge" style={{ position: 'absolute', left: 8, top: 8 }}>Preview in live mode</span>}
              {images[look.id] ? <img src={images[look.id]} alt={`${look.name} on your face`} />
                : errors[look.id] ? <span className="small muted" style={{ padding: 12 }}>{errors[look.id]}</span>
                : <span className="spinner" aria-label="Loading" />}
            </div>
            <div className="body">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{look.name}</h3>
                {look.id === recommended && <span className="badge">Best for you</span>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>{look.blurb}</p>
            </div>
            <StepStrip lookId={look.id} images={steps[look.id]} focus={focus} />
          </button>
        ))}
      </div>
      {mode !== 'demo' && images[picked] && !pickedHasSteps && (
        <div className="card row small">
          <span>See {pickedLook?.name.toLowerCase()} step by step on your face. The coach uses these as the goal for each step.</span>
          <button className="btn ghost small" onClick={() => makeSteps(picked)} disabled={Boolean(stepBusy)}>
            {stepBusy === picked ? 'Rendering steps...' : `Make step images (${liveStageCost(picked)} units)`}
          </button>
        </div>
      )}
      <div className="actions">
        <button className="btn big" onClick={choose} disabled={!images[picked] || Boolean(stepBusy)}>Use {pickedLook?.name.toLowerCase()}</button>
        <button className="btn ghost" onClick={back}>Back</button>
      </div>
    </section>
  );
}
