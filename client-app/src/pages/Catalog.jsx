import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Catalog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getCatalog()
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="hero-section" style={{ paddingBottom: 12 }}>
        <span className="hero-eyebrow">See it in motion</span>
        <h1>
          Every tier, <span className="grad">tapped.</span>
        </h1>
        <p>A short clip of each card type actually being tapped, so you know exactly what you're getting.</p>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center' }}>Loading...</p>}
      {error && <p className="error" style={{ textAlign: 'center' }}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 20px' }}>
          No catalog videos yet -- check back soon.
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          maxWidth: 1000,
          margin: '0 auto',
          padding: '0 24px 60px',
        }}
      >
        {entries.map((entry) => (
          <div
            key={entry.cardType}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--panel-border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}
          >
            <video
              src={entry.videoUrl}
              controls
              playsInline
              style={{ width: '100%', aspectRatio: '4 / 3', display: 'block', background: '#000' }}
            />
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>{entry.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
