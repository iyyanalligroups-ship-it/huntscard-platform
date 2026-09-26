import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  AtSign,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { api, setSession } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

export default function Login() {
  const [mode, setMode] = useState('password'); // 'password' | 'otp'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="login-page__glow login-page__glow--one" />
      <div className="login-page__glow login-page__glow--two" />
      <div className="wave-backdrop">
        <WaveBackdrop />
      </div>

      <main className="login-shell">
        <section className="login-frame">
          <aside className="login-showcase">
            <div className="login-brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <span className="login-brand__name">HuntsTAG</span>
                <span className="login-brand__label">Client portal</span>
              </div>
            </div>

            <div className="login-showcase__content">
              <span className="login-eyebrow"><Sparkles size={15} /> One connected identity</span>
              <h2>Your digital identity, ready when you are.</h2>
              <p>Manage your smart card, contacts and immersive experiences from one secure workspace.</p>

              <div className="login-benefits">
                <span><Wifi size={17} /> NFC-ready profile</span>
                <span><BadgeCheck size={17} /> Verified connections</span>
                <span><ShieldCheck size={17} /> Protected access</span>
              </div>
            </div>

            <div className="login-showcase__footer">
              <ShieldCheck size={16} /> Secure HuntsTAG workspace
            </div>
          </aside>

          <section className="login-auth" aria-labelledby="login-title">
            <div className="login-auth__badge"><ShieldCheck size={15} /> Secure sign in</div>
            <div className="login-auth__heading">
              <span className="login-auth__icon"><KeyRound size={21} /></span>
              <div>
                <h1 id="login-title">Log in to your card</h1>
              </div>
            </div>
            <p className="login-auth__subtitle">Use the credentials you received when your HuntsTAG card was ordered.</p>

            <div className="login-mode-switch" role="tablist" aria-label="Choose sign in method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'password'}
                onClick={() => switchMode('password')}
                className={mode === 'password' ? 'active' : ''}
              >
                <LockKeyhole size={16} /> Password
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'otp'}
                onClick={() => switchMode('otp')}
                className={mode === 'otp' ? 'active' : ''}
              >
                <Smartphone size={16} /> OTP
              </button>
            </div>

            {error && <div className="error-banner login-error">{error}</div>}

            {mode === 'password' && (
              <form className="login-form" onSubmit={handlePasswordSubmit}>
                <div className="field">
                  <label htmlFor="identifier">Email or phone number</label>
                  <div className="login-input">
                    <AtSign size={18} aria-hidden="true" />
                    <input
                      id="identifier"
                      type="text"
                      autoComplete="username"
                      placeholder="name@example.com or phone"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="password">Password</label>
                  <div className="login-input">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-eye-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="login-form__meta">
                  <span><ShieldCheck size={14} /> Protected sign in</span>
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Logging in…' : <>Log in securely <ArrowRight size={18} /></>}
                </button>
              </form>
            )}

            {mode === 'otp' && !otpSent && (
              <form className="login-form" onSubmit={handleSendOtp}>
                <div className="field">
                  <label htmlFor="otp-phone">Phone number</label>
                  <div className="login-input">
                    <Smartphone size={18} aria-hidden="true" />
                    <input
                      id="otp-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="Enter your registered phone"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Sending…' : <>Send secure code <ArrowRight size={18} /></>}
                </button>
              </form>
            )}

            {mode === 'otp' && otpSent && (
              <form className="login-form" onSubmit={handleVerifyOtp}>
                <p className="login-otp-note">A code was sent to <strong>{identifier}</strong>, if an account exists for it.</p>
                <div className="field">
                  <label htmlFor="otp-code">Verification code</label>
                  <div className="login-input">
                    <KeyRound size={18} aria-hidden="true" />
                    <input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter verification code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Logging in…' : <>Verify and log in <ArrowRight size={18} /></>}
                </button>
                <button type="button" className="login-secondary" onClick={() => setOtpSent(false)}>
                  Use a different number
                </button>
              </form>
            )}

            <div className="login-auth__footer">
              <Link to="/">Back to home</Link>
              <span aria-hidden="true">•</span>
              <Link to="/shop">Don't have a card? Shop now</Link>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
