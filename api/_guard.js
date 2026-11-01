// Protects the YouCam units on a public deploy.
// If LIVE_PASSCODE is set, unit-spending requests must send it in the x-live-passcode header.
// Returns true if the request may go on; otherwise sends a 403 and returns false.
export function checkPasscode(req, res) {
  const need = process.env.LIVE_PASSCODE;
  if (!need) return true;
  if (req.headers['x-live-passcode'] === need) return true;
  res.status(403).json({ error: 'Live mode needs a passcode. Use demo mode instead.' });
  return false;
}
