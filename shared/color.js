// Color helpers: hex <-> RGB <-> CIE Lab, plus simple undertone/depth rules.
// Used by the browser (product shade checks) and the spike script.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// sRGB (0-255) -> CIE Lab (D65).
export function rgbToLab([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));

// Hue angle in degrees (0 = red, 90 = yellow).
export function hueAngle([, a, b]) {
  return (Math.atan2(b, a) * 180) / Math.PI;
}

// Skin undertone from the skin color hex. Skin hue usually sits between ~45 and ~75 degrees:
// more yellow/golden -> warm, more pink/red -> cool. A rule of thumb, not a lab test.
export function undertoneFromHex(hex) {
  const h = hueAngle(hexToLab(hex));
  if (h >= 62) return 'warm';
  if (h <= 52) return 'cool';
  return 'neutral';
}

// Skin depth from lightness.
export function depthFromHex(hex) {
  const [L] = hexToLab(hex);
  if (L >= 68) return 'light';
  if (L >= 48) return 'medium';
  return 'deep';
}

// Difference between two colors (CIE76). Under ~10 = very close, over ~25 = clearly different.
export function deltaE(hexA, hexB) {
  const [a, b] = [hexToLab(hexA), hexToLab(hexB)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
