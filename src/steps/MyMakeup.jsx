// Step 3: show your products to the camera (or pick from a list). The app names the product type
// (free in-browser image model), you tap the shade, and it says whether it suits your skin.
// Then it checks which tools the chosen look needs that you don't have.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera } from '../lib/camera.js';
import { PRODUCTS, productById, shadeVerdict, sampleColor, missingTools, TOOL_SWAPS, productAdvice, formulaNotes, PRODUCT_KNOWLEDGE, FIT, LEVEL_TEXT, identifyWins } from '../lib/products.js';
import { getConfig, smartIdentify } from '../lib/api.js';
import { classifyProduct, loadClassifier, readLabel, mergeLabelHint } from '../lib/productVision.js';

// Free sample product photos (public/samples, see CREDITS.md) for trying without a camera.
const SAMPLES = [
  ['palette-63f72c2e.jpg', 'Closed palette (shows the open-it tip)'],
  ['mascara-2b2985be.jpg', 'Vintage mascara (try Read the label)'],
  ['liquid-liner-25bfdad6.jpg', 'Liquid liner'],
  ['pencil-53e546ce.jpg', 'Eyeliner pencil'],
  ['palette-brushes-398756f9.jpg', 'Palette and brushes'],
  ['lipstick-6d4952d2.jpg', 'Lipstick (not an eye product)'],
];

// Load an image (file or URL) into a canvas, at most maxSide px.
function imageToCanvas(src, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Could not open that image.'));
    img.src = src;
  });
}

const VERDICT_LABEL = { great: 'Great match', ok: 'Works', careful: 'Be careful' };

// Copy the centered scan box of the (cover-fitted, mirrored) camera view into a canvas.
function cropBox(video, container) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cA = container.clientWidth / container.clientHeight;
  const vA = vw / vh;
  // Part of the video that is visible in the container (object-fit: cover).
  const visW = vA > cA ? vh * cA : vw;
  const visH = vA > cA ? vh : vw / cA;
  const bw = visW * 0.52, bh = visH * 0.6; // same size as .cam .box in CSS
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bw);
  canvas.height = Math.round(bh);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // mirror, like the preview
  ctx.drawImage(video, (vw - bw) / 2, (vh - bh) / 2, bw, bh, 0, 0, bw, bh);
  return canvas;
}

