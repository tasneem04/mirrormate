// Brow coach: guide lines + a live color check of the brows. Pure functions (landmarks and
// pixels in, numbers out), unit-tested like the eye check in zoneCompare.js.
//
// 1. Guide lines (the classic brow mapping), per brow, from MediaPipe face landmarks:
//      start = nose wing -> inner eye corner, arch = nose wing -> outer edge of the iris,
//      end = nose wing -> outer eye corner. Where each line meets the brow is the target.
// 2. A brow frame: t runs along the brow (0 = start line, 1 = end line), v across it
//    (0 = the brow's own midline, +-0.5 = its upper / lower edge, in brow-thickness units).
//    A grid of (t, v) points is tied to landmarks, so it follows the head like the eye grid.
// 3. Per point: CIE Lab color, change vs a "before" frame (dE), light-corrected with a
//    forehead reference band. With step images: the expected change is goal-before vs
//    goal-after on the same grid (same method as the eye zones).
// 4. Measures: coverage, tail reach, arch (peak) position, spill outside the brow, softness
//    of the front, and symmetry left vs right. judgeBrow() turns them into one tip.
import { rgbToLab, DE_MIN, DE_THRESHOLD } from './zoneCompare.js';

export const BROW_LM = {
  // Subject's right brow = left side of an unmirrored photo. Points run inner -> outer.
  right: { upper: [107, 66, 105, 63, 70], lower: [55, 65, 52, 53, 46], inner: 133, outer: 33, wing: 129, iris: [469, 470, 471, 472], irisC: 468 },
  left: { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276], inner: 362, outer: 263, wing: 358, iris: [474, 475, 476, 477], irisC: 473 },
};
export const BROW_SIDES = ['right', 'left'];
const T_RANGE = [-0.15, 1.25], T_STEP = 0.05;
const V_RANGE = [-1.5, 1.5], V_STEP = 0.25;
const REF = { t: [0.1, 0.7], v: [2.6, 3.2] }; // forehead just above the brow: no product

const px = (face, i, w, h) => ({ x: face[i].x * w, y: face[i].y * h });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const mid = (a, b) => mul(add(a, b), 0.5);

// Where the ray from p through q first crosses the polyline. Returns a point or null.
function rayHit(p, q, poly) {
  const d = sub(q, p);
  let best = null;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], e = sub(poly[i], a);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const ap = sub(a, p);
    const s = (ap.x * e.y - ap.y * e.x) / den; // along the ray
    const u = (ap.x * d.y - ap.y * d.x) / den; // along the segment
    if (s > 0 && u >= 0 && u <= 1 && (!best || s < best.s)) best = { s, pt: add(p, mul(d, s)) };
  }
  return best?.pt || null;
}

// Outer edge of the iris (the arch line goes through it). Falls back to 62% of the way from
// the inner to the outer eye corner when the iris points are missing.
function irisOuter(face, L, w, h) {
  const inner = px(face, L.inner, w, h), outer = px(face, L.outer, w, h);
  if (face.length > Math.max(...L.iris)) {
    const pts = L.iris.map((i) => px(face, i, w, h));
    return pts.reduce((b, p) => (len(sub(p, inner)) > len(sub(b, inner)) ? p : b));
  }
  return add(inner, mul(sub(outer, inner), 0.62));
}

