import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

// Matches the backend's own RESET_OTP_RESEND_COOLDOWN_MS (routes/auth.js)
// -- purely a UX countdown here, the server enforces the real cooldown.
const OTP_RESEND_COOLDOWN_SECONDS = 45;

// Three steps, all on this one page: email in -> emailed 6-digit code
// verified in-page -> set a new password. Verifying the code (see
// routes/auth.js POST /forgot-password/verify-otp) mints the same kind of
// resetToken the old emailed-link flow used, so the final step still calls
// the existing POST /reset-password unchanged -- see pages/ResetPassword.jsx
// for that same call, reached instead via a URL token for anyone who still
// has an old link.
export default function ForgotPassword() {
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'password' | 'done'
  const [loginEmail, setLoginEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef(null);

  useEffect(() => () => clearInterval(resendIntervalRef.current), []);

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

  async function handleSendCode(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(loginEmail);
      setStep('otp');
      startResendCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      await api.forgotPassword(loginEmail);
      setOtp('');
      startResendCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.verifyForgotPasswordOtp(loginEmail, otp);
      setResetToken(res.token);
      setStep('password');
      clearInterval(resendIntervalRef.current);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      setStep('done');
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

        {step === 'email' && (
          <>
            <h1>Forgot password</h1>
            <p className="subtitle">Enter the email on your account and we'll send you a 6-digit code to reset your password.</p>

            {error && <div className="error-banner">{error}</div>}

            <form className="card" onSubmit={handleSendCode}>
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
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1>Enter your code</h1>
            <p className="subtitle">If an account exists for {loginEmail}, a 6-digit code has been sent to it. Enter it below.</p>

            {error && <div className="error-banner">{error}</div>}

            <form className="card" onSubmit={handleVerifyCode}>
              <div className="field">
                <label htmlFor="resetOtp">Code</label>
                <input
                  id="resetOtp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify code'}
              </button>
              <button
                type="button"
                className="secondary"
                style={{ marginTop: 8 }}
                disabled={resendCooldown > 0 || resending}
                onClick={handleResendCode}
              >
                {resending ? 'Resending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="secondary"
                style={{ marginTop: 8 }}
                onClick={() => { setStep('email'); setOtp(''); setError(''); clearInterval(resendIntervalRef.current); setResendCooldown(0); }}
              >
                Use a different email
              </button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <h1>Set a new password</h1>
            <p className="subtitle">Enter and confirm your new password.</p>

            {error && <div className="error-banner">{error}</div>}

            <form className="card" onSubmit={handleSetPassword}>
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
          </>
        )}

        {step === 'done' && (
          <>
            <h1>Password reset</h1>
            <p className="subtitle">Your password has been changed. You can log in with it now.</p>
          </>
        )}

        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="link-out">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
