import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, markPasswordChanged, onUnauthorized, readSession, saveSession } from '../api/client.js';
import { flushActivity, setActivityToken, startActivityTracking } from '../lib/activityTracker.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(null);
  const [restoring, setRestoring] = useState(true);

  const signOut = useCallback(async () => {
    await flushActivity({ timeoutMs: 1500 }).catch(() => {}); // the last steps go out before the logout is reported
    await clearSession();
    setSessionState(null);
  }, []);

  // The activity tracker follows the login: it records only while a client is logged in.
  useEffect(() => { setActivityToken(session?.token || null); }, [session]);
  useEffect(() => startActivityTracking(), []);

  useEffect(() => {
    readSession().then((saved) => setSessionState(saved.token ? saved : null)).finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    onUnauthorized(() => setSessionState(null));
    return () => onUnauthorized(null);
  }, []);

  const acceptAuthResponse = useCallback(async (response) => {
    const next = {
      token: response.token,
      clientId: response.clientId,
      mustChangePassword: Boolean(response.mustChangePassword),
    };
    await saveSession(next);
    setSessionState(next);
  }, []);

  const value = useMemo(() => ({
    session,
    restoring,
    signIn: async (identifier, password) => acceptAuthResponse(await api.login(identifier, password)),
    signInWithOtp: async (phone, otp) => acceptAuthResponse(await api.verifyLoginOtp(phone, otp)),
    // Admin 'view as this client' hand-off (the website's /impersonate route).
    signInWithToken: async (token, clientId) => acceptAuthResponse({ token, clientId, mustChangePassword: false }),
    register: async (payload) => acceptAuthResponse(await api.register(payload)),
    completePasswordChange: async () => {
      await markPasswordChanged();
      setSessionState((current) => ({ ...current, mustChangePassword: false }));
    },
    signOut,
  }), [acceptAuthResponse, restoring, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