// Geometry of one brow: guide lines, the brow frame, and the natural brow measured in it.
export function browGeometry(face, side, w, h) {
  const L = BROW_LM[side];
  const up = L.upper.map((i) => px(face, i, w, h));
  const lo = L.lower.map((i) => px(face, i, w, h));
  const midPts = up.map((p, i) => mid(p, lo[i]));
  // Extend the midline past both ends so guides can land on a short or sparse brow.
  const head = midPts[0], tail = midPts[midPts.length - 1];
  const dh = sub(midPts[0], midPts[1]), dt = sub(tail, midPts[midPts.length - 2]);
  const ext = [add(head, mul(dh, 1.2)), ...midPts, add(tail, mul(dt, 1.5))];
  const wing = px(face, L.wing, w, h);
  const targets = { start: px(face, L.inner, w, h), arch: irisOuter(face, L, w, h), end: px(face, L.outer, w, h) };
  const hits = {};
  for (const [k, q] of Object.entries(targets)) hits[k] = rayHit(wing, q, ext) || q;
  const S = hits.start, E = hits.end;
  const span = len(sub(E, S)) || 1;
  const u = mul(sub(E, S), 1 / span);
  let n = { x: u.y, y: -u.x };
  if (dot(n, sub(up[2], lo[2])) < 0) n = mul(n, -1); // n points up, toward the forehead
  const thick = up.reduce((t, p, i) => t + len(sub(p, lo[i])), 0) / up.length || 1;
  const tv = (p) => ({ t: dot(sub(p, S), u) / span, v: dot(sub(p, S), n) / thick });
  const midTV = midPts.map(tv);
  const midAt = (t) => {
    if (t <= midTV[0].t) return midTV[0].v;
    const last = midTV[midTV.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 1; i < midTV.length; i++) if (t <= midTV[i].t) {
      const a = midTV[i - 1], b = midTV[i];
      return a.v + ((t - a.t) / (b.t - a.t || 1)) * (b.v - a.v);
    }
    return last.v;
  };
  const upTV = up.map(tv);
  const peak = upTV.reduce((b, p) => (p.v > b.v ? p : b));
  const natural = { headT: midTV[0].t, tailT: midTV[midTV.length - 1].t, archT: peak.t };
  // Guide line ends for drawing: from a bit below the brow to a bit above it.
  const guides = Object.fromEntries(Object.entries(hits).map(([k, p]) => {
    const dir = sub(p, wing), l = len(dir) || 1;
    return [k, { at: p, a: add(p, mul(dir, -thick * 1.6 / l)), b: add(p, mul(dir, thick * 1.8 / l)) }];
  }));
  return {
    side, S, E, u, n, span, thick, midAt, guides, natural, wing,
    archT: tv(hits.arch).t,
    upper: up, lower: lo,
    pointAt: (t, v) => add(add(S, mul(u, t * span)), mul(n, (midAt(t) + v) * thick)),
  };
}

function sampleLab(img, x, y) {
  let r = 0, g = 0, b = 0, k = 0;
  const xi = Math.round(x), yi = Math.round(y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = xi + dx, Y = yi + dy;
    if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
    const i = (Y * img.width + X) * 4;
    r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; k++;
  }
  return k ? rgbToLab(r / k, g / k, b / k) : null;
}

export function sampleBrow(img, face, side) {
  const geo = browGeometry(face, side, img.width, img.height);
  const points = [];
  for (let t = T_RANGE[0]; t <= T_RANGE[1] + 1e-9; t += T_STEP) {
    for (let v = V_RANGE[0]; v <= V_RANGE[1] + 1e-9; v += V_STEP) {
      const p = geo.pointAt(t, v);
      const lab = sampleLab(img, p.x, p.y);
      if (lab) points.push({ t: +t.toFixed(3), v: +v.toFixed(3), m: geo.midAt(t), lab });
    }
  }
  const refs = [];
  for (let t = REF.t[0]; t <= REF.t[1] + 1e-9; t += 0.1) for (let v = REF.v[0]; v <= REF.v[1] + 1e-9; v += 0.2) {
    const p = geo.pointAt(t, v);
    const lab = sampleLab(img, p.x, p.y);
    if (lab) refs.push(lab);
  }
  const ref = refs.length ? [0, 1, 2].map((k) => refs.reduce((s, l) => s + l[k], 0) / refs.length) : null;
  return { side, points, ref, archT: geo.archT, natural: geo.natural };
}

export const sampleBrows = (img, face) => ({ right: sampleBrow(img, face, 'right'), left: sampleBrow(img, face, 'left') });

// Average two snapshots (same grid) to smooth webcam noise. w = weight of the new one.
export function blendBrowSamples(prev, cur, w = 0.5) {
  if (!prev) return cur;
  const mix = (a, b) => a.map((x, i) => x * (1 - w) + b[i] * w);
  const one = (a, b) => {
    const old = new Map(a.points.map((p) => [key(p), p.lab]));
    return { ...b, ref: a.ref && b.ref ? mix(a.ref, b.ref) : b.ref, points: b.points.map((p) => { const o = old.get(key(p)); return o ? { ...p, lab: mix(o, p.lab) } : p; }) };
  };
  return { right: one(prev.right, cur.right), left: one(prev.left, cur.left) };
}

const key = (p) => `${p.t}|${p.v}`;
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const pct = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const mean = (arr) => (arr.length ? arr.reduce((t, x) => t + x, 0) / arr.length : 0);

export function diffBrow(before, now) {
  const shift = before.ref && now.ref ? now.ref[0] - before.ref[0] : 0;
  const map = new Map(before.points.map((p) => [key(p), p.lab]));
  const out = [];
  for (const p of now.points) {
    const b = map.get(key(p));
    if (b) out.push({ t: p.t, v: p.v, m: p.m ?? 0, d: dE([p.lab[0] - shift, p.lab[1], p.lab[2]], b) });
  }
  return out;
}

