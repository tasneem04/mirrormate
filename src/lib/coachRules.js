// Live coach rules. Pure functions: landmarks in, tip out. No DOM, so they can be unit-tested.
//
// Honest limits: the app can't see the makeup itself. It only knows where the face and
// the hand are. So every tip is about WHERE the tool is and HOW it moves, compared to
// zones built from the eye and brow landmarks.
//
// Coordinates: MediaPipe gives x,y in 0..1 of the (unmirrored) camera frame. We convert to
// pixels first so angles are true. "Right eye" means the person's right eye.

// MediaPipe Face Landmarker indices (468-point face mesh).
export const EYES = {
  right: {
    outer: 33, inner: 133,
    upperLid: [33, 246, 161, 160, 159, 158, 157, 173, 133], // outer -> inner
    lashMid: 159,
    lowerOuter: 7,
    browLowerMid: 52,
    browTail: 46,
  },
  left: {
    outer: 263, inner: 362,
    upperLid: [263, 466, 388, 387, 386, 385, 384, 398, 362],
    lashMid: 386,
    lowerOuter: 249,
    browLowerMid: 282,
    browTail: 276,
  },
};
const NOSE_TIP = 1;
const CHEEK_R = 234; // face edge on the person's right
const CHEEK_L = 454;

// Hand landmarks.
const INDEX_MCP = 5;
const INDEX_TIP = 8;

// ---------- small vector helpers ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const median = (arr) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
};
const deg = (rad) => (rad * 180) / Math.PI;

export const toPx = (p, w, h) => ({ x: p.x * w, y: p.y * h });

// ---------- geometry ----------

// Build an "eye frame" for one eye:
//   u   = unit vector from inner to outer corner (along the eye)
//   up  = unit vector perpendicular to u, pointing toward the brow
//   browDist = distance from the lash line (middle) to the lower brow (middle), in px
// Heights are measured in units of browDist: 0 = upper lash line, 1 = lower edge of the brow.
export function eyeFrame(face, side, w, h) {
  const e = EYES[side];
  const P = (i) => toPx(face[i], w, h);
  const outer = P(e.outer);
  const inner = P(e.inner);
  const u = unit(sub(outer, inner));
  let up = { x: u.y, y: -u.x };
  const lash = P(e.lashMid);
  const brow = P(e.browLowerMid);
  if (dot(sub(brow, lash), up) < 0) up = mul(up, -1); // make "up" point at the brow
  return {
    side, u, up, outer, inner, lash, brow,
    center: mul(add(outer, inner), 0.5),
    eyeWidth: len(sub(outer, inner)),
    browDist: Math.max(1, dot(sub(brow, lash), up)),
    upperLid: e.upperLid.map(P),
    lowerOuter: P(e.lowerOuter),
    browTail: P(e.browTail),
  };
}

// Where is point p relative to this eye?
//   h: height above the lash line (0 = lashes, 1 = brow)
//   s: along the eye from the center (+0.5 = outer corner, -0.5 = inner corner)
export function locate(frame, p) {
  const fromLash = sub(p, frame.lash);
  const fromCenter = sub(p, frame.center);
  return {
    h: dot(fromLash, frame.up) / frame.browDist,
    s: dot(fromCenter, frame.u) / frame.eyeWidth,
    dist: len(fromCenter) / frame.eyeWidth,
  };
}

// The crease target height. Hooded lids: aim a bit higher so the color shows with eyes open.
export function creaseHeight(profile) {
  return profile?.eyelid === 'Hooded-lid' ? 0.5 : 0.4;
}

// Points of the crease guide line (the upper lid curve, lifted to the crease height).
export function creaseLine(frame, creaseH) {
  return frame.upperLid.map((p) => add(p, mul(frame.up, creaseH * frame.browDist)));
}

// Wing target: from the outer lower lash point toward the brow tail.
// Returned as an angle in degrees above the eye axis (u), measured in the eye frame.
export function wingTargetAngle(frame) {
  const v = sub(frame.browTail, frame.lowerOuter);
  return deg(Math.atan2(dot(v, frame.up), dot(v, frame.u)));
}

// Tool tip estimate from the hand. With a brush, extend past the index fingertip along the
// finger direction (a brush sticks out beyond the fingers). brushReach = 0 means fingertip.
export function toolPoint(hand, w, h, brushReach = 0.6) {
  const tip = toPx(hand[INDEX_TIP], w, h);
  const knuckle = toPx(hand[INDEX_MCP], w, h);
  const dir = sub(tip, knuckle);
  return add(tip, mul(dir, brushReach));
}

