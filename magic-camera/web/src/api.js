// Minimal public API client -- only what Magic Camera needs. No login anywhere.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export function isLoggedIn() { return false; }
export function getClientId() { return null; }

async function request(path) {
  const res = await fetch(`${API_URL}${path}`);
  let data;
  try { data = await res.json(); } catch { if (res.ok) throw new Error('The server response could not be read -- please try again.'); data = {}; }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  getPublicMagicArt: () => request('/api/public/magic-art'),
  getPublicMagicCards: () => request('/api/public/magic-cards'),
  getPublicMagicCard: (clientId, cardNumber) => request(`/api/public/magic-card/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`),
  getPublicStreetArt: () => request('/api/public/street-art'),
  getPublicProfile: (clientId, cardNumber) => request(`/api/public/profile/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`),
};
