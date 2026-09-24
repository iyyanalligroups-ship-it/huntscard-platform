import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import WaveBackdrop from '../components/WaveBackdrop.jsx';
import ThemedSelect from '../components/ThemedSelect.jsx';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
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
      const res = await api.register({ fullName, phone, gender: gender || undefined, dateOfBirth: dateOfBirth || undefined, loginEmail, password });
      setSession({ token: res.token, clientId: res.clientId });
      navigate('/dashboard');
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
          <span className="brand-name">HuntsTAG</span>
        </div>

        <h1>Create your account</h1>
        <p className="subtitle">Free to sign up — pick and pay for your card once you're in.</p>

        {error && <div className="error-banner">{error}</div>}

        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="phone">Contact number</label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
            />
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
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="loginEmail">Email</label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="username"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value.toLowerCase())}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="hint" style={{ marginBottom: 0 }}>At least 8 characters.</p>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login" className="link-out">Log in</Link>
          {' · '}
          <Link to="/" className="link-out">Back to Home</Link>
        </p>
      </div>
    </div>
  );
}
