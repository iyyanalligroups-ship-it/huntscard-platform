import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { api } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

// Matches the backend's RESET_OTP_RESEND_COOLDOWN_MS. The server still
// enforces the real cooldown; this timer only communicates it in the UI.
const OTP_RESEND_COOLDOWN_SECONDS = 45;

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
      setResendCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(resendIntervalRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  async function handleSendCode(event) {
    event.preventDefault();
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

  async function handleVerifyCode(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.verifyForgotPasswordOtp(loginEmail, otp);
      setResetToken(response.token);
      setStep('password');
      clearInterval(resendIntervalRef.current);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(event) {
    event.preventDefault();
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

  function returnToEmail() {
    setStep('email');
    setOtp('');
    setError('');
    clearInterval(resendIntervalRef.current);
    setResendCooldown(0);
  }

  const copy = {
    email: {
      eyebrow: 'Account recovery',
      title: 'Forgot your password?',
      description: "Enter your account email and we'll send a secure 6-digit verification code.",
    },
    otp: {
      eyebrow: 'Verify your identity',
      title: 'Enter your code',
      description: `We sent a 6-digit code to ${loginEmail}. Enter it below to continue.`,
    },
    password: {
      eyebrow: 'Secure your account',
      title: 'Create a new password',
      description: 'Choose a strong password with at least 8 characters.',
    },
    done: {
      eyebrow: 'Recovery complete',
      title: 'Password updated',
      description: 'Your password has been changed successfully. You can now sign in with it.',
    },
  }[step];

  const activeStep = step === 'email' ? 1 : step === 'otp' ? 2 : 3;

  return (
    <div className="login-page recovery-page">
      <div className="login-page__glow login-page__glow--one" />
      <div className="login-page__glow login-page__glow--two" />
      <div className="wave-backdrop"><WaveBackdrop /></div>

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
              <span className="login-eyebrow"><Sparkles size={15} /> Secure account recovery</span>
              <h2>Get back to your digital identity.</h2>
              <p>Verify your account securely, choose a new password and continue managing your HuntsTAG experience.</p>
              <div className="login-benefits">
                <span><Mail size={17} /> Email verification</span>
                <span><KeyRound size={17} /> One-time secure code</span>
                <span><ShieldCheck size={17} /> Protected password reset</span>
              </div>
            </div>

            <div className="login-showcase__footer">
              <Wifi size={16} /> Connected securely by HuntsTAG
            </div>
          </aside>

          <section className="login-auth recovery-auth" aria-labelledby="recovery-title">
            <div className="login-auth__badge"><ShieldCheck size={15} /> Secure recovery</div>

            <div className="recovery-progress" aria-label={`Recovery step ${activeStep} of 3`}>
              {[1, 2, 3].map((number) => (
                <span key={number} className={activeStep >= number ? 'active' : ''}>
                  <i>{activeStep > number || step === 'done' ? <CheckCircle2 size={14} /> : number}</i>
                </span>
              ))}
            </div>

            <div className="login-auth__heading">
              <span className="login-auth__icon">
                {step === 'done' ? <CheckCircle2 size={22} /> : <RotateCcw size={21} />}
              </span>
              <div>
                <p>{copy.eyebrow}</p>
                <h1 id="recovery-title">{copy.title}</h1>
              </div>
            </div>
            <p className="login-auth__subtitle">{copy.description}</p>

            {error && <div className="error-banner login-error">{error}</div>}

            {step === 'email' && (
              <form className="login-form" onSubmit={handleSendCode}>
                <div className="field">
                  <label htmlFor="loginEmail">Account email</label>
                  <div className="login-input">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="loginEmail"
                      type="email"
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Sending…' : <>Send verification code <ArrowRight size={18} /></>}
                </button>
              </form>
            )}

            {step === 'otp' && (
              <form className="login-form" onSubmit={handleVerifyCode}>
                <div className="field">
                  <label htmlFor="resetOtp">Verification code</label>
                  <div className="login-input recovery-code-input">
                    <KeyRound size={18} aria-hidden="true" />
                    <input
                      id="resetOtp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Verifying…' : <>Verify code <ArrowRight size={18} /></>}
                </button>
                <div className="recovery-secondary-actions">
                  <button type="button" className="login-secondary" disabled={resendCooldown > 0 || resending} onClick={handleResendCode}>
                    {resending ? 'Resending…' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="login-secondary" onClick={returnToEmail}>Change email</button>
                </div>
              </form>
            )}

            {step === 'password' && (
              <form className="login-form" onSubmit={handleSetPassword}>
                <div className="field">
                  <label htmlFor="newPassword">New password</label>
                  <div className="login-input">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="confirmPassword">Confirm new password</label>
                  <div className="login-input">
                    <BadgeCheck size={18} aria-hidden="true" />
                    <input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Resetting…' : <>Reset password <ArrowRight size={18} /></>}
                </button>
              </form>
            )}

            {step === 'done' && (
              <div className="recovery-success">
                <span><CheckCircle2 size={28} /></span>
                <strong>Your account is ready</strong>
                <p>Use your new password to securely access the HuntsTAG client portal.</p>
                <Link className="login-submit" to="/login">Continue to login <ArrowRight size={18} /></Link>
              </div>
            )}

            {step !== 'done' && (
              <div className="login-auth__footer recovery-back-link">
                <Link to="/login"><ArrowLeft size={15} /> Back to login</Link>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
