// Live makeup check: compares the eye zones NOW against a "before" frame taken at the start
// of the step. Pure functions (pixels + landmarks in, numbers out), so it is unit-tested.
//
// How it works:
//   1. MediaPipe face landmarks give an eye frame per eye (inner -> outer corner, lash line,
//      brow). We lay a grid of sample points over each eye in that frame:
//        s  = along the eye (-0.5 inner corner .. +0.5 outer corner, more = past the corner)
//        hh = height above the upper lash line, in units of lash-to-brow distance (1 = brow)
//      The lash line is the real lid curve, so the liner band follows it.
//      Because points are tied to landmarks, the same point is compared even if the head moves.
//   2. Each point's color (3x3 average) is converted to CIE Lab. The change vs the before
//      frame is the color difference dE (CIE76). A forehead/brow-bone reference band (no
//      makeup) corrects for light changes.
//   3. For the current step's target zone we measure, per eye:
//        coverage = share of zone points that changed (dE > threshold)
//        height   = how high the change reaches (90th percentile hh of changed points)
//        spill    = share of changed points ABOVE the zone (too high / too thick)
//        blend    = how soft the top edge is: the steepest drop of dE between rows, relative
//                   to the peak (crease and smoke steps only; a hard line = low blend)
//      and across eyes: symmetry = coverage and height difference left vs right.
//      With the goal step images, the target is not a fixed zone but the EXPECTED change:
//      goal image of the previous step vs goal image of this step, on the same grid (if the
//      step is coached before the layer under it, only points that also changed vs bare).
//   4. Rules turn the numbers into one tip; "step done" needs the checks to hold for a while.
import { eyeFrame, creaseHeight } from './coachRules.js';

export const DE_THRESHOLD = 6; // a visible change on skin; lighting noise is about 2-3
// With a goal map, a point counts when it got at least half the goal's change there (webcams
// lose some color to compression), but never less than this, so noise doesn't count.
export const DE_MIN = 4;
const S_STEP = 0.05, H_STEP = 0.04;
const S_RANGE = [-0.55, 0.9], H_RANGE = [-0.02, 1.0];
const REF = { s: [-0.3, 0.3], hh: [1.15, 1.35] }; // brow bone / forehead above the brow: no makeup
// Live camera only: a point must change by at least this much (dead zone) before it counts,
// and by more than its own measured flicker in the before frames. Webcam noise in dim light
// is often 4-6 dE, so smaller changes are ignored.
export const DE_DEAD = 8;
export const NOISE_K = 0.6;   // 'now' is a running average, so its flicker is ~0.4x a single frame's
export const EDGE_MAX = 30;   // strong edges (glasses frames, lashes) in the before frame: skip
export const DARK_L = 10;     // brow-bone lightness (smoothed) below this = too dark (deep skin in good light is ~15-25)

// Target zones per step, in (s, hh). creaseH depends on the eyelid (hooded = higher).
export function zonesFor(step, creaseH) {
  switch (step) {
    case 'base': return { s: [-0.4, 0.45], hh: [0.04, creaseH], top: creaseH };
    case 'crease': return { s: [-0.25, 0.6], hh: [creaseH - 0.1, creaseH + 0.16], top: creaseH + 0.16, blend: true };
    case 'outer': return { s: [0.15, 0.65], hh: [0, creaseH + 0.08], top: creaseH + 0.08, blend: true };
    case 'liner': return { s: [-0.4, 0.55], hh: [-0.02, 0.08], top: 0.08, thin: true };
    case 'wing': return { s: [0.5, 0.9], hh: [0, 0.32], top: 0.32 };
    default: return null;
  }
}

// ---------- color ----------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
export function rgbToLab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// img: { data: Uint8ClampedArray RGBA, width, height } (ImageData-like)
function sampleLab(img, x, y) {
  let r = 0, g = 0, b = 0, n = 0;
  const xi = Math.round(x), yi = Math.round(y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = xi + dx, Y = yi + dy;
    if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
    const i = (Y * img.width + X) * 4;
    r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
  }
  return n ? rgbToLab(r / n, g / n, b / n) : null;
}

