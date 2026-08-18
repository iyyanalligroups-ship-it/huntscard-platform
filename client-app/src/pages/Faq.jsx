import { useEffect, useState } from 'react';
import { api } from '../api.js';

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card faq-item">
      <button type="button" className="faq-question" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{question}</span>
        <span className={`faq-chevron${open ? ' open' : ''}`}>›</span>
      </button>
      {open && <p className="faq-answer">{answer}</p>}
    </div>
  );
}

// Admin-managed now (see admin-app's Faq.jsx / backend's models/FaqEntry.js)
// -- this used to be a hardcoded array here, edited by redeploying code.
export default function Faq() {
  const [faqs, setFaqs] = useState(null); // null while loading
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getPublicFaq()
      .then(setFaqs)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Frequently asked questions</h1>
      <p className="section-subheading">Everything about your card, in one place.</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="checkout-panel" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {faqs === null && !error && <p className="subtitle">Loading…</p>}
        {faqs?.length === 0 && <p className="subtitle">No questions posted yet.</p>}
        {faqs?.map((item) => (
          <FaqItem key={item._id} question={item.question} answer={item.answer} />
        ))}
      </div>
    </div>
  );
}