// Shape of a change map: how far the tail reaches, where the top edge peaks, spill, front.
function shapeOf(diffs, isOn) {
  const on = diffs.filter((p) => Math.abs(p.v) <= 1 && isOn(p));
  if (on.length < 4) return { tail: null, head: null, peak: null };
  const tail = pct(on.map((p) => p.t), 0.95);
  const head = pct(on.map((p) => p.t), 0.05);
  // Arch: per column, the color-weighted height (center of the color, so it does not jump
  // between grid rows) plus the brow's own midline height there (the grid follows the brow),
  // smoothed over 3 columns; the peak is the highest column. The arch is
  // never in the front third, so only t 0.3..1.05 is searched.
  const cols = new Map();
  for (const p of on) { const c = cols.get(p.t) || { w: 0, v: 0 }; c.w += p.d; c.v += p.d * (p.v + (p.m ?? 0)); cols.set(p.t, c); }
  const prof = [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, v: c.v / c.w }));
  const smooth = prof.map((p, i) => ({ t: p.t, v: mean(prof.slice(Math.max(0, i - 1), i + 2).map((q) => q.v)) }));
  const inner = smooth.filter((p) => p.t >= 0.3 && p.t <= 1.05);
  if (!inner.length) return { tail, head, peak: null };
  const peak = inner.reduce((b, p) => (p.v > b.v ? p : b)).t;
  return { tail, head, peak };
}

// Expected change of one brow from two step images (goalBefore -> goalAfter).
export function expectedBrow(goalBefore, goalAfter) {
  const diffs = diffBrow(goalBefore, goalAfter);
  const on = diffs.filter((p) => p.d > DE_MIN && Math.abs(p.v) <= 1);
  if (on.length < 6) return null;
  const keys = new Set(on.map(key));
  return { keys, goalD: new Map(on.map((p) => [key(p), p.d])), ...shapeOf(diffs, (p) => keys.has(key(p))) };
}
export function expectedBrows(goalBefore, goalAfter) {
  if (!goalBefore || !goalAfter) return null;
  const right = expectedBrow(goalBefore.right, goalAfter.right);
  const left = expectedBrow(goalBefore.left, goalAfter.left);
  return right && left ? { right, left } : null;
}

const inFixedZone = (p) => p.t >= 0 && p.t <= 1 && Math.abs(p.v) <= 0.5;

// One brow now vs before. exp = expectedBrow() or null (then the guide-line zone is used).
export function compareBrow(before, now, exp = null) {
  const diffs = diffBrow(before, now);
  const inTarget = exp ? (p) => exp.keys.has(key(p)) : inFixedZone;
  const zone = diffs.filter(inTarget);
  const need = exp ? (p) => Math.max(DE_MIN, 0.5 * (exp.goalD.get(key(p)) ?? DE_THRESHOLD)) : () => DE_THRESHOLD;
  const changed = zone.filter((p) => p.d > need(p));
  const coverage = zone.length ? changed.length / zone.length : 0;
  const strong = zone.length ? zone.filter((p) => p.d > DE_THRESHOLD).length / zone.length : 0;
  const shape = shapeOf(diffs, (p) => p.d > (exp ? need(p) : DE_THRESHOLD));
  // Spill: clear color outside the brow (beyond 1 thickness from the midline, or past the tail).
  const outside = diffs.filter((p) => Math.abs(p.v) >= 1.25 && p.t >= 0 && p.t <= 1.1 && !inTarget(p));
  const spill = outside.length ? outside.filter((p) => p.d > DE_THRESHOLD).length / outside.length : 0;
  // Front vs body: a hard, dark front looks drawn on. 1 = as strong as the body.
  const body = mean(zone.filter((p) => p.t >= 0.35 && p.t <= 0.85).map((p) => p.d));
  const front = mean(zone.filter((p) => p.t >= -0.05 && p.t <= 0.2).map((p) => p.d));
  const frontRatio = body > DE_MIN ? front / body : null;
  return { coverage, strong, spill, frontRatio, ...shape, targetTail: exp?.tail ?? 1, targetPeak: exp?.peak ?? (before.archT + (before.natural?.archT ?? before.archT)) / 2, goalFront: null };
}

export function compareBrows(before, now, expected = null) {
  if (!before || !now) return null;
  const right = compareBrow(before.right, now.right, expected?.right);
  const left = compareBrow(before.left, now.left, expected?.left);
  const rel = (e, k, tk) => (e[k] == null ? null : e[k] - e[tk]);
  const diff = (k, tk) => { const a = rel(right, k, tk), b = rel(left, k, tk); return a == null || b == null ? 0 : Math.abs(a - b); };
  const symmetry = {
    coverage: Math.abs(Math.min(right.coverage, 0.8) - Math.min(left.coverage, 0.8)),
    tail: diff('tail', 'targetTail'),
    peak: diff('peak', 'targetPeak'),
  };
  return { right, left, symmetry, fromGoal: Boolean(expected) };
}