// Local contrast (lightness range of 4 neighbors r px away): high on glasses frames and lashes.
function edgeAt(img, x, y, r) {
  const ls = [[r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dy]) => sampleLab(img, x + dx, y + dy)?.[0]).filter((v) => v != null);
  return ls.length ? Math.max(...ls) - Math.min(...ls) : 0;
}

// ---------- geometry ----------
// Height of the upper lid curve (in hh units) at position s, by interpolating the lid points.
function lidCurve(frame) {
  const pts = frame.upperLid.map((p) => {
    const d = { x: p.x - frame.center.x, y: p.y - frame.center.y };
    const l = { x: p.x - frame.lash.x, y: p.y - frame.lash.y };
    return { s: (d.x * frame.u.x + d.y * frame.u.y) / frame.eyeWidth, h: (l.x * frame.up.x + l.y * frame.up.y) / frame.browDist };
  }).sort((a, b) => a.s - b.s);
  return (s) => {
    if (s <= pts[0].s) return pts[0].h;
    if (s >= pts[pts.length - 1].s) return pts[pts.length - 1].h + (s - pts[pts.length - 1].s) * 0.3; // past the outer corner: rise gently
    for (let i = 1; i < pts.length; i++) {
      if (s <= pts[i].s) { const t = (s - pts[i - 1].s) / (pts[i].s - pts[i - 1].s || 1); return pts[i - 1].h + t * (pts[i].h - pts[i - 1].h); }
    }
    return 0;
  };
}

// Pixel position of grid point (s, hh) in an eye frame.
function pointAt(frame, lid, s, hh) {
  const h = lid(s) + hh;
  const along = s * frame.eyeWidth;
  // Start at the eye center, move along the eye, then set the height above the lash point.
  const base = { x: frame.center.x + frame.u.x * along, y: frame.center.y + frame.u.y * along };
  const cur = ((base.x - frame.lash.x) * frame.up.x + (base.y - frame.lash.y) * frame.up.y) / frame.browDist;
  const k = (h - cur) * frame.browDist;
  return { x: base.x + frame.up.x * k, y: base.y + frame.up.y * k };
}

// Is the eye open enough to judge the lid? (upper 159/386 vs lower 145/374)
export function eyeOpen(face, side, w, h) {
  const [up, low, a, b] = side === 'right' ? [159, 145, 33, 133] : [386, 374, 263, 362];
  const d = Math.hypot((face[up].x - face[low].x) * w, (face[up].y - face[low].y) * h);
  const ew = Math.hypot((face[a].x - face[b].x) * w, (face[a].y - face[b].y) * h);
  return d / ew > 0.12;
}

// Sample the whole grid for one eye. Returns { side, points: [{s, hh, lab}], ref: lab }
export function sampleEye(img, face, side) {
  const frame = eyeFrame(face, side, img.width, img.height);
  const lid = lidCurve(frame);
  const points = [];
  for (let s = S_RANGE[0]; s <= S_RANGE[1] + 1e-9; s += S_STEP) {
    for (let hh = H_RANGE[0]; hh <= H_RANGE[1] + 1e-9; hh += H_STEP) {
      const p = pointAt(frame, lid, s, hh);
      const lab = sampleLab(img, p.x, p.y);
      if (lab) points.push({ s: +s.toFixed(3), hh: +hh.toFixed(3), lab, edge: edgeAt(img, p.x, p.y, frame.eyeWidth * 0.04) });
    }
  }
  const refs = [];
  for (let s = REF.s[0]; s <= REF.s[1]; s += 0.1) for (let hh = REF.hh[0]; hh <= REF.hh[1]; hh += 0.1) {
    const p = pointAt(frame, lid, s, hh);
    const lab = sampleLab(img, p.x, p.y);
    if (lab) refs.push(lab);
  }
  const ref = refs.length ? [0, 1, 2].map((k) => refs.reduce((t, l) => t + l[k], 0) / refs.length) : null;
  return { side, points, ref };
}

// Both eyes at once: the "snapshot" kept as the before frame.
export function sampleFace(img, face) {
  return { right: sampleEye(img, face, 'right'), left: sampleEye(img, face, 'left') };
}

