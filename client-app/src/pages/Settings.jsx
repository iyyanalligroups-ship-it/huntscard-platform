import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Card status -- pause/unpause the public profile (see routes/public.js's
  // cardActive checks). Fetched independently of the password form above,
  // since this page had no other reason to load the profile before.
  const [cardActive, setCardActive] = useState(null); // null while loading
  const [cardStatusError, setCardStatusError] = useState('');
  const [cardStatusBusy, setCardStatusBusy] = useState(false);

  // Individual physical cards -- distinct from the whole-profile toggle
  // above. A client can have several cards (see backend/models/Card.js);
  // this lists them (number, type, active) with a per-card deactivate.
  // Never shows a password -- that's admin-only.
  const [cards, setCards] = useState(null); // null while loading
  const [cardsError, setCardsError] = useState('');
  const [busyCardNumber, setBusyCardNumber] = useState(null);

  useEffect(() => {
    api
      .getProfile()
      .then((p) => setCardActive(p.cardActive !== false))
      .catch(() => {});
    api
      .getMyCards()
      .then(setCards)
      .catch((err) => setCardsError(err.message));
  }, []);

  async function handleToggleCard(card) {
    setCardsError('');
    if (card.active) {
      const confirmed = window.confirm(
        `Deactivate card #${card.cardNumber}? Anyone who taps or scans THIS specific physical card will see a "card deactivated" message until you turn it back on.`
      );
      if (!confirmed) return;
    }
    setBusyCardNumber(card.cardNumber);
    try {
      const updated = card.active ? await api.pauseMyCard(card.cardNumber) : await api.unpauseMyCard(card.cardNumber);
      setCards((prev) => prev.map((c) => (c.cardNumber === card.cardNumber ? updated : c)));
    } catch (err) {
      setCardsError(err.message);
    } finally {
      setBusyCardNumber(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePause() {
    setCardStatusError('');
    if (cardActive) {
      const confirmed = window.confirm(
        'Deactivate your card? Anyone who taps or scans it will see a "card deactivated" message until you turn it back on.'
      );
      if (!confirmed) return;
    }
    setCardStatusBusy(true);
    try {
      if (cardActive) {
        await api.pauseCard();
        setCardActive(false);
      } else {
        await api.unpauseCard();
        setCardActive(true);
      }
    } catch (err) {
      setCardStatusError(err.message);
    } finally {
      setCardStatusBusy(false);
    }
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="subtitle">Change your password whenever you like.</p>

      {error && <div className="error-banner">{error}</div>}
      {saved && !error && (
        <div className="hint" style={{ marginBottom: 16, color: 'var(--accent)' }}>
          Password updated.
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <p className="hint" style={{ marginBottom: 0 }}>At least 8 characters.</p>
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>

      {cardActive !== null && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Card status</h2>
          <p className="hint" style={{ margin: '0 0 14px' }}>
            {cardActive
              ? 'Your card is active. Anyone who taps or scans it sees your live profile.'
              : 'Your card is deactivated. Anyone who taps or scans it sees a "card deactivated" message -- your profile, vCard, and AR experience are all hidden until you turn it back on.'}
          </p>
          {cardStatusError && <div className="error-banner">{cardStatusError}</div>}
          <button
            type="button"
            className={cardActive ? 'secondary' : undefined}
            style={{ width: 'auto' }}
            onClick={handleTogglePause}
            disabled={cardStatusBusy}
          >
            {cardStatusBusy ? 'Saving…' : cardActive ? 'Deactivate card' : 'Reactivate card'}
          </button>
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Your cards</h2>
          <p className="hint" style={{ margin: '0 0 14px' }}>
            Each physical card you've been issued, listed separately -- deactivating one only affects that specific
            card, not the others.
          </p>
          {cardsError && <div className="error-banner">{cardsError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cards.map((card) => (
              <div
                key={card.cardNumber}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--panel-border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    Card #{card.cardNumber}
                    {!card.active && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--danger, #e5484d)' }}>DEACTIVATED</span>
                    )}
                  </div>
                  <div className="hint" style={{ margin: '2px 0 0' }}>
                    {card.cardType || 'No plan set'} · {card.encoded ? 'Encoded' : 'Not yet encoded'}
                  </div>
                </div>
                <button
                  type="button"
                  className={card.active ? 'secondary' : undefined}
                  style={{ width: 'auto', fontSize: 12, padding: '6px 12px' }}
                  onClick={() => handleToggleCard(card)}
                  disabled={busyCardNumber === card.cardNumber}
                >
                  {busyCardNumber === card.cardNumber ? 'Saving…' : card.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
