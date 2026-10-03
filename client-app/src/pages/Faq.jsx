import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { IlloQuestion } from '../components/Illustrations.jsx';

function FaqItem({ index, question, answer, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`faq-item au-faq-item${open ? ' is-open' : ''}`}>
      <button type="button" className="faq-question" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="au-faq-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="au-faq-text">{question}</span>
        <span className={`faq-chevron${open ? ' open' : ''}`} aria-hidden="true">{open ? '–' : '+'}</span>
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
    <div className="au-page au-faq">
      <aside className="au-faq-intro">
        <h1 className="section-heading">Frequently asked questions</h1>
        <p className="section-subheading">Everything about your card, in one place.</p>
        <Link to="/contact" className="btn-secondary au-cta">Contact us →</Link>
        <div className="av-side-art"><IlloQuestion /></div>
      </aside>

      <div className="au-faq-list">
        {error && <div className="error-banner">{error}</div>}
        {faqs === null && !error && <p className="subtitle">Loading…</p>}
        {faqs?.length === 0 && <p className="subtitle">No questions posted yet.</p>}
        {faqs?.map((item, i) => (
          <FaqItem key={item._id} index={i} question={item.question} answer={item.answer} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}
