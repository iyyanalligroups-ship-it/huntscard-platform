import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

// Reached via the link emailed by POST /forgot-password
// (?token=<rawToken>). See routes/auth.js POST /reset-password.
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="wave-backdrop">
        <WaveBackdrop />
      </div>
      <div className="shell" style={{ position: 'relative' }}>
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">HUNTSTAG</span>
        </div>

        {!token ? (
          <>
            <h1>Invalid link</h1>
            <p className="subtitle">
              This reset link is missing its token. Request a new one from the forgot password page.
            </p>
            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/forgot-password" className="link-out">Request a new link</Link>
            </p>
          </>
        ) : done ? (
          <>
            <h1>Password reset</h1>
            <p className="subtitle">Your password has been changed. You can log in with it now.</p>
            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" className="link-out">Back to login</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Set a new password</h1>
            <p className="subtitle">Enter and confirm your new password.</p>

            {error && <div className="error-banner">{error}</div>}

            <form className="card" onSubmit={handleSubmit}>
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
              </div>
              <div className="field">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
            </form>

            <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" className="link-out">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