const T = (id, text, level = 'fix') => ({ id, text, level });
const NEED = { fill: 0.5, blend: 0.5, gel: 0.45 };

// Step 1 (map): no product yet, so it reads the natural brow against the guide lines.
export function judgeMap(geoR, geoL) {
  const notes = [];
  for (const g of [geoR, geoL]) {
    const d = g.natural.archT - g.archT;
    if (Math.abs(d) > 0.15) notes.push(T('brow_map_arch', `Your ${g.side} arch sits a little ${d < 0 ? 'toward your nose' : 'toward the tail'}. Build the peak on the arch line.`, 'info'));
    if (g.natural.tailT < 0.9) notes.push(T('brow_map_tail', `Your ${g.side} brow ends before the end line: you'll extend the tail a little with light strokes.`, 'info'));
    if (g.natural.headT < -0.12) notes.push(T('brow_map_head', `Your ${g.side} brow starts past the start line. Keep color from the line outward.`, 'info'));
  }
  return { ok: true, tip: notes[0] || T('brow_map_ok', 'The start, arch and end lines match your brows well. Follow your own shape.', 'good'), notes };
}

// Steps 2-4. c = compareBrows(); step = 'fill' | 'blend' | 'gel'.
export function judgeBrow(step, c) {
  if (!c) return { ok: false, tip: null };
  const { right, left, symmetry } = c;
  const both = [['right', right], ['left', left]];
  if (right.strong < 0.1 && left.strong < 0.1 && right.coverage < 0.2 && left.coverage < 0.2) {
    return { ok: false, tip: T('brow_none', "I don't see brow color yet. Light strokes, from the arch out to the tail first.", 'info') };
  }
  for (const [side, e] of both) {
    if (e.spill > 0.3) return { ok: false, tip: T('brow_spill', `Your ${side} brow color goes outside the hairs. Keep strokes inside your brow line.`) };
  }
  for (const [side, e] of both) {
    if (e.tail == null) continue;
    if (e.tail < e.targetTail - 0.12) return { ok: false, tip: T('brow_tail_short', `Take your ${side} tail out to the end line (nose wing to outer eye corner).`) };
    if (e.tail > e.targetTail + (c.fromGoal ? 0.14 : 0.22)) return { ok: false, tip: T('brow_tail_long', `Your ${side} tail runs past the end line. Stop there so it doesn't drag the eye down.`) };
  }
  for (const [side, e] of both) {
    if (e.peak == null || e.targetPeak == null) continue;
    const d = e.peak - e.targetPeak;
    if (Math.abs(d) > (c.fromGoal ? 0.18 : 0.3)) return { ok: false, tip: T('brow_arch', `Your ${side} arch is too far ${d < 0 ? 'in' : 'out'}. The peak goes above the outer edge of your iris.`) };
  }
  const need = (NEED[step] ?? 0.5) * (c.fromGoal ? 1 : 0.6);
  const low = both.filter(([, e]) => e.coverage < need).map(([s]) => s);
  if (low.length) {
    const where = low.length === 2 ? 'both brows' : `your ${low[0]} brow`;
    return { ok: false, tip: T('brow_cover', step === 'fill' ? `Fill the gaps in ${where} with short, light strokes.` : `A little more color in ${where}: the gel or a few strokes.`) };
  }
  const symTail = c.fromGoal ? 0.14 : 0.25;
  if (symmetry.coverage > 0.25 || symmetry.tail > symTail || symmetry.peak > 0.2) {
    const score = (e) => e.coverage + (e.tail ?? 0) - e.targetTail;
    const more = score(right) > score(left) ? 'right' : 'left';
    const what = symmetry.tail > symTail ? 'longer' : 'fuller';
    return { ok: false, tip: T('brow_sym', `Your ${more} brow is ${what}. Match the other side.`) };
  }
  if (step === 'blend' || step === 'gel') {
    for (const [side, e] of both) {
      if (e.frontRatio != null && e.frontRatio > 1.05) return { ok: false, tip: T('brow_front', `Soften the front of your ${side} brow: brush the spoolie up and out.`) };
    }
  }
  return { ok: true, tip: T('brow_ok', step === 'gel' ? 'Brows set: even, natural and matching.' : 'Both brows look even and natural.', 'good') };
}