// Which eye is the tool working on? The nearest one, if it's close enough.
export function nearestEye(frames, tool) {
  let best = null;
  for (const f of frames) {
    const loc = locate(f, tool);
    if (!best || loc.dist < best.loc.dist) best = { frame: f, loc };
  }
  return best && best.loc.dist < 1.6 ? best : null;
}

// Count direction changes along the eye axis: a sign of back-and-forth blending.
export function countReversals(samples, minStep = 0.02) {
  let reversals = 0;
  let lastDir = 0;
  let anchor = samples[0]?.s;
  for (const smp of samples.slice(1)) {
    const d = smp.s - anchor;
    if (Math.abs(d) < minStep) continue;
    const dir = Math.sign(d);
    if (lastDir && dir !== lastDir) reversals++;
    lastDir = dir;
    anchor = smp.s;
  }
  return reversals;
}

// Shakiness: average distance of points from their best-fit line, relative to eye width.
export function jitter(points, eyeWidth) {
  if (points.length < 5) return 0;
  const m = points.reduce((a, p) => add(a, p), { x: 0, y: 0 });
  const c = mul(m, 1 / points.length);
  // Principal direction from the 2x2 covariance matrix.
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    const d = sub(p, c);
    sxx += d.x * d.x; sxy += d.x * d.y; syy += d.y * d.y;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const mean = points.reduce((a, p) => a + Math.abs(dot(sub(p, c), normal)), 0) / points.length;
  return mean / eyeWidth;
}

// Stroke angle (degrees above the eye axis) of a set of points moving outward.
// Uses the first and last point of the stroke, oriented so it points away from the eye.
export function strokeAngle(frame, points) {
  if (points.length < 4) return null;
  const v = sub(points[points.length - 1], points[0]);
  if (len(v) < frame.eyeWidth * 0.15) return null; // too short to judge
  let along = dot(v, frame.u);
  let upward = dot(v, frame.up);
  if (along < 0) { along = -along; upward = -upward; } // same line, drawn the other way
  return deg(Math.atan2(upward, along));
}

// ---------- the tips ----------

// Every tip has an id (for the log and the finish tips), a short text, and a level:
//   fix  = something to change (orange), good = keep going (green), info = neutral.
const T = (id, text, level = 'fix') => ({ id, text, level });

export const STEP_INFO = {
  prep: { title: 'Get ready', how: 'Sit facing the camera in good light. Keep your face inside the frame.' },
  base: { title: 'Shadow base', how: 'Flat brush, light shade. Pat it on the lid, from the lashes up to the fold.' },
  crease: { title: 'Crease', how: 'Fluffy brush, middle shade. Small side-to-side moves in the fold of your lid.' },
  liner: { title: 'Liner', how: 'Short strokes along the upper lashes, from the inner to the outer corner.' },
  wing: { title: 'Wing', how: 'From the outer corner, flick out toward the end of your brow. Then connect it to the lash line.' },
};

// Face checks shared by all steps. Returns a tip or null when the face is fine.
export function faceCheck(face, w, h, brightness) {
  if (!face) return T('no_face', "I can't see your face. Move into the frame.");
  const r = toPx(face[CHEEK_R], w, h);
  const l = toPx(face[CHEEK_L], w, h);
  const faceW = len(sub(l, r));
  if (faceW / w < 0.22) return T('closer', 'Move a little closer to the camera.');
  const nose = toPx(face[NOSE_TIP], w, h);
  const mid = mul(add(l, r), 0.5);
  if (Math.abs(nose.x - mid.x) / faceW > 0.09) return T('face_cam', 'Turn your face toward the camera.');
  if (brightness != null && brightness < 70) return T('light', 'More light, please. Face a window or a lamp.');
  return null;
}

