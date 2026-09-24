import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { api, setSession } from '../api.js';
import ThemedSelect from './ThemedSelect.jsx';
import ThemeDatePicker from './ThemeDatePicker.jsx';

// Matches the backend's own LOGIN_OTP_RESEND_COOLDOWN_MS (routes/auth.js)
// -- purely a UX countdown here, the server enforces the real cooldown
// itself regardless of what this button shows.
const OTP_RESEND_COOLDOWN_SECONDS = 45;

function todayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function AuthModal({ mode: initialMode, onClose, redirectTo }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' | 'otp'
  const navigate = useNavigate();

  // login fields (password mode: identifier = email or phone; otp mode: identifier = phone)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const resendIntervalRef = useRef(null);

  function startResendCooldown() {
    setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(resendIntervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => () => clearInterval(resendIntervalRef.current), []);

  // register fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [regGender, setRegGender] = useState('');
  const [regDateOfBirth, setRegDateOfBirth] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Lock background scroll while the modal is open. Without this, the page
  // behind can still scroll on mobile, and browsers repaint fixed +
  // backdrop-filter elements in the wrong spot mid-scroll -- the modal
  // visibly drifts from center toward the bottom instead of staying put.
  useEffect(() => {
    const scrollY = window.scrollY;
    const { body } = document;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function switchLoginMethod(next) {
    setLoginMethod(next);
    setError('');
    setOtpSent(false);
    setOtp('');
    setResendCooldown(0);
    clearInterval(resendIntervalRef.current);
  }

  function onSession(res) {
    setSession({ token: res.token, clientId: res.clientId });
    onClose();
    navigate(res.mustChangePassword ? '/change-password' : redirectTo || '/');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
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
      await api.requestLoginOtp(loginEmail);
      setOtpSent(true);
      startResendCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      await api.requestLoginOtp(loginEmail);
      setOtp('');
      startResendCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.verifyLoginOtp(loginEmail, otp);
      onSession(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.register({
        fullName,
        phone,
        gender: regGender || undefined,
        dateOfBirth: regDateOfBirth || undefined,
        loginEmail: regEmail,
        password: regPassword,
      });
      setSession({ token: res.token, clientId: res.clientId });
      onClose();
      navigate(redirectTo || '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={handleBackdropClick}>
      <div className={`auth-modal-card${mode === 'register' ? ' auth-modal-card--register' : ''}`}>
        <button className="auth-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand-mark" />
          <span className="brand-name">HuntsTAG</span>
        </div>

        {mode === 'login' ? (
          <>
            <h1 style={{ fontSize: 20 }}>Log in to your card</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>
              Use the email/phone and password from when you registered or ordered your card.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => switchLoginMethod('password')}
                className={loginMethod === 'password' ? undefined : 'secondary'}
                style={{ width: 'auto', padding: '6px 14px' }}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => switchLoginMethod('otp')}
                className={loginMethod === 'otp' ? undefined : 'secondary'}
                style={{ width: 'auto', padding: '6px 14px' }}
              >
                OTP (phone only)
              </button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {loginMethod === 'password' && (
              <form onSubmit={handleLogin}>
                <div className="field">
                  <label htmlFor="modalLoginEmail">Email or phone number</label>
                  <input
                    id="modalLoginEmail"
                    type="text"
                    autoComplete="username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modalLoginPassword">Password</label>
                  <input
                    id="modalLoginPassword"
                    type="password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={loading}>
                  {loading ? 'Logging in…' : 'Log in'}
                </button>
              </form>
            )}

            {loginMethod === 'otp' && !otpSent && (
              <form onSubmit={handleSendOtp}>
                <div className="field">
                  <label htmlFor="modalOtpPhone">Phone number</label>
                  <input
                    id="modalOtpPhone"
                    type="tel"
                    autoComplete="tel"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send code'}
                </button>
              </form>
            )}

            {loginMethod === 'otp' && otpSent && (
              <form onSubmit={handleVerifyOtp}>
                <p className="hint">A code was sent to {loginEmail}, if an account exists for it.</p>
                <div className="field">
                  <label htmlFor="modalOtpCode">Code</label>
                  <input
                    id="modalOtpCode"
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
                <button
                  type="button"
                  className="secondary"
                  style={{ marginTop: 8 }}
                  disabled={resendCooldown > 0 || resending}
                  onClick={handleResendOtp}
                >
                  {resending ? 'Resending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
                <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => switchLoginMethod('otp')}>
                  Use a different number
                </button>
              </form>
            )}

            {loginMethod === 'password' && (
              <p className="hint" style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  className="link-out auth-modal-link"
                  onClick={() => { onClose(); navigate('/forgot-password'); }}
                >
                  Forgot password?
                </button>
              </p>
            )}

            <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
              Don't have a card?{' '}
              <button type="button" className="link-out auth-modal-link" onClick={() => { setError(''); setMode('register'); }}>
                Register
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20 }}>Create your account</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>
              Free to sign up — pick and pay for your card once you're in.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <form className="auth-register-form" onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="modalFullName">Full name</label>
                <input id="modalFullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="modalPhone">Contact number</label>
                <input
                  id="modalPhone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="modalGender">Gender (optional)</label>
                <ThemedSelect
                  id="modalGender"
                  value={regGender}
                  onChange={setRegGender}
                  ariaLabel="Gender"
                  options={[
                    { value: '', label: 'Prefer not to say' },
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="modalDob">Date of birth (optional)</label>
                <ThemeDatePicker
                  id="modalDob"
                  value={regDateOfBirth}
                  onChange={setRegDateOfBirth}
                  max={todayDateValue()}
                  ariaLabel="Date of birth"
                />
              </div>
              <div className="field">
                <label htmlFor="modalRegEmail">Email</label>
                <input
                  id="modalRegEmail"
                  type="email"
                  autoComplete="username"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value.toLowerCase())}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="modalRegPassword">Password</label>
                <input
                  id="modalRegPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
                <p className="hint" style={{ marginBottom: 0 }}>At least 8 characters.</p>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
              Already have an account?{' '}
              <button type="button" className="link-out auth-modal-link" onClick={() => { setError(''); setMode('login'); }}>
                Log in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
