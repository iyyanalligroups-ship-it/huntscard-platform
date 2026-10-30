import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, NOT_FOUND, PRIVATE_PREFIXES, PUBLIC_PAGES, SITE_NAME, SITE_URL, siteJsonLd } from '../seoData.js';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Pure so it can be tested: what the head should say for a path.
export function seoForPath(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const page = PUBLIC_PAGES[clean];
  if (page) return { ...page, path: clean, robots: 'index, follow' };
  const isPrivate = PRIVATE_PREFIXES.some((p) => clean === p.replace(/\/$/, '') || clean.startsWith(p.endsWith('/') ? p : `${p}/`));
  if (isPrivate) return { title: `${SITE_NAME}`, description: '', path: clean, robots: 'noindex, nofollow' };
  return { ...NOT_FOUND, path: clean, robots: 'noindex, nofollow' }; // unknown address
}

// Updates <head> on every route change. Mounted once in App.jsx.
export default function Seo() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const seo = seoForPath(pathname);
    const url = `${SITE_URL}${seo.path === '/' ? '/' : seo.path}`;
    const indexable = seo.robots.startsWith('index');
    document.title = seo.title;
    document.documentElement.lang = seo.lang || 'en';
    setMeta('name', 'robots', seo.robots);
    if (indexable) {
      setMeta('name', 'description', seo.description);
      setCanonical(url); // path only, never the query string
      setMeta('property', 'og:type', 'website');
      setMeta('property', 'og:site_name', SITE_NAME);
      setMeta('property', 'og:title', seo.title);
      setMeta('property', 'og:description', seo.description);
      setMeta('property', 'og:url', url);
      setMeta('property', 'og:image', `${SITE_URL}${DEFAULT_OG_IMAGE}`);
      setMeta('property', 'og:image:width', '1200');
      setMeta('property', 'og:image:height', '630');
      setMeta('name', 'twitter:card', 'summary_large_image');
      setMeta('name', 'twitter:title', seo.title);
      setMeta('name', 'twitter:description', seo.description);
      setMeta('name', 'twitter:image', `${SITE_URL}${DEFAULT_OG_IMAGE}`);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    }
  }, [pathname]);

  // Organization + WebSite data, on the home page only. Name, URL and logo only: no address or phone.
  useEffect(() => {
    if (pathname !== '/') return undefined;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.dataset.site = 'true';
    el.textContent = JSON.stringify(siteJsonLd());
    document.head.querySelectorAll('script[data-prerender]').forEach((n) => n.remove()); // the build-time copy
    document.head.appendChild(el);
    return () => el.remove();
  }, [pathname]);

  return null;
}
