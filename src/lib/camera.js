// Webcam helpers.

export async function startCamera(video, { width = 1280, height = 720 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height } },
    audio: false,
  });
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Grab the current frame as a JPEG data URL, at most maxSide px on the long side.
// mirror=true flips it like a mirror (what the user sees on screen).
export function snapshot(source, { maxSide = 1280, mirror = false, quality = 0.9 } = {}) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// Read a picked file into a resized JPEG data URL.
export function fileToDataUrl(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(snapshot(img, { maxSide }));
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Average brightness (0-255) of a video frame, from a tiny downscaled copy.
let tiny = null;
export function brightness(video) {
  if (!video.videoWidth) return null;
  tiny ??= document.createElement('canvas');
  tiny.width = 32;
  tiny.height = 18;
  const ctx = tiny.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 32, 18);
  const d = ctx.getImageData(0, 0, 32, 18).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}