const inZone = (p, z) => p.s >= z.s[0] && p.s <= z.s[1] && p.hh >= z.hh[0] && p.hh <= z.hh[1];
const pct = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// Baseline from many steady frames: per point the median color (robust to blinks and flicker),
// its flicker (80th percentile change of single frames vs the median, light-corrected) and edge.
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
export function medianSamples(list) {
  if (!list?.length) return null;
  const eye = (side) => {
    const eyes = list.map((f) => f[side]);
    const refs = eyes.map((e) => e.ref).filter(Boolean);
    const ref = refs.length ? [0, 1, 2].map((k) => median(refs.map((r) => r[k]))) : null;
    const maps = eyes.map((e) => new Map(e.points.map((p) => [`${p.s}|${p.hh}`, p])));
    const points = eyes[0].points.map((p0) => {
      const k = `${p0.s}|${p0.hh}`;
      const ps = maps.map((m) => m.get(k)).filter(Boolean);
      const lab = [0, 1, 2].map((c) => median(ps.map((p) => p.lab[c])));
      const ds = eyes.map((e, i) => {
        const p = maps[i].get(k); if (!p) return 0;
        const sh = ref && e.ref ? e.ref.map((v, c) => v - ref[c]) : [0, 0, 0];
        return dE([p.lab[0] - sh[0], p.lab[1] - sh[1], p.lab[2] - sh[2]], lab);
      });
      return { s: p0.s, hh: p0.hh, lab, edge: median(ps.map((p) => p.edge || 0)), noise: pct(ds, 0.8) || 0 };
    });
    return { side, points, ref };
  };
  return { right: eye('right'), left: eye('left') };
}

// Mean brow-bone lightness of both eyes (how well lit the face is), or null.
export function faceLight(sample) {
  const ls = [sample?.right?.ref, sample?.left?.ref].filter(Boolean).map((r) => r[0]);
  return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
}

// Glasses guess: a frame rim is a sharp light-to-dark jump between two grid rows that runs
// across most of the eye width, on the lid / under-brow area, on BOTH eyes.
function rimRow(eye) {
  const L = new Map(eye.points.map((p) => [`${p.s}|${p.hh}`, p.lab[0]]));
  const rows = [...new Set(eye.points.map((p) => p.hh))].sort((x, y) => x - y).filter((h) => h > 0.15 && h < 0.75);
  const cols = [...new Set(eye.points.map((p) => p.s))].filter((s) => s >= -0.4 && s <= 0.5);
  return rows.some((h) => {
    const h2 = +(h + 0.08).toFixed(3);
    const jumps = cols.map((s) => { const a = L.get(`${s}|${h}`), b = L.get(`${s}|${h2}`); return a == null || b == null ? 0 : Math.abs(a - b); });
    return jumps.filter((j) => j > 15).length / (cols.length || 1) > 0.6;
  });
}
export function glassesLikely(before) {
  if (!before?.right?.points?.length || !before?.left?.points?.length) return false;
  return rimRow(before.right) && rimRow(before.left);
}

// Average two snapshots (same grid): smooths webcam noise. w = weight of the new one.
export function blendSamples(prev, cur, w = 0.5) {
  if (!prev) return cur;
  const mix = (a, b) => a.map((v, i) => v * (1 - w) + b[i] * w);
  const eye = (pa, pb) => {
    const old = new Map(pa.points.map((p) => [`${p.s}|${p.hh}`, p.lab]));
    return {
      ...pb,
      ref: pa.ref && pb.ref ? mix(pa.ref, pb.ref) : pb.ref,
      points: pb.points.map((p) => { const o = old.get(`${p.s}|${p.hh}`); return o ? { ...p, lab: mix(o, p.lab) } : p; }),
    };
  };
  return { right: eye(prev.right, cur.right), left: eye(prev.left, cur.left) };
}

