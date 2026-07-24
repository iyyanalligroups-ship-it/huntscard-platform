import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';

export default function AuthModal({ mode: initialMode, onClose }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const navigate = useNavigate();

  // Lock background scroll while the modal is open. `overflow: hidden` on
  // body alone doesn't stop iOS Safari from panning the visual viewport
  // behind a `position: fixed` backdrop -- pinning body to the current
  // scroll offset is what actually stops it there, and that background
  // pan/rubber-band is what was making the fixed, blurred modal jump/shake.
  useEffect(() => {
    const scrollY = window.scrollY;
    const { position, top, left, right, width, overflow } = document.body.style;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.left = left;
      document.body.style.right = right;
      document.body.style.width = width;
      document.body.style.overflow = overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // register fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
      setSession({ token: res.token, clientId: res.clientId });
      onClose();
      navigate(res.mustChangePassword ? '/change-password' : '/');
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
      const res = await api.register({ fullName, phone, loginEmail: regEmail, password: regPassword });
      setSession({ token: res.token, clientId: res.clientId });
      onClose();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={handleBackdropClick}>
      <div className="auth-modal-card">
        <button className="auth-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand-mark" />
          <span className="brand-name">HUNTSTAG</span>
        </div>

        {mode === 'login' ? (
          <>
            <h1 style={{ fontSize: 20 }}>Log in to your card</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>
              Use the email and password from when you registered or ordered your card.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="modalLoginEmail">Email</label>
                <input
                  id="modalLoginEmail"
                  type="email"
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

            <form onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="modalFullName">Full name</label>
                <input id="modalFullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="modalPhone">Contact number</label>
                <input id="modalPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="modalRegEmail">Email</label>
                <input
                  id="modalRegEmail"
                  type="email"
                  autoComplete="username"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
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