export default function MyMakeup({ session, update, next, back }) {
  const { profile, look } = session;
  const videoRef = useRef(null);
  const camRef = useRef(null);
  const streamRef = useRef(null);
  const frozenRef = useRef(null);  // canvas of the scanned item
  const [camOn, setCamOn] = useState(false);
  const [frozen, setFrozen] = useState(null);      // data URL of the scanned crop
  const [guesses, setGuesses] = useState(null);    // [{product, score}]
  const [sure, setSure] = useState(false);         // confident top guess?
  const [picking, setPicking] = useState(null);    // product waiting for a shade tap
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState(session.items || []);
  const [label, setLabel] = useState(null);        // { text } read from the pack, or null
  const [hasGemini, setHasGemini] = useState(false); // server has GEMINI_API_KEY
  const [smart, setSmart] = useState(null);        // Gemini result for this photo

  useEffect(() => () => stopCamera(streamRef.current), []);
  useEffect(() => { getConfig().then((c) => setHasGemini(Boolean(c.hasGemini))); }, []);
  useEffect(() => { update({ items }); }, [items]); // keep App state in sync

  async function openCamera() {
    setError('');
    try {
      streamRef.current = await startCamera(videoRef.current);
      setCamOn(true);
      // Start downloading the image model in the background.
      loadClassifier((pct) => setBusy(pct < 100 ? `Loading the product model... ${pct}%` : '')).catch(() => {});
    } catch {
      setError('Could not open the camera. You can still pick items from the list below.');
    }
  }

  function scan() {
    analyze(cropBox(videoRef.current, camRef.current));
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { analyze(await imageToCanvas(URL.createObjectURL(f))); } catch (err) { setError(err.message); }
  }

  async function useSample(file) {
    try { analyze(await imageToCanvas(`/samples/${file}`)); } catch (err) { setError(err.message); }
  }

  // Name the product in a canvas (camera crop, upload or sample).
  async function analyze(canvas) {
    setError('');
    setPicking(null);
    frozenRef.current = canvas;
    setFrozen(canvas.toDataURL('image/jpeg', 0.9));
    setGuesses(null);
    setLabel(null);
    setSmart(null);
    setBusy('Looking at your item...');
    try {
      await loadClassifier((pct) => setBusy(pct < 100 ? `Loading the product model (once)... ${pct}%` : 'Looking at your item...'));
      const r = await classifyProduct(canvas);
      setSure(r.sure);
      if (r.notProduct) {
        setError(r.notProduct);
        setFrozen(null);
      } else {
        setGuesses(r.guesses);
      }
    } catch (e) {
      setError('The product model could not run here. Pick the item from the list instead.');
      console.error(e);
    } finally {
      setBusy('');
    }
  }

  // Optional: read the text on the pack with a second, bigger model (downloads once).
  async function onReadLabel() {
    setError('');
    setBusy('Reading the label...');
    try {
      const r = await readLabel(frozenRef.current, (pct) => setBusy(pct < 100 ? `Loading the label reader (once, ~550 MB)... ${pct}%` : 'Reading the label...'));
      setLabel({ text: r.text });
      if (r.hint?.not) setError(r.hint.not);
      else if (r.hint?.id) { setGuesses((g) => mergeLabelHint(g, r.hint)); setSure(true); }
    } catch (e) {
      setError('Could not read the label here. Pick the item from the guesses or the list.');
      console.error(e);
    } finally {
      setBusy('');
    }
  }

  // Optional: ask Gemini (server side). Its type wins over the on-device guess when it is sure.
  async function onSmartIdentify() {
    setError('');
    setBusy('Smart identify...');
    try {
      const r = await smartIdentify(frozen);
      setSmart(r);
      if (r.notEye && r.confidence >= 0.7) setError('This does not look like an eye product.');
      else if (identifyWins(r)) { setGuesses((g) => mergeLabelHint(g, { id: r.type })); setSure(true); }
    } catch (e) {
      setError(e.message || 'Smart identify failed. Pick the item from the list.');
    } finally {
      setBusy('');
    }
  }

  function confirm(product) {
    setGuesses(null);
    if (product.shade && frozenRef.current) {
      setPicking(product); // now wait for a tap on the photo
    } else {
      addItem(product, null);
      setFrozen(null);
    }
  }

  function onPhotoTap(e) {
    if (!picking) return;
    const canvas = frozenRef.current;
    // The photo is shown with object-fit: contain, so find where the image really sits in the box.
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offX = (rect.width - canvas.width * scale) / 2;
    const offY = (rect.height - canvas.height * scale) / 2;
    const x = (e.clientX - rect.left - offX) / scale;
    const y = (e.clientY - rect.top - offY) / scale;
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;
    addItem(picking, sampleColor(canvas, x, y));
    setPicking(null);
    setFrozen(null);
  }

  function addItem(product, shade) {
    const verdict = shade ? shadeVerdict(product, shade, profile) : null;
    const smartName = smart ? [smart.brand, smart.name].filter(Boolean).join(' ') : '';
    const name = smartName || label?.text || null;
    const notes = [...formulaNotes(`${name || ''} ${smart?.formula || ''} ${smart?.finish || ''}`.trim(), profile), ...productAdvice(product.id, profile)].slice(0, 2);
    setItems((list) => [...list, { key: Date.now() + Math.random(), productId: product.id, shade, verdict, name, notes }]);
    setLabel(null);
    setSmart(null);
  }

  const owned = items.map((i) => i.productId);
  const missing = look ? missingTools(look, owned) : [];
  const needsPrimer = profile?.oily && !owned.includes('primer') && !owned.includes('concealer');

  return (
    <section className="stack">
      <div>
        <h2>Your makeup</h2>
        <p className="muted">One product at a time. Open palettes so the colors show.</p>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="cam" ref={camRef}>
            <video ref={videoRef} className="mirror" hidden={Boolean(frozen)} />
            {frozen && (
              <img
                className="frozen"
                src={frozen}
                alt="Scanned item"
                onClick={onPhotoTap}
                style={{ objectFit: 'contain', cursor: picking ? 'crosshair' : 'default', background: '#1d1a1b' }}
              />
            )}
            {camOn && !frozen && <div className="box" />}
            {!camOn && !frozen && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <button className="btn big" onClick={openCamera}>Open camera</button>
              </div>
            )}
            {picking && <div className="hint">Tap the shade you will use</div>}
          </div>

          <div className="actions" style={{ position: 'static', padding: 0, background: 'none' }}>
            {camOn && !frozen && <button className="btn big" onClick={scan} disabled={Boolean(busy)}>Scan this item</button>}
            <label className={`btn big ghost ${busy ? 'disabled' : ''}`}>
              Upload a photo
              <input type="file" accept="image/*" hidden onChange={onFile} disabled={Boolean(busy)} />
            </label>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">No products here? Try a sample photo:</span>
            <div className="sample-row">
              {SAMPLES.map(([file, name]) => (
                <button key={file} onClick={() => useSample(file)} disabled={Boolean(busy)} title={name} aria-label={`Sample: ${name}`}>
                  <img src={`/samples/${file}`} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
          {busy && <div className="row small"><span className="spinner" aria-hidden="true" /><span role="status">{busy}</span></div>}

          {guesses && guesses.length > 0 && (
            <div className="card stack">
              <h3>{sure ? 'Looks like' : 'Maybe'} your {guesses[0].product.label.toLowerCase()}. Right?</h3>
              {label?.text && <p className="small" style={{ margin: 0 }}>Label says: <strong>{label.text}</strong></p>}
              {label && !label.text && <p className="small muted" style={{ margin: 0 }}>No clear text on the label. Turn the name toward the camera.</p>}
              <div className="row">
                {guesses.map((g) => (
                  <button key={g.product.id} className="chip" onClick={() => confirm(g.product)}>
                    {g.product.label} <span className="muted small">{Math.round(g.score * 100)}%</span>
                  </button>
                ))}
                <button className="chip" onClick={() => { setGuesses(null); setFrozen(null); setLabel(null); setSmart(null); }}>None of these</button>
              </div>
              {smart && (
                <p className="small" style={{ margin: 0 }}>
                  Smart identify: <strong>{[smart.brand, smart.name].filter(Boolean).join(' ') || 'no brand visible'}</strong>
                  {[smart.finish, smart.formula].filter(Boolean).length > 0 && ` (${[smart.finish, smart.formula].filter(Boolean).join(', ')})`}
                  {smart.goodFor.length > 0 && ` · Good for: ${smart.goodFor.join(', ')}`}
                  {smart.badFor.length > 0 && ` · Not for: ${smart.badFor.join(', ')}`}
                  {smart.note && <><br /><span className="muted">{smart.note}</span></>}
                </p>
              )}
              <p className="small muted" style={{ margin: 0 }}>
                {PRODUCT_KNOWLEDGE[guesses[0].product.id]?.what}
                {FIT[guesses[0].product.id] && ` ${LEVEL_TEXT[FIT[guesses[0].product.id].level]}.`}
              </p>
              <div className="row">
                {!label && <button className="btn ghost small" onClick={onReadLabel} disabled={Boolean(busy)}>Read the label</button>}
                {hasGemini && !smart && <button className="btn ghost small" onClick={onSmartIdentify} disabled={Boolean(busy)}>Smart identify</button>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>Not right? Pick it from the list below.</p>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}

          <div className="card stack">
            <h3>Or add from the list</h3>
            <div className="row">
              {PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => (p.shade && frozenRef.current && frozen ? confirm(p) : addItem(p, null))}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>What you have</h3>
            {!items.length && <p className="muted small" style={{ margin: 0 }}>Nothing yet.</p>}
            {items.map((it) => {
              const p = productById(it.productId);
              return (
                <div key={it.key} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  {it.shade ? <span className="swatch" style={{ background: it.shade }} aria-hidden="true" /> : <span className="swatch" style={{ background: 'var(--accent-soft)' }} aria-hidden="true" />}
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <strong>{p.label}</strong>
                      {it.verdict && <span className={`badge ${it.verdict.level}`}>{VERDICT_LABEL[it.verdict.level]}</span>}
                    </div>
                    {it.name && <p className="small" style={{ margin: 0 }}>{it.name}</p>}
                    {it.verdict && <p className="small muted" style={{ margin: 0 }}>{it.verdict.text}</p>}
                    {(it.notes || productAdvice(it.productId, profile).slice(0, 2)).map((n) => <p key={n} className="small muted" style={{ margin: 0 }}>{n}</p>)}
                  </div>
                  <button className="btn ghost small" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} aria-label={`Remove ${p.label}`}>×</button>
                </div>
              );
            })}
          </div>

          {look && (
            <div className="card stack">
              <h3>Tools for "{look.name}"</h3>
              {look.tools.map((t) => (
                <div key={t} className="row small">
                  <span className={`badge ${missing.includes(t) ? 'careful' : 'great'}`}>{missing.includes(t) ? 'Missing' : 'Have it'}</span>
                  {productById(t)?.label}
                </div>
              ))}
              {missing.map((t) => <p key={t} className="small muted" style={{ margin: 0 }}>{TOOL_SWAPS[t]}</p>)}
              {needsPrimer && <p className="small" style={{ margin: 0 }}>Your lids may get oily. An eye primer, or a thin layer of concealer, helps the shadow last.</p>}
            </div>
          )}

          <div className="actions">
            <button className="btn big" onClick={() => { stopCamera(streamRef.current); next(); }}>Next: start coaching</button>
            <button className="btn ghost" onClick={back}>Back</button>
          </div>
        </div>
      </div>
    </section>
  );
}
