// An image zoomed to the eyes (from eyeFocusOf). Without a focus it shows the whole photo.
import React from 'react';

export default function EyeCrop({ src, focus, aspect = 2.6, alt = '', className = '' }) {
  if (!focus) return <img src={src} alt={alt} className={className} style={{ width: '100%', aspectRatio: aspect, objectFit: 'cover' }} />;
  const wPct = 100 / focus.w;                    // image width, % of the box width
  const hPct = wPct * focus.ratio * aspect;      // image height, % of the box height
  return (
    <div className={`eyecrop ${className}`} style={{ aspectRatio: aspect }}>
      <img src={src} alt={alt} style={{ width: `${wPct}%`, left: `${50 - focus.cx * wPct}%`, top: `${50 - focus.cy * hPct}%` }} />
    </div>
  );
}