// Per-point color change of one eye, now vs before (light-corrected with the reference band).
export function diffEye(before, now) {
  // Light / white-balance change, from the brow-bone reference (no makeup there).
  const sh = before.ref && now.ref ? now.ref.map((v, c) => v - before.ref[c]) : [0, 0, 0];
  const map = new Map(before.points.map((p) => [`${p.s}|${p.hh}`, p]));
  const diffs = [];
  for (const p of now.points) {
    const b = map.get(`${p.s}|${p.hh}`);
    if (!b) continue;
    diffs.push({ s: p.s, hh: p.hh, d: dE([p.lab[0] - sh[0], p.lab[1] - sh[1], p.lab[2] - sh[2]], b.lab), noise: b.noise || 0, edge: b.edge || 0 });
  }
  return diffs;
}

// Blend softness of a diff list: mean dE per row, then the steepest drop above the peak row.
// 1 = soft fade, 0 = hard line. null when there is no clear color.
function blendOf(diffs) {
  const rows = new Map();
  for (const p of diffs) { if (!rows.has(p.hh)) rows.set(p.hh, []); rows.get(p.hh).push(p.d); }
  const prof = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([hh, ds]) => ({ hh, m: ds.reduce((t, x) => t + x, 0) / ds.length }));
  if (!prof.length) return null;
  const peakIdx = prof.reduce((bi, r, i) => (r.m > prof[bi].m ? i : bi), 0);
  const peak = prof[peakIdx].m;
  if (peak < DE_THRESHOLD) return null;
  let drop = 0;
  for (let i = peakIdx + 1; i < prof.length; i++) drop = Math.max(drop, prof[i - 1].m - prof[i].m);
  return Math.max(0, Math.min(1, 1 - drop / peak / 0.6));
}

const key = (p) => `${p.s}|${p.hh}`;

// The expected change for a step on THIS face: the difference between the goal image of the
// previous step and the goal image of this step (YouCam try-ons of her own selfie), sampled on
// the same landmark grid. Because the grid is tied to landmarks, it transfers to the live face.
export function expectedEye(goalBefore, goalAfter, zone, goalBare = null) {
  let diffs = diffEye(goalBefore, goalAfter).filter((p) => p.s >= zone.s[0] - 0.1 && p.s <= zone.s[1] + 0.1);
  // When this step is coached BEFORE the layer under it (e.g. crease before lid color), the
  // user starts from bare skin: keep only points that also changed vs the bare image.
  if (goalBare) {
    const bare = new Map(diffEye(goalBare, goalAfter).map((p) => [key(p), p.d]));
    diffs = diffs.map((p) => ({ ...p, d: Math.min(p.d, bare.get(key(p)) ?? 0) }));
  }
  const on = diffs.filter((p) => p.d > DE_THRESHOLD);
  if (on.length < 6) return null; // the goal barely changed here: fall back to the fixed zone
  return { keys: new Set(on.map(key)), goalD: new Map(on.map((p) => [key(p), p.d])), top: pct(on.map((p) => p.hh), 0.9), blend: zone.blend ? blendOf(diffs) : null };
}
export function expectedFor(step, goalBefore, goalAfter, profile, goalBare = null) {
  const zone = zonesFor(step, creaseHeight(profile));
  if (!zone || !goalBefore || !goalAfter) return null;
  const right = expectedEye(goalBefore.right, goalAfter.right, zone, goalBare?.right);
  const left = expectedEye(goalBefore.left, goalAfter.left, zone, goalBare?.left);
  return right && left ? { right, left } : null;
}

