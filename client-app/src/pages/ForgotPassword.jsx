import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

// One step: email in, reset link out (emailed, see routes/auth.js POST
// /forgot-password + pages/ResetPassword.jsx). Real email delivery isn't
// wired up yet, so during local testing the link shows up in the backend's
// own console output instead of a real email.
export default function ForgotPassword() {
  const [loginEmail, setLoginEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(loginEmail);
      setSent(true);
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

        {sent ? (
          <>
            <h1>Check your email</h1>
            <p className="subtitle">
              If an account exists for {loginEmail}, a password reset link has been sent. Open it to set a new password.
            </p>
          </>
        ) : (
          <>
            <h1>Forgot password</h1>
            <p className="subtitle">Enter the email on your account and we'll send you a link to reset your password.</p>

            {error && <div className="error-banner">{error}</div>}

            <form className="card" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="loginEmail">Email</label>
                <input
                  id="loginEmail"
                  type="email"
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="link-out">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
