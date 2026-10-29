import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, X } from 'lucide-react';
import { api, setSession } from '../api.js';
import ThemedSelect from './ThemedSelect.jsx';
import ThemeDatePicker from './ThemeDatePicker.jsx';
import { trackEvent } from '../siteConfig.js';

// Matches the backend's own LOGIN_OTP_RESEND_COOLDOWN_MS (routes/auth.js)
// -- purely a UX countdown here, the server enforces the real cooldown
// itself regardless of what this button shows.
const OTP_RESEND_COOLDOWN_SECONDS = 45;

function todayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Set right before a successful login/register closes the modal, so the page
// lands at the top instead of restoring the scroll position it had before.
let goToTopOnClose = false;

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
  const regResendIntervalRef = useRef(null);

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

  useEffect(() => () => {
    clearInterval(resendIntervalRef.current);
    clearInterval(regResendIntervalRef.current);
  }, []);

  // register fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [regGender, setRegGender] = useState('');
  const [regDateOfBirth, setRegDateOfBirth] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDesignation, setRegDesignation] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regOtp, setRegOtp] = useState('');
  const [regPhoneVerificationToken, setRegPhoneVerificationToken] = useState('');
  const [regOtpCooldown, setRegOtpCooldown] = useState(0);
  const [regOtpSending, setRegOtpSending] = useState(false);
  const [regOtpVerifying, setRegOtpVerifying] = useState(false);

  // password visibility toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

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
      window.scrollTo({ top: goToTopOnClose ? 0 : scrollY, left: 0, behavior: 'instant' });
      goToTopOnClose = false;
    };
  }, []);

  // Backdrop click is intentionally a no-op -- the modal only closes via
  // the X button, preventing accidental dismissal mid-form.
  function handleBackdropClick(e) {
    e.stopPropagation();
  }

  function switchLoginMethod(next) {
    setLoginMethod(next);
    setError('');
    setOtpSent(false);
    setOtp('');
    setResendCooldown(0);
    clearInterval(resendIntervalRef.current);
  }

  function startRegistrationOtpCooldown() {
    setRegOtpCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    clearInterval(regResendIntervalRef.current);
    regResendIntervalRef.current = setInterval(() => {
      setRegOtpCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(regResendIntervalRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  function handleRegistrationPhoneChange(e) {
    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
    setRegOtpSent(false);
    setRegOtp('');
    setRegPhoneVerificationToken('');
    setRegOtpCooldown(0);
    clearInterval(regResendIntervalRef.current);
  }

  async function handleRequestRegistrationOtp() {
    setError('');
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    setRegOtpSending(true);
    try {
      await api.requestRegistrationOtp(phone);
      setRegOtpSent(true);
      setRegOtp('');
      setRegPhoneVerificationToken('');
      startRegistrationOtpCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setRegOtpSending(false);
    }
  }

  async function handleVerifyRegistrationOtp() {
    setError('');
    if (!/^\d{6}$/.test(regOtp)) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    setRegOtpVerifying(true);
    try {
      const result = await api.verifyRegistrationOtp(phone, regOtp);
      setRegPhoneVerificationToken(result.verificationToken);
      clearInterval(regResendIntervalRef.current);
      setRegOtpCooldown(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegOtpVerifying(false);
    }
  }

  function onSession(res) {
    setSession({ token: res.token, clientId: res.clientId });
    trackEvent('login', { method: 'password_or_otp' });
    goToTopOnClose = true;
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
    if (!regPhoneVerificationToken) {
      setError('Verify your phone number before creating your account.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.register({
        fullName,
        phone,
        gender: regGender || undefined,
        dateOfBirth: regDateOfBirth || undefined,
        loginEmail: regEmail || undefined,
        password: regPassword,
        designation: regDesignation || undefined,
        phoneVerificationToken: regPhoneVerificationToken,
      });
      setSession({ token: res.token, clientId: res.clientId });
      trackEvent('sign_up', { method: 'phone_otp' });
      goToTopOnClose = true;
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
        <button className="auth-modal-close" onClick={onClose} aria-label="Close"><X size={22} /></button>

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
                    placeholder="Email or 10-digit phone number"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modalLoginPassword">Password</label>
                  <div className="password-input-wrap">
                    <input
                      id="modalLoginPassword"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-eye-btn"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
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
                    inputMode="numeric"
                    autoComplete="tel"
                    minLength={10}
                    maxLength={10}
                    pattern="[0-9]{10}"
                    title="Enter exactly 10 digits"
                    placeholder="e.g. 9876543210"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
                    placeholder="Enter the code you received"
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
                <input id="modalFullName" placeholder="e.g. Priya Sharma" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="modalPhone">Contact number</label>
                <input
                  id="modalPhone"
                  type="tel"
                  inputMode="numeric"
                  minLength={10}
                  maxLength={10}
                  pattern="[0-9]{10}"
                  title="Enter exactly 10 digits"
                  placeholder="e.g. 9876543210"
                  autoComplete="tel"
                  value={phone}
                  onChange={handleRegistrationPhoneChange}
                  required
                />
                <p className="hint" style={{ marginBottom: 0 }}>Enter exactly 10 digits.</p>
              </div>
              <div className="field">
                <label htmlFor="modalRegOtp">Phone verification</label>
                {regPhoneVerificationToken ? (
                  <div
                    role="status"
                    style={{ minHeight: 46, display: 'flex', alignItems: 'center', color: '#16803c', fontWeight: 600 }}
                  >
                    Phone number verified
                  </div>
                ) : regOtpSent ? (
                  <>
                    <input
                      id="modalRegOtp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      minLength={6}
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="Enter 6-digit code"
                      value={regOtp}
                      onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={handleVerifyRegistrationOtp}
                        disabled={regOtpVerifying || regOtp.length !== 6}
                        style={{ flex: 1 }}
                      >
                        {regOtpVerifying ? 'Verifying…' : 'Verify code'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleRequestRegistrationOtp}
                        disabled={regOtpCooldown > 0 || regOtpSending}
                        style={{ flex: 1 }}
                      >
                        {regOtpSending ? 'Sending…' : regOtpCooldown > 0 ? `Resend in ${regOtpCooldown}s` : 'Resend'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleRequestRegistrationOtp}
                    disabled={regOtpSending || phone.length !== 10}
                    style={{ minHeight: 46, width: '100%' }}
                  >
                    {regOtpSending ? 'Sending…' : 'Send verification code'}
                  </button>
                )}
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
                <label htmlFor="modalRegEmail">Email (optional)</label>
                <input
                  id="modalRegEmail"
                  type="email"
                  autoComplete="username"
                  placeholder="e.g. priya@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value.toLowerCase())}
                />
              </div>
              <div className="field">
                <label htmlFor="modalRegDesignation">Occupation (optional)</label>
                <input
                  id="modalRegDesignation"
                  type="text"
                  placeholder="e.g. Software Engineer, Manager"
                  value={regDesignation}
                  onChange={(e) => setRegDesignation(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="modalRegPassword">Password</label>
                <div className="password-input-wrap">
                  <input
                    id="modalRegPassword"
                    type={showRegPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Create a password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-eye-btn"
                    onClick={() => setShowRegPassword((v) => !v)}
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="hint" style={{ marginBottom: 0 }}>At least 8 characters.</p>
              </div>
              <button type="submit" disabled={loading || !regPhoneVerificationToken}>
                {loading ? 'Creating account…' : regPhoneVerificationToken ? 'Create account' : 'Verify phone to continue'}
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
