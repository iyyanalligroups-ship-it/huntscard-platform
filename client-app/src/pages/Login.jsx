import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';

export default function Login() {
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(loginEmail, password);
      setSession({ token: res.token, clientId: res.clientId });
      navigate(res.mustChangePassword ? '/change-password' : '/');
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

      <h1>Log in to your card</h1>
      <p className="subtitle">Use the email and password you were sent when your card was ordered.</p>

      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
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

      <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/" className="link-out">Back to Home</Link>
        {' · '}
        <Link to="/shop" className="link-out">Don't have a card? Shop now</Link>
      </p>
      </div>
    </div>
  );
}