// Compare one eye now vs before. exp (optional) = expectedEye() for this eye; without it the
// fixed zone for the step is used.
export function compareEye(before, now, zone, exp = null, opts = {}) {
  const live = Boolean(opts.live);
  // Live: skip points on strong edges (glasses frames) and use a dead zone + per-point noise.
  const diffs = diffEye(before, now).filter((p) => !live || p.edge <= EDGE_MAX);
  const floor = (p) => (live ? Math.max(DE_DEAD, NOISE_K * p.noise + 2) : 0);
  const inTarget = exp ? (p) => exp.keys.has(key(p)) : (p) => inZone(p, zone);
  const top = exp ? exp.top : zone.top;
  const zonePts = diffs.filter(inTarget);
  const need = exp?.goalD ? (p) => Math.max(DE_MIN, floor(p), 0.5 * (exp.goalD.get(key(p)) ?? DE_THRESHOLD * 2)) : (p) => Math.max(DE_THRESHOLD, floor(p));
  const vis = (p) => p.d > Math.max(DE_THRESHOLD, floor(p));
  const changed = zonePts.filter((p) => p.d > need(p));
  const coverage = zonePts.length ? changed.length / zonePts.length : 0;
  // Coverage per area of the eye (inner / middle / outer third of the zone), to say WHERE.
  const zs = exp ? [Math.min(...zonePts.map((p) => p.s)), Math.max(...zonePts.map((p) => p.s))] : zone.s;
  const third = (p) => { const t = (p.s - zs[0]) / ((zs[1] - zs[0]) || 1); return t < 1 / 3 ? 'inner' : t < 2 / 3 ? 'middle' : 'outer'; };
  const areas = {};
  for (const a of ['inner', 'middle', 'outer']) {
    const ps = zonePts.filter((p) => third(p) === a);
    if (ps.length >= 3) areas[a] = ps.filter((p) => p.d > need(p)).length / ps.length;
  }
  const weakest = Object.entries(areas).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  // Share with a clearly visible change (fixed threshold): tells real color from light shifts.
  const strong = zonePts.length ? zonePts.filter(vis).length / zonePts.length : 0;
  // Everything that changed in the zone's columns, at any height, to see how high it reaches.
  const cols = diffs.filter((p) => p.s >= zone.s[0] && p.s <= zone.s[1]);
  const colChanged = cols.filter(vis);
  const height = pct(colChanged.map((p) => p.hh), 0.9);
  const above = cols.filter((p) => p.hh > top + 0.08 && p.hh <= top + 0.3 && !inTarget(p));
  const spill = above.length ? above.filter(vis).length / above.length : 0;
  const blend = zone.blend ? blendOf(cols) : null;
  const meanDE = zonePts.length ? zonePts.reduce((t, p) => t + p.d, 0) / zonePts.length : 0;
  return { coverage, strong, height, spill, blend, meanDE, top, goalBlend: exp?.blend ?? null, areas, weakest };
}

// Full check for a step. before/now = sampleFace() results; expected = expectedFor() or null.
export function compareStep(step, before, now, profile, expected = null, opts = {}) {
  const zone = zonesFor(step, creaseHeight(profile));
  if (!zone || !before || !now) return null;
  const right = compareEye(before.right, now.right, zone, expected?.right, opts);
  const left = compareEye(before.left, now.left, zone, expected?.left, opts);
  // Heights are compared relative to each eye's own target, so a goal that is a bit uneven
  // (faces are) does not count as asymmetric.
  const rel = (e) => (e.height == null ? null : e.height - e.top);
  const symmetry = {
    // Capped: once both eyes are well covered, extra fill on one side is not asymmetry.
    coverage: Math.abs(Math.min(right.coverage, 0.8) - Math.min(left.coverage, 0.8)),
    height: rel(right) != null && rel(left) != null ? Math.abs(rel(right) - rel(left)) : 0,
  };
  return { step, zone, right, left, symmetry, fromGoal: Boolean(expected) };
}

// Target coverage per step (the liner band is thin, so a bit less is fine).
export const NEED = { base: 0.55, crease: 0.5, outer: 0.5, liner: 0.5, wing: 0.4 };
const T = (id, text, level = 'fix') => ({ id, text, level });

// The first action of each step: shown while no color is on yet (instead of "fill in more").
export const STEP_START = {
  base: 'Sweep the brown shadow across your whole lid, from lashes to crease.',
  crease: 'Press the darker shade on the outer half of your lid, then blend up into the fold.',
  outer: 'Press the black shadow into the outer corner of each eye in a sideways V.',
  liner: 'Draw small dashes along your top lashes, from the inner to the outer corner.',
  wing: 'From the outer corner, draw a short line toward the end of your brow.',
};
const AREA = { inner: 'near the inner corner', middle: 'in the middle of the lid', outer: 'near the outer corner' };
const LINE_AREA = { inner: 'at the inner corner', middle: 'in the middle of the lash line', outer: 'at the outer corner' };
const anyColorOf = (c) => c.right.strong > 0.15 || c.left.strong > 0.15;

