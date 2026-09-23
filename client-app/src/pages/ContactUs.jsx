import { useState } from 'react';
import { api } from '../api.js';

export default function ContactUs() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  function validate(fields = form) {
    const errs = {};

    if (!fields.name || !fields.name.trim()) {
      errs.name = 'Name is required';
    }

    const cleanPhone = (fields.phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      errs.phone = 'Phone number is required';
    } else if (cleanPhone.length !== 10) {
      errs.phone = `Phone number must be exactly 10 digits (${cleanPhone.length}/10)`;
    }

    const cleanEmail = (fields.email || '').trim().toLowerCase();
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!cleanEmail) {
      errs.email = 'Email address is required';
    } else if (!emailRegex.test(cleanEmail)) {
      errs.email = 'Please enter a valid email address (e.g. name@domain.com)';
    }

    if (!fields.message || !fields.message.trim()) {
      errs.message = 'Message cannot be empty';
    }

    return errs;
  }

  function handlePhoneChange(e) {
    // Only allow digits and max 10 digits
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    const updated = { ...form, phone: val };
    setForm(updated);

    if (touched.phone) {
      const errs = validate(updated);
      setFieldErrors((prev) => ({ ...prev, phone: errs.phone }));
    }
  }

  function handleEmailChange(e) {
    // Convert to lowercase and trim
    const val = e.target.value.toLowerCase();
    const updated = { ...form, email: val };
    setForm(updated);

    if (touched.email) {
      const errs = validate(updated);
      setFieldErrors((prev) => ({ ...prev, email: errs.email }));
    }
  }

  function handleBlur(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errs = validate();
    setFieldErrors((prev) => ({ ...prev, [field]: errs[field] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Mark all as touched
    setTouched({ name: true, phone: true, email: true, message: true });

    const errs = validate();
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setError('Please resolve the errors below before submitting.');
      return;
    }

    setSending(true);
    try {
      await api.submitContactForm({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        message: form.message.trim(),
      });
      setForm({ name: '', phone: '', email: '', message: '' });
      setFieldErrors({});
      setTouched({});
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
          <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ margin: 0, color: 'var(--holo-cyan)', fontWeight: 600, fontSize: 18 }}>Message sent — thanks!</p>
            <p className="hint" style={{ marginTop: 8, fontSize: 14 }}>We'll get back to you soon.</p>
            <button
              type="button"
              className="secondary"
              style={{ marginTop: 20, width: 'auto', padding: '8px 24px', display: 'inline-block' }}
              onClick={() => setSent(false)}
            >
              Send another message
            </button>
          </div>
        ) : (
          <form className="card" onSubmit={handleSubmit} noValidate>
            {error && <div className="error-banner">{error}</div>}

            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                placeholder="Your full name"
                value={form.name}
                style={touched.name && fieldErrors.name ? { borderColor: '#f4746a' } : undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, name: val }));
                  if (touched.name) {
                    const errs = validate({ ...form, name: val });
                    setFieldErrors((prev) => ({ ...prev, name: errs.name }));
                  }
                }}
                onBlur={() => handleBlur('name')}
                required
              />
              {touched.name && fieldErrors.name && (
                <div style={{ color: '#f9a8a0', fontSize: 12, marginTop: 4 }}>
                  {fieldErrors.name}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="phone">Phone number (10 digits)</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="e.g. 9876543210"
                value={form.phone}
                style={touched.phone && fieldErrors.phone ? { borderColor: '#f4746a' } : undefined}
                onChange={handlePhoneChange}
                onBlur={() => handleBlur('phone')}
                required
              />
              {touched.phone && fieldErrors.phone && (
                <div style={{ color: '#f9a8a0', fontSize: 12, marginTop: 4 }}>
                  {fieldErrors.phone}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="email">Email (lowercase)</label>
              <input
                id="email"
                type="email"
                placeholder="yourname@domain.com"
                value={form.email}
                style={touched.email && fieldErrors.email ? { borderColor: '#f4746a' } : undefined}
                onChange={handleEmailChange}
                onBlur={() => handleBlur('email')}
                required
              />
              {touched.email && fieldErrors.email && (
                <div style={{ color: '#f9a8a0', fontSize: 12, marginTop: 4 }}>
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                rows={4}
                placeholder="How can we help you?"
                value={form.message}
                style={{
                  width: '100%',
                  background: 'var(--panel-raised)',
                  border: touched.message && fieldErrors.message ? '1px solid #f4746a' : '1px solid var(--panel-border)',
                  borderRadius: 9,
                  padding: '11px 13px',
                  color: 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'var(--font-ui)',
                  resize: 'vertical',
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, message: val }));
                  if (touched.message) {
                    const errs = validate({ ...form, message: val });
                    setFieldErrors((prev) => ({ ...prev, message: errs.message }));
                  }
                }}
                onBlur={() => handleBlur('message')}
                required
              />
              {touched.message && fieldErrors.message && (
                <div style={{ color: '#f9a8a0', fontSize: 12, marginTop: 4 }}>
                  {fieldErrors.message}
                </div>
              )}
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
