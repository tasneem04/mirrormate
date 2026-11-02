// Before vs after, zoomed to the eyes: drag the handle (or tap the labels) to compare.
// oneEye: zoom to a single eye so small changes are easy to see on a phone.
import React, { useState } from 'react';
import EyeCrop from './EyeCrop.jsx';

// One-eye focus from the two-eye focus (eyeFocusOf). The subject's right eye is on the image left.
export function oneEyeFocus(focus) {
  if (!focus) return null;
  const span = focus.w / 1.2; // brow tail to brow tail
  const w = span * 0.6;
  const cx = Math.max(w / 2, focus.cx - span * 0.26);
  return { ...focus, cx, cy: focus.cy + span * 0.02, w };
}

export default function BeforeAfter({ before, after, focus, oneEye = false, aspect, beforeLabel = 'Before', afterLabel = 'After' }) {
  const [pos, setPos] = useState(50);
  if (!after) return null;
  const f = oneEye ? oneEyeFocus(focus) : focus;
  const a = aspect || (oneEye ? 1.7 : 2);
  if (!before) return <EyeCrop src={after} focus={f} aspect={a} alt={afterLabel} />;
  return (
    <div className="ba" style={{ '--pos': `${pos}%` }}>
      <EyeCrop src={after} focus={f} aspect={a} alt={afterLabel} />
      <div className="ba-top" aria-hidden="true"><EyeCrop src={before} focus={f} aspect={a} alt="" /></div>
      <div className="ba-line" aria-hidden="true" />
      <button type="button" className="ba-tag left" onClick={() => setPos(100)}>{beforeLabel}</button>
      <button type="button" className="ba-tag right" onClick={() => setPos(0)}>{afterLabel}</button>
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={`Slide to compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`} />
    </div>
  );
}
