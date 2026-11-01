// Spoken tips with the browser's built-in voice (Web Speech API). Free, works offline in most browsers.
// Throttled so it never talks over itself: at most one tip every 3 seconds.

let lastSpokenAt = 0;
let lastText = '';

export function speak(text, { minGapMs = 3000 } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  const now = Date.now();
  if (text === lastText && now - lastSpokenAt < 8000) return; // don't repeat the same tip too often
  if (now - lastSpokenAt < minGapMs) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
  lastSpokenAt = now;
  lastText = text;
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
