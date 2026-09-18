import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

export default function Login() {
  const [mode, setMode] = useState('password'); // 'password' | 'otp'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // OTP mode state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  function switchMode(next) {
    setMode(next);
    setError('');
    setOtpSent(false);
    setOtp('');
  }

  function onSession(res) {
    setSession({ token: res.token, clientId: res.clientId });
    navigate(res.mustChangePassword ? '/change-password' : '/');
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(identifier, password);
      onSession(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.requestLoginOtp(identifier);
      setOtpSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.verifyLoginOtp(identifier, otp);
      onSession(res);
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
          <span className="brand-name">huntsTAG</span>
        </div>

      <h1>Log in to your card</h1>
      <p className="subtitle">Use the email and password you were sent when your card was ordered.</p>

      <div className="hint" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => switchMode('password')}
          className={mode === 'password' ? undefined : 'secondary'}
          style={{ width: 'auto', padding: '6px 14px' }}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => switchMode('otp')}
          className={mode === 'otp' ? undefined : 'secondary'}
          style={{ width: 'auto', padding: '6px 14px' }}
        >
          OTP (phone only)
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {mode === 'password' && (
        <form className="card" onSubmit={handlePasswordSubmit}>
          <div className="field">
            <label htmlFor="identifier">Email or phone number</label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      )}

      {mode === 'otp' && !otpSent && (
        <form className="card" onSubmit={handleSendOtp}>
          <div className="field">
            <label htmlFor="otp-phone">Phone number</label>
            <input
              id="otp-phone"
              type="tel"
              autoComplete="tel"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </form>
      )}

      {mode === 'otp' && otpSent && (
        <form className="card" onSubmit={handleVerifyOtp}>
          <p className="hint">A code was sent to {identifier}, if an account exists for it.</p>
          <div className="field">
            <label htmlFor="otp-code">Code</label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
          <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => setOtpSent(false)}>
            Use a different number
          </button>
        </form>
      )}

      <p className="hint" style={{ textAlign: 'center', marginTop: 12 }}>
        <Link to="/forgot-password" className="link-out">Forgot password?</Link>
      </p>

      <p className="hint" style={{ textAlign: 'center', marginTop: 4 }}>
        <Link to="/" className="link-out">Back to Home</Link>
        {' · '}
        <Link to="/shop" className="link-out">Don't have a card? Shop now</Link>
      </p>
      </div>
    </div>
  );
}
