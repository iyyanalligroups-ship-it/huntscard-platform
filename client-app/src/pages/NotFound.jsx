import { Link } from 'react-router-dom';

// Shown for any unknown address. Seo.jsx marks it noindex.
export default function NotFound() {
  return (
    <div className="au-page">
      <header className="au-page-hero">
        <h1 className="section-heading">Page not found</h1>
        <p className="section-subheading">We could not find that page. It may have moved or the address may be wrong.</p>
        <Link to="/" className="btn-primary au-cta">Go to home →</Link>
      </header>
    </div>
  );
}