// Main entry point. Called about every frame.
//   step: 'prep' | 'base' | 'crease' | 'liner' | 'wing'
//   face: face landmarks or null; hand: hand landmarks or null
//   history: { samples: [{t, side, h, s, x, y}], lastHandAt, eyeStats: {right:{}, left:{}} } (mutated)
//   ctx: { w, h, now, brightness, profile, brushReach }
export function coachTip(step, face, hand, history, ctx) {
  const { w, h, now } = ctx;
  const faceTip = faceCheck(face, w, h, ctx.brightness);
  if (faceTip) return faceTip;
  if (step === 'prep') return T('ready', 'Looking good. Tap Next when you are ready.', 'good');

  const frames = [eyeFrame(face, 'right', w, h), eyeFrame(face, 'left', w, h)];

  if (!hand) {
    if (now - (history.lastHandAt || 0) > 1000) return T('no_hand', 'Bring your brush hand into view.', 'info');
    return null; // brief loss: keep the last tip
  }
  history.lastHandAt = now;

  const tool = toolPoint(hand, w, h, ctx.brushReach ?? 0.6);
  const near = nearestEye(frames, tool);
  if (!near) return T('to_eye', 'Bring the brush to your eye.', 'info');

  const { frame, loc } = near;
  history.samples.push({ t: now, side: frame.side, h: loc.h, s: loc.s, x: tool.x, y: tool.y });
  // Keep the last 3 seconds.
  while (history.samples.length && now - history.samples[0].t > 3000) history.samples.shift();
  const recent = history.samples.filter((p) => p.side === frame.side && now - p.t < 800);
  if (recent.length < 4) return null; // not enough data yet
  const hMed = median(recent.map((p) => p.h));
  const stats = (history.eyeStats[frame.side] ||= {});
  const other = history.eyeStats[frame.side === 'right' ? 'left' : 'right'] || {};
  const creaseH = creaseHeight(ctx.profile);

  switch (step) {
    case 'base': {
      if (hMed > creaseH + 0.12) return T('base_lower', 'Go lower. Keep the base on the lid.');
      if (hMed < -0.1) return T('base_higher', 'A bit higher. Start just above the lashes.');
      return T('base_ok', 'Nice. Pat the color across the lid.', 'good');
    }
    case 'crease': {
      if (hMed < creaseH - 0.14) return T('crease_higher', 'Go higher, into the fold.');
      if (hMed > creaseH + 0.2) return T('crease_lower', 'Too high. Stay under the brow bone.');
      stats.creaseH = hMed;
      if (other.creaseH != null && Math.abs(other.creaseH - hMed) > 0.12) {
        return T('crease_sym', `Your ${frame.side} crease is ${hMed > other.creaseH ? 'higher' : 'lower'} than the other eye. Match them.`);
      }
      const lastFew = history.samples.filter((p) => p.side === frame.side && now - p.t < 2500);
      if (lastFew.length > 12 && countReversals(lastFew) < 2) return T('blend_more', 'Blend more: small side-to-side moves.');
      return T('crease_ok', 'Great blending. Keep it soft.', 'good');
    }
    case 'liner': {
      if (hMed > 0.15) return T('liner_close', 'Stay close to the lashes.');
      const pts = history.samples.filter((p) => p.side === frame.side && now - p.t < 600);
      if (jitter(pts, frame.eyeWidth) > 0.035) return T('steady', 'Steady hand: rest your elbow on the table.');
      return T('liner_ok', 'Good. Short strokes, inner to outer corner.', 'good');
    }
    case 'wing': {
      const pts = history.samples.filter((p) => p.side === frame.side && now - p.t < 1200 && p.s > 0.3);
      if (pts.length < 4) return T('wing_start', 'Start the wing at the outer corner.', 'info');
      const angle = strokeAngle(frame, pts);
      if (angle == null) return null;
      const target = wingTargetAngle(frame);
      const diff = angle - target;
      stats.wingAngle = angle;
      if (diff < -10) return T('wing_low', 'Wing too low. Aim at the end of your brow.');
      if (diff > 12) return T('wing_high', 'Wing too steep. Aim a bit lower, at the brow tail.');
      if (other.wingAngle != null && Math.abs(other.wingAngle - angle) > 8) {
        return T('wing_sym', `This wing is ${angle > other.wingAngle ? 'steeper' : 'flatter'} than the other one. Match them.`);
      }
      return T('wing_ok', 'Perfect angle! Now connect it to the lash line.', 'good');
    }
    default:
      return null;
  }
}

export function newHistory() {
  return { samples: [], lastHandAt: 0, eyeStats: { right: {}, left: {} } };
}

// Longer advice for the finish screen, keyed by tip id.
export const NEXT_TIME = {
  base_lower: 'Keep the base shade on the lid only. Stop at the fold.',
  base_higher: 'Start the base right at the lash line so there is no gap.',
  crease_higher: 'Find your fold by looking straight ahead. Put the crease shade just above it.',
  crease_lower: 'Keep the crease shade under the brow bone. Too high can look heavy.',
  crease_sym: 'Do one eye, then check the other side in the mirror before you start.',
  blend_more: 'Blend with light side-to-side "windshield wiper" moves until there is no hard edge.',
  liner_close: 'Keep liner tight to the lashes. Tilt your chin up and look down into the mirror.',
  steady: 'Rest your elbow on a table and use short dashes, then join them up.',
  wing_low: 'Line the wing up with the end of your brow. A card held at that angle helps.',
  wing_high: 'A lower wing looks softer. Aim at the brow tail, not the middle of the brow.',
  wing_sym: 'Draw both wings as small dots first, compare them, then fill them in.',
  no_hand: 'Keep your hand in view of the camera so the coach can help.',
  face_cam: 'Face the camera straight on. Turning makes the guides less accurate.',
  light: 'Put a lamp or window in front of you, not behind you.',
};
