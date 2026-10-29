import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LANDING_BY_PATH } from '../landingPages.js';
import { SITE_URL } from '../seoData.js';
import { trackEvent } from '../siteConfig.js';
import '../landing.css';

// Template for the keyword landing pages. All text comes from landingPages.js.
export default function LandingPage({ page }) {
  // FAQPage + BreadcrumbList structured data, added to <head> while the page is open.
  useEffect(() => {
    const data = [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: page.crumb, item: `${SITE_URL}${page.path}` },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: page.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ];
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.dataset.landing = 'true';
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => el.remove();
  }, [page]);

  return (
    <div className="au-page lp-page" lang={page.lang}>
      <nav className="lp-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span aria-hidden="true">/</span> <span>{page.crumb}</span>
      </nav>

      <header className="lp-hero">
        <h1>{page.h1}</h1>
        {page.lead.map((p) => (
          <p className="lp-lead" key={p}>{p}</p>
        ))}
        <Link to={page.cta.to} className="btn-primary au-cta" onClick={() => trackEvent('landing_cta_click', { page: page.path })}>
          {page.cta.label} →
        </Link>
      </header>

      {page.sections.map((s) => (
        <section className="lp-section" key={s.h2}>
          <h2>{s.h2}</h2>
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}

      <section className="lp-section">
        <h2>{page.lang === 'hi' ? 'अक्सर पूछे जाने वाले सवाल' : 'Questions and answers'}</h2>
        <div className="lp-faq">
          {page.faq.map((f) => (
            <details key={f.q} className="lp-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>{page.lang === 'hi' ? 'ये भी देखें' : 'Related pages'}</h2>
        <ul className="lp-related">
          {page.related.map((path) => (
            <li key={path}>
              <Link to={path}>{LANDING_BY_PATH[path]?.crumb || path}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="au-cta-band">
        <div>
          <h2 className="section-heading">{page.lang === 'hi' ? 'अपना कार्ड चुनें' : 'Ready to get started?'}</h2>
          <p>{page.lang === 'hi' ? 'सभी शुल्क चेकआउट पर दिखाए जाते हैं।' : 'All charges are shown at checkout.'}</p>
        </div>
        <Link to={page.cta.to} className="btn-primary au-cta">{page.cta.label} →</Link>
      </section>
    </div>
  );
}
