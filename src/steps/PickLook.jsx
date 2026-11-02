// Step 2: show the 3 eye looks rendered on HER selfie (YouCam makeup try-on). The pick becomes the goal.
import React, { useEffect, useState } from 'react';
import { LOOKS } from '../../shared/looks.js';
import { tryOnLook, demo } from '../lib/api.js';
import { recommendedLook } from '../lib/skinSummary.js';

export default function PickLook({ session, update, next, back }) {
  const { profile, mode, selfie, scanMeta } = session;
  const [images, setImages] = useState({});  // lookId -> image url
  const [errors, setErrors] = useState({});  // lookId -> message
  const [picked, setPicked] = useState(session.look?.id || recommendedLook(profile));
  const recommended = recommendedLook(profile);

  useEffect(() => {
    let alive = true;
    for (const look of LOOKS) {
      if (mode === 'demo') {
        setImages((m) => ({ ...m, [look.id]: demo.vto(look.id) || selfie }));
        continue;
      }
      // Live: 1 unit per look, cached per photo, so going back and forth is free.
      tryOnLook({ ...scanMeta, dataUrl: selfie, lookId: look.id, undertone: profile.undertone, depth: profile.depth })
        .then((img) => alive && setImages((m) => ({ ...m, [look.id]: img })))
        .catch((e) => alive && setErrors((m) => ({ ...m, [look.id]: e.message })));
    }
    return () => { alive = false; };
  }, [mode, selfie, scanMeta, profile.undertone]);

  function choose() {
    const look = LOOKS.find((l) => l.id === picked);
    update({ look, goal: images[picked] || selfie });
    next();
  }

  return (
    <section className="stack">
      <div>
        <h2>Pick your look</h2>
        <p className="muted">Shown on your face, in colors for your {profile.undertone} undertone.</p>
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
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn big" onClick={choose} disabled={!images[picked]}>Use {LOOKS.find((l) => l.id === picked)?.name.toLowerCase()}</button>
        <button className="btn ghost" onClick={back}>Back</button>
      </div>
    </section>
  );
}
