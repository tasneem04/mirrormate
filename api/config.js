// GET /api/config -> { liveNeedsPasscode, hasKey }
// Tells the browser whether live mode is possible and whether it needs a passcode.
export default function handler(req, res) {
  res.status(200).json({
    hasKey: Boolean(process.env.YOUCAM_API_KEY),
    liveNeedsPasscode: Boolean(process.env.LIVE_PASSCODE),
  });
}
