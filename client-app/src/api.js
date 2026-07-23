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

  createUpgradeOrder: (requestedPlan, quantity) => request('/api/profile/upgrade-order', { method: 'POST', body: { requestedPlan, quantity } }),
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

  // Phone-contacts backup (import from this phone, export to restore on a
  // new one). See pages/Contacts.jsx.
  listContacts: () => request('/api/profile/contacts'),
  importContacts: (contacts) => request('/api/profile/contacts/import', { method: 'POST', body: { contacts } }),
  createContact: (payload) => request('/api/profile/contacts', { method: 'POST', body: payload }),
  updateContact: (id, payload) => request(`/api/profile/contacts/${id}`, { method: 'PUT', body: payload }),
  deleteContact: (id) => request(`/api/profile/contacts/${id}`, { method: 'DELETE' }),
  removeContactPhoto: (id) => request(`/api/profile/contacts/${id}/photo`, { method: 'DELETE' }),

  // Multipart -- can't go through the generic request() helper, same
  // reason uploadPhoto/uploadBanner/uploadArVideo above don't.
  uploadContactPhoto: async (id, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/contacts/${id}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },

  // Export returns a file, not JSON -- can't go through the generic
  // request() helper (same reason the upload* functions above don't).
  // Fetches the .vcf as a blob and hands it to the browser as a download,
  // which on a phone is what triggers the OS's "Add to Contacts" screen.
  exportContacts: async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/contacts/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'huntstag-contacts.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
