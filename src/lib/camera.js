// Webcam helpers.

export async function startCamera(videoOrRef, { width = 1280, height = 720 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('unsupported');
    e.name = window.isSecureContext ? 'UnsupportedBrowser' : 'InsecureContext';
    throw e;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height } },
      audio: false,
    });
  } catch (e) {
    if (e.name === 'OverconstrainedError') {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } else throw e;
  }
  // The <video> may only mount after the screen switches to camera mode; wait for it.
  let video = videoOrRef?.current !== undefined ? videoOrRef.current : videoOrRef;
  for (let i = 0; !video && i < 60; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    video = videoOrRef?.current !== undefined ? videoOrRef.current : null;
  }
  if (!video) { stream.getTracks().forEach((t) => t.stop()); throw new Error('no video element'); }
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
  return stream;
}

// Plain-words reason the camera didn't open.
export function cameraErrorMessage(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera is blocked. Tap the camera or lock icon next to the web address, choose Allow, then try again. Or upload a photo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device. Upload a photo instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy in another app or tab. Close it and try again.';
    case 'UnsupportedBrowser':
      return 'This browser can\'t use the camera (in-app browsers often can\'t). Open the link in Chrome or Safari.';
    case 'InsecureContext':
      return 'The camera needs a secure https link. Open the https:// address.';
    default:
      return 'Could not open the camera. Allow camera access, or upload a photo instead.';
  }
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
