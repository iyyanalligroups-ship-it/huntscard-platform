import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setSession } from '../api.js';

// Lands here from admin-huntscard's ClientDetail.jsx "Log in as client"
// button -- it opens this page with the short-lived impersonation JWT
// (see backend's POST /api/admin/clients/:clientId/impersonate) as a URL
// query param, since the two apps run on separate origins with separate
// localStorage. This is the secure alternative to admin ever seeing a
// client's actual password (which is bcrypt-hashed, one-way, on purpose --
// see backend/models/Client.js) -- a real client-scoped session, issued
// without touching their password at all.
//
// The token is consumed immediately: stored the same way a normal login
// would (setSession), then scrubbed from the URL bar/history via
// replaceState so it doesn't linger somewhere it could be re-shared or
// re-used (a screenshot, browser history sync, etc.) after this first use.
export default function Impersonate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const consumed = useRef(false); // guards against double-consuming under StrictMode's double-invoke

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const token = searchParams.get('token');
    const clientId = searchParams.get('clientId');
    if (!token || !clientId) {
      setError('Missing impersonation token.');
      return;
    }

    setSession({ token, clientId });
    window.history.replaceState({}, '', '/impersonate');
    navigate('/', { replace: true });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p className="error-banner">{error}</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <p className="subtitle">Signing in…</p>
    </div>
  );
}
