import { useState } from 'react';
import { api } from '../api.js';

export default function ContactUs() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.submitContactForm(form);
      setForm({ name: '', email: '', message: '' });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Get in touch</h1>
      <p className="section-subheading">Questions about a plan, an order, or anything else — we'll get back to you.</p>

      <div className="contact-info-row">
        <div className="contact-info-item">
          <b>Puducherry, India</b>
          Iyyanalli Groups
        </div>
      </div>

      <div className="checkout-panel">
        {sent ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, color: 'var(--holo-cyan)', fontWeight: 600 }}>Message sent — thanks!</p>
            <p className="hint" style={{ marginTop: 8 }}>We'll get back to you soon.</p>
          </div>
        ) : (
          <form className="card" onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                rows={4}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
                style={{
                  width: '100%',
                  background: 'var(--panel-raised)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: 9,
                  padding: '11px 13px',
                  color: 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'var(--font-ui)',
                  resize: 'vertical',
                }}
              />
            </div>
            <button type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
