// Step 3: show your products to the camera (or pick from a list). The app names the product type
// (free in-browser image model), you tap the shade, and it says whether it suits your skin.
// Then it checks which tools the chosen look needs that you don't have.
import React, { useEffect, useRef, useState } from 'react';
import { startCamera, stopCamera } from '../lib/camera.js';
import { PRODUCTS, productById, shadeVerdict, sampleColor, missingTools, TOOL_SWAPS } from '../lib/products.js';
import { classifyProduct, loadClassifier } from '../lib/productVision.js';

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

  useEffect(() => () => stopCamera(streamRef.current), []);
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

  async function scan() {
    setError('');
    const canvas = cropBox(videoRef.current, camRef.current);
    frozenRef.current = canvas;
    setFrozen(canvas.toDataURL('image/jpeg', 0.9));
    setGuesses(null);
    setBusy('Looking at your item...');
    try {
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
    setItems((list) => [...list, { key: Date.now() + Math.random(), productId: product.id, shade, verdict }]);
  }

  const owned = items.map((i) => i.productId);
  const missing = look ? missingTools(look, owned) : [];
  const needsPrimer = profile?.oily && !owned.includes('primer') && !owned.includes('concealer');

  return (
    <section className="stack">
      <div>
        <h2>My makeup</h2>
        <p className="muted">Hold each eye product or brush inside the box and tap Scan. Open palettes so the colors show. Or pick it from the list.</p>
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
            {!camOn && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <button className="btn" onClick={openCamera}>Open camera</button>
              </div>
            )}
            {picking && <div className="hint">Tap the shade you will use</div>}
          </div>

          {camOn && !frozen && <button className="btn" onClick={scan} disabled={Boolean(busy)}>Scan this item</button>}
          {busy && <div className="row small"><span className="spinner" aria-hidden="true" /><span role="status">{busy}</span></div>}

          {guesses && guesses.length > 0 && (
            <div className="card stack">
              <h3>{sure ? 'Looks like' : 'Maybe'} your {guesses[0].product.label.toLowerCase()}. Right?</h3>
              <div className="row">
                {guesses.map((g) => (
                  <button key={g.product.id} className="chip" onClick={() => confirm(g.product)}>
                    {g.product.label} <span className="muted small">{Math.round(g.score * 100)}%</span>
                  </button>
                ))}
                <button className="chip" onClick={() => { setGuesses(null); setFrozen(null); }}>None of these</button>
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
                    {it.verdict && <p className="small muted" style={{ margin: 0 }}>{it.verdict.text}</p>}
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
            <button className="btn" onClick={() => { stopCamera(streamRef.current); next(); }}>Next: start coaching</button>
            <button className="btn ghost" onClick={back}>Back</button>
          </div>
        </div>
      </div>
    </section>
  );
}
