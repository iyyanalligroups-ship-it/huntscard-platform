import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, AtSign, BadgeCheck, BriefcaseBusiness, Eye, EyeOff, LockKeyhole, ShieldCheck, Smartphone, Sparkles, UserPlus, UserRound, Wifi } from 'lucide-react';
import { api, setSession } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';
import ParticleWaves from '../components/ParticleWaves.jsx';
import ThemedSelect from '../components/ThemedSelect.jsx';
import ThemeDatePicker from '../components/ThemeDatePicker.jsx';
import { trackEvent } from '../siteConfig.js';

function todayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const OTP_RESEND_COOLDOWN_SECONDS = 45;

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designation, setDesignation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [phoneVerificationToken, setPhoneVerificationToken] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const resendIntervalRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => () => clearInterval(resendIntervalRef.current), []);

  function startOtpCooldown() {
    setOtpCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setOtpCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(resendIntervalRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  function handlePhoneChange(e) {
    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
    setOtpSent(false);
    setOtp('');
    setPhoneVerificationToken('');
    setOtpCooldown(0);
    clearInterval(resendIntervalRef.current);
  }

  async function handleRequestOtp() {
    setError('');
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    setOtpSending(true);
    try {
      await api.requestRegistrationOtp(phone);
      setOtpSent(true);
      setOtp('');
      setPhoneVerificationToken('');
      startOtpCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    setError('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    setOtpVerifying(true);
    try {
      const result = await api.verifyRegistrationOtp(phone, otp);
      setPhoneVerificationToken(result.verificationToken);
      clearInterval(resendIntervalRef.current);
      setOtpCooldown(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!phoneVerificationToken) {
      setError('Verify your phone number before creating your account.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.register({
        fullName,
        phone,
        gender: gender || undefined,
        dateOfBirth: dateOfBirth || undefined,
        loginEmail: loginEmail || undefined,
        password,
        designation: designation || undefined,
        phoneVerificationToken,
      });
      setSession({ token: res.token, clientId: res.clientId });
      trackEvent('sign_up', { method: 'phone_otp' });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page register-page">
      <ParticleWaves />
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
              <span className="login-eyebrow"><Sparkles size={15} /> Free to join</span>
              <h2>Create your digital identity.</h2>
              <p>Sign up for free, then pick and pay for your smart card once you are in.</p>
              <div className="login-benefits">
                <span><Wifi size={17} /> NFC-ready profile</span>
                <span><BadgeCheck size={17} /> Update details anytime</span>
                <span><ShieldCheck size={17} /> Protected access</span>
              </div>
            </div>
            <div className="login-showcase__footer">
              <ShieldCheck size={16} /> Secure HuntsTAG workspace
            </div>
          </aside>

          <section className="login-auth register-auth" aria-labelledby="register-title">
            <div className="login-auth__badge"><UserPlus size={15} /> New account</div>
            <div className="login-auth__heading">
              <span className="login-auth__icon"><UserPlus size={21} /></span>
              <div>
                <h1 id="register-title">Create your account</h1>
              </div>
            </div>
            <p className="login-auth__subtitle">Free to sign up — pick and pay for your card once you are in.</p>

            {error && <div className="error-banner login-error">{error}</div>}

            <form className="login-form register-form" onSubmit={handleSubmit}>
              <div className="register-grid">
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <div className="login-input">
                    <UserRound size={18} aria-hidden="true" />
                    <input id="fullName" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="phone">Contact number</label>
                  <div className="login-input">
                    <Smartphone size={18} aria-hidden="true" />
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      minLength={10}
                      maxLength={10}
                      pattern="[0-9]{10}"
                      title="Enter exactly 10 digits"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={handlePhoneChange}
                      required
                    />
                  </div>
                </div>
                <div className="field register-grid__wide">
                  <label htmlFor="registrationOtp">Phone verification</label>
                  {phoneVerificationToken ? (
                    <div role="status" style={{ minHeight: 48, display: 'flex', alignItems: 'center', color: '#62d98b', fontWeight: 700 }}>
                      <BadgeCheck size={18} style={{ marginRight: 8 }} /> Phone number verified
                    </div>
                  ) : otpSent ? (
                    <div className="registration-otp-row">
                      <div className="login-input">
                        <ShieldCheck size={18} aria-hidden="true" />
                        <input
                          id="registrationOtp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          minLength={6}
                          maxLength={6}
                          pattern="[0-9]{6}"
                          placeholder="Enter 6-digit code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                      </div>
                      <button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otp.length !== 6} style={{ width: 'auto' }}>
                        {otpVerifying ? 'Verifying…' : 'Verify code'}
                      </button>
                      <button type="button" className="secondary" onClick={handleRequestOtp} disabled={otpCooldown > 0 || otpSending} style={{ width: 'auto' }}>
                        {otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="secondary" onClick={handleRequestOtp} disabled={otpSending || phone.length !== 10}>
                      {otpSending ? 'Sending…' : 'Send verification code'}
                    </button>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="gender">Gender (optional)</label>
                  <ThemedSelect
                    id="gender"
                    value={gender}
                    onChange={setGender}
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
                  <label htmlFor="dateOfBirth">Date of birth (optional)</label>
                  <ThemeDatePicker id="dateOfBirth" value={dateOfBirth} onChange={setDateOfBirth} max={todayDateValue()} ariaLabel="Date of birth" />
                </div>
                <div className="field">
                  <label htmlFor="loginEmail">Email (optional)</label>
                  <div className="login-input">
                    <AtSign size={18} aria-hidden="true" />
                    <input
                      id="loginEmail"
                      type="email"
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value.toLowerCase())}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="designation">Occupation (optional)</label>
                  <div className="login-input">
                    <BriefcaseBusiness size={18} aria-hidden="true" />
                    <input id="designation" type="text" placeholder="e.g. Software Engineer, Manager" value={designation} onChange={(e) => setDesignation(e.target.value)} />
                  </div>
                </div>
                <div className="field register-grid__wide">
                  <label htmlFor="password">Password</label>
                  <div className="login-input">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="At least 8 characters"
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
              </div>
              <button className="login-submit" type="submit" disabled={loading || !phoneVerificationToken}>
                {loading ? 'Creating account…' : phoneVerificationToken ? <>Create account <ArrowRight size={18} /></> : 'Verify phone to continue'}
              </button>
            </form>

            <p style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0', opacity: 0.8 }}>
              By creating an account you agree to our <Link to="/terms-condition">Terms</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.
            </p>

            <div className="login-auth__footer">
              <span>Already have an account? <Link to="/login">Log in</Link></span>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
