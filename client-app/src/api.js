export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getToken() {
  return localStorage.getItem('huntstag_client_token');
}

export function setSession({ token, clientId }) {
  localStorage.setItem('huntstag_client_token', token);
  localStorage.setItem('huntstag_client_id', clientId);
}

export function clearSession() {
  localStorage.removeItem('huntstag_client_token');
  localStorage.removeItem('huntstag_client_id');
}

export function isLoggedIn() {
  return Boolean(getToken());
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      window.location.href = '/login';
      return new Promise(() => {});
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (loginEmail, password) =>
    request('/api/auth/login', { method: 'POST', body: { loginEmail, password }, auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  getProfile: () => request('/api/profile/me'),
  updateProfile: (updates) => request('/api/profile/me', { method: 'PUT', body: updates }),

  listPlans: () => request('/api/public/plans', { auth: false }),
  getCatalog: () => request('/api/public/catalog', { auth: false }),
  submitRequest: (payload) => request('/api/profile/requests', { method: 'POST', body: payload }),
  listMyRequests: () => request('/api/profile/requests'),

  createUpgradeOrder: (requestedPlan) => request('/api/profile/upgrade-order', { method: 'POST', body: { requestedPlan } }),
  confirmUpgradePayment: (payload) => request('/api/profile/upgrade-confirm', { method: 'POST', body: payload }),

  createNewCardOrder: (payload) => request('/api/profile/new-card-order', { method: 'POST', body: payload }),
  confirmNewCardPayment: (payload) => request('/api/profile/new-card-confirm', { method: 'POST', body: payload }),

  // Public shop -- no login required, this IS how a new visitor gets an account
  listShopPlans: () => request('/api/public/plans', { auth: false }),
  createShopOrder: (payload) => request('/api/public/shop-order', { method: 'POST', body: payload, auth: false }),
  confirmShopPayment: (payload) => request('/api/public/shop-confirm', { method: 'POST', body: payload, auth: false }),
  submitContactForm: (payload) => request('/api/public/contact', { method: 'POST', body: payload, auth: false }),

  // Multipart upload -- can't go through the generic request() helper
  // since that always sets Content-Type: application/json.
  uploadPhoto: async (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },

  uploadBanner: async (file) => {
    const formData = new FormData();
    formData.append('banner', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/banner`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
  removeBanner: () => request('/api/profile/banner', { method: 'DELETE' }),

  uploadArVideo: async (file) => {
    const formData = new FormData();
    formData.append('video', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/ar-video`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
  removeArVideo: () => request('/api/profile/ar-video', { method: 'DELETE' }),

  getMyArLayout: () => request('/api/profile/ar-layout'),
  saveMyArLayout: (updates) => request('/api/profile/ar-layout', { method: 'PUT', body: updates }),
};