// 0..1 progress for the bar: 0 until real color shows (so a bare face stays at 0).
export function stepProgress(c) {
  if (!c || !anyColorOf(c)) return 0;
  const need = (NEED[c.step] ?? 0.5) * (c.fromGoal ? 1 : 0.5);
  const cov = (Math.min(c.right.coverage, need) + Math.min(c.left.coverage, need)) / 2;
  return Math.max(0, Math.min(1, cov / need));
}

// Turn a comparison into one tip and a pass/fail. Order = most important first.
// Eyes are named as the user sees them in the mirror (your right eye = right side of the screen).
export function judge(c) {
  if (!c) return { ok: false, tip: null };
  const { step, zone, right, left, symmetry } = c;
  // Without goal images the fixed zones are wider than the real color, so ask for less.
  const need = (NEED[step] ?? 0.5) * (c.fromGoal ? 1 : 0.5);
  const eyes = [['right', right], ['left', left]];
  if (!anyColorOf(c)) return { ok: false, tip: T('cmp_none', STEP_START[step] || "I don't see color here yet.", 'info') };
  const what = { base: 'lid color', crease: 'darker shade', outer: 'black shadow', liner: 'liner', wing: 'wing' }[step] || 'color';
  for (const [side, e] of eyes) {
    if (e.spill > 0.35 || (c.fromGoal && e.height != null && e.height > e.top + 0.12)) {
      if (zone.thin) return { ok: false, tip: T('cmp_thick', `Your ${side} liner is getting thick. Keep it right on the lash line.`) };
      if (step === 'wing') return { ok: false, tip: T('cmp_high', `Your ${side} wing is too thick. Keep it thin and pointed.`) };
      return { ok: false, tip: T('cmp_high', `The ${what} on your ${side} eye goes too high. Keep it below the brow bone.`) };
    }
  }
  const low = eyes.filter(([, e]) => e.coverage < need);
  if (low.length) {
    const areaTxt = zone.thin ? LINE_AREA : AREA;
    const verb = zone.thin || step === 'wing' ? 'Draw more' : 'Add more';
    if (low.length === 2) {
      const [a, b] = [low[0][1].weakest, low[1][1].weakest];
      const where = a && a === b ? `, ${areaTxt[a]}` : '';
      const none = low.every(([, e]) => e.strong < 0.1);
      if (none) return { ok: false, tip: T('cmp_cover', STEP_START[step] || `${verb} on both eyes.`) };
      return { ok: false, tip: T('cmp_cover', `${verb} on both eyes${where}.`) };
    }
    const [side, e] = low[0];
    return { ok: false, tip: T('cmp_cover', `${verb} on your ${side} eye${e.weakest ? `, ${areaTxt[e.weakest]}` : ''}.`) };
  }
  if (step === 'crease' || step === 'base') {
    for (const [side, e] of eyes) {
      if (e.height != null && e.height < e.top - 0.15) return { ok: false, tip: T('cmp_low', `Take the ${what} on your ${side} eye up to the fold.`) };
    }
  }
  if (symmetry.coverage > 0.25 || symmetry.height > 0.12) {
    const more = right.coverage + (right.height ?? 0) - right.top > left.coverage + (left.height ?? 0) - left.top ? 'right' : 'left';
    const less = more === 'right' ? 'left' : 'right';
    return { ok: false, tip: T('cmp_sym', `Your ${more} eye has more. Add a little to your ${less} eye to match.`) };
  }
  if (zone.blend) {
    for (const [side, e] of eyes) {
      const want = Math.min(0.5, (e.goalBlend ?? 0.65) - 0.25);
      if (e.blend != null && e.blend < want) return { ok: false, tip: T('cmp_blend', `Looks good. Blend the top edge on your ${side} eye: small circles with a clean brush.`) };
    }
  }
  return { ok: true, tip: T('cmp_ok', 'Looks good on both eyes. Tap Next step.', 'good') };
}

// Keeps "step done" stable: the check must pass for holdMs in a row.
export function doneTracker(holdMs = 1500) {
  let since = null;
  return (ok, now) => {
    if (!ok) { since = null; return false; }
    since ??= now;
    return now - since >= holdMs;
  };
}
