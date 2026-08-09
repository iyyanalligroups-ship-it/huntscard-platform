import { useEffect, useState } from 'react';
import { evaluateChecks } from '../lib/deviceProtectionChecks.js';

const STATE_COLOR = {
  pass: 'var(--holo-cyan)',
  warn: 'var(--warning)',
  fail: 'var(--danger)',
};

function CheckIcon({ state }) {
  const color = STATE_COLOR[state];
  if (state === 'pass') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

// Browser counterpart of the mobile app's Device Protection Check (see
// mobile-app/src/screens/DeviceSafetyCheckScreen.js) -- same idea, scoped
// to what a website can actually read. See lib/deviceProtectionChecks.js
// for why these four checks and not the OS-level ones the app has.
export default function DeviceProtectionCard() {
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    evaluateChecks().then((result) => {
      if (!cancelled) setChecks(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="dash-panel dp-panel">
      <div className="dp-header">
        <h2 className="dash-panel-title" style={{ margin: 0 }}>Device protection</h2>
        {checks && (
          <span className="dp-score">{checks.passCount} of {checks.total} checks passed</span>
        )}
      </div>
      <p className="dp-sub">
        A quick look at this browser's security features — nothing is scanned, nothing leaves this device.
      </p>

      {!checks && <p className="dp-loading">Checking…</p>}

      {checks && (
        <div className="dp-list">
          {checks.items.map((item) => (
            <div className="dp-row" key={item.key}>
              <CheckIcon state={item.state} />
              <div className="dp-row-body">
                <div className="dp-row-label">{item.label}</div>
                <div className="dp-row-detail">{item.detail}</div>
                <div className="dp-row-explain">{item.explain}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
