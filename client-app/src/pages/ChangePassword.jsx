import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '../utils/passwordRules.js';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const problem = validateNewPassword(newPassword, confirm);
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
    <div className="shell">
      <div className="brand">
        <div className="brand-mark" />
        <span className="brand-name">HuntsTAG</span>
      </div>

      <h1>Set a new password</h1>
      <p className="subtitle">
        You're logging in with a temporary password. Set your own before continuing to your dashboard.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="current">Temporary password</label>
          <PasswordInput id="current"
            
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required />
        </div>
        <div className="field">
          <label htmlFor="new">New password</label>
          <PasswordInput id="new"
            
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <PasswordInput id="confirm"
            
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Set password and continue'}
        </button>
      </form>
    </div>
  );
}
