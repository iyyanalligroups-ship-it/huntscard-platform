import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, KeyRound, LockKeyhole, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import WaveBackdrop from '../components/WaveBackdrop.jsx';
import ParticleWaves from '../components/ParticleWaves.jsx';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '../utils/passwordRules.js';

// First login with a temporary password: the person must choose their own. Same look as the login and
// password-recovery pages.
export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Shown under the fields while typing.
  const newHint = newPassword && newPassword.length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters (${newPassword.length}/${MIN_PASSWORD_LENGTH}).`
    : newPassword && currentPassword && newPassword === currentPassword
      ? 'Choose a password different from the temporary one.'
      : '';
  const confirmHint = confirm && newPassword !== confirm ? 'Passwords do not match.' : '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const problem = validateNewPassword(newPassword, confirm) || (newPassword === currentPassword ? 'Choose a password different from the temporary one.' : '');
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page recovery-page">
      <ParticleWaves />
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
              <span className="login-eyebrow"><Sparkles size={15} /> Make it yours</span>
              <h2>Choose your own password.</h2>
              <p>You signed in with a temporary password. Set one only you know before you continue to your dashboard.</p>
              <div className="login-benefits">
                <span><KeyRound size={17} /> Only you know it</span>
                <span><ShieldCheck size={17} /> Protected access</span>
                <span><BadgeCheck size={17} /> Minimum {MIN_PASSWORD_LENGTH} characters</span>
              </div>
            </div>

            <div className="login-showcase__footer">
              <Wifi size={16} /> Connected securely by HuntsTAG
            </div>
          </aside>

          <section className="login-auth" aria-labelledby="change-password-title">
            <div className="login-auth__badge"><ShieldCheck size={15} /> Secure account</div>

            <div className="login-auth__heading">
              <span className="login-auth__icon"><KeyRound size={21} /></span>
              <div>
                <h1 id="change-password-title">Set a new password</h1>
              </div>
            </div>
            <p className="login-auth__subtitle">You're logging in with a temporary password. Set your own before continuing to your dashboard.</p>

            {error && <div className="error-banner login-error">{error}</div>}

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="current">Temporary password</label>
                <div className="login-input">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <PasswordInput wrap={false} id="current"
                    autoComplete="current-password"
                    placeholder="Enter your temporary password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="new">New password</label>
                <div className="login-input">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <PasswordInput wrap={false} id="new"
                    autoComplete="new-password"
                    placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required />
                </div>
                {newHint && <p className="login-field-error" role="alert">{newHint}</p>}
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm new password</label>
                <div className="login-input">
                  <BadgeCheck size={18} aria-hidden="true" />
                  <PasswordInput wrap={false} id="confirm"
                    autoComplete="new-password"
                    placeholder="Repeat your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required />
                </div>
                {confirmHint && <p className="login-field-error" role="alert">{confirmHint}</p>}
              </div>
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? 'Saving…' : <>Set password and continue <ArrowRight size={18} /></>}
              </button>
            </form>
          </section>
        </section>
      </main>
    </div>
  );
}
