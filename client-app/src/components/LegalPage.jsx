import { Link } from 'react-router-dom';
import '../legal.css';

// Renders one legal document (see legalContent.js): breadcrumb, title, numbered sections with a
// contents list, and a contact block.
export default function LegalPage({ doc, other }) {
  const slug = (i) => `section-${i + 1}`;
  return (
    <main className="legal-page">
      <nav className="legal-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <span>{doc.title}</span>
      </nav>
      <h1>{doc.title}</h1>
      <p className="legal-updated">Last updated: {doc.updated}</p>
      <p className="legal-intro">{doc.intro}</p>

      <div className="legal-layout">
        <aside className="legal-toc" aria-label="Contents">
          <strong>Contents</strong>
          {doc.sections.map((s, i) => <a key={s.h} href={`#${slug(i)}`}>{s.h}</a>)}
        </aside>

        <div className="legal-body">
          {doc.sections.map((s, i) => (
            <section key={s.h} id={slug(i)}>
              <h2>{s.h}</h2>
              {s.p?.map((t) => <p key={t}>{t}</p>)}
              {s.ul && <ul>{s.ul.map((t) => <li key={t}>{t}</li>)}</ul>}
              {s.subs?.map((sub) => (
                <div key={sub.h} className="legal-sub">
                  <h3>{sub.h}</h3>
                  {sub.p?.map((t) => <p key={t}>{t}</p>)}
                  {sub.ul && <ul>{sub.ul.map((t) => <li key={t}>{t}</li>)}</ul>}
                </div>
              ))}
            </section>
          ))}

          <p><Link to={other.to}>{other.label} →</Link></p>
        </div>
      </div>
    </main>
  );
}
