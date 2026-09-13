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

  // A response body that fails to parse as JSON is only a legitimate,
  // ignorable case when the request already FAILED (some proxies/hosts
  // return a plain-text or HTML error page instead of JSON) -- silently
  // defaulting to {} on a 2xx response instead let a truncated/empty body
  // (a real risk on slow connections, especially the large video/image
  // uploads below) masquerade as a valid, empty success payload. Callers
  // like `setCard(await api.uploadMyMagicCardVideo(...))` would then wipe
  // out every field of already-saved state (imageUrl included) even
  // though the upload itself succeeded server-side.
  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    if (res.ok) throw new Error('The server response could not be read -- please try again.');
    data = {};
  }
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

// Shared response handling for the multipart upload functions below (they
// can't go through request() since that always sets Content-Type:
// application/json). Same fix as request() above, for the same reason:
// on a successful (2xx) response, a body that fails to parse as JSON must
// not silently become {} -- that would let a truncated/empty response (a
// real risk on slow connections, especially for these large file
// uploads) masquerade as valid empty data, and the caller's
// `setCard(await api.uploadX(...))` would then wipe out every
// already-saved field of state even though the upload itself succeeded
// server-side. Only a genuinely FAILED response is allowed to fall back
// to {} (some hosts/proxies return a plain-text or HTML error page
// instead of JSON for those).
async function parseUploadResponse(res, actionLabel = 'Upload') {
  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    if (res.ok) throw new Error('The server response could not be read -- please try again.');
    data = {};
  }
  if (!res.ok) throw new Error(data.error || `${actionLabel} failed (${res.status})`);
  return data;
}

export const api = {
  // identifier is either the login email or the phone number -- same
  // shared password either way.
  login: (identifier, password) =>
    request('/api/auth/login', { method: 'POST', body: { identifier, password }, auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  // Passwordless login via phone OTP -- phone only, no email equivalent.
  requestLoginOtp: (phone) => request('/api/auth/login-otp/request', { method: 'POST', body: { phone }, auth: false }),
  verifyLoginOtp: (phone, otp) =>
    request('/api/auth/login-otp/verify', { method: 'POST', body: { phone, otp }, auth: false }),
  // Forgot-password: emails a 6-digit code (see pages/ForgotPassword.jsx),
  // verified in-page, which unlocks the "set new password" step.
  forgotPassword: (loginEmail) =>
    request('/api/auth/forgot-password', { method: 'POST', body: { loginEmail }, auth: false }),
  verifyForgotPasswordOtp: (loginEmail, otp) =>
    request('/api/auth/forgot-password/verify-otp', { method: 'POST', body: { loginEmail, otp }, auth: false }),
  resetPassword: (token, newPassword) =>
    request('/api/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  getProfile: () => request('/api/profile/me'),
  // Deactivate/pause -- hides the public profile/vCard/AR experience from
  // anyone who taps or scans the card (see Settings.jsx's "Card status").
  pauseCard: () => request('/api/profile/pause-card', { method: 'POST' }),
  unpauseCard: () => request('/api/profile/unpause-card', { method: 'POST' }),
  // Individual physical cards (see models/Card.js) -- number/type/active
  // only, never a password (that's admin-only).
  getMyCards: () => request('/api/profile/cards'),
  pauseMyCard: (cardNumber) => request(`/api/profile/cards/${cardNumber}/pause`, { method: 'POST' }),
  unpauseMyCard: (cardNumber) => request(`/api/profile/cards/${cardNumber}/unpause`, { method: 'POST' }),
  updateProfile: (updates) => request('/api/profile/me', { method: 'PUT', body: updates }),

  listPlans: () => request('/api/public/plans', { auth: false }),
  // The public tap-page profile -- unauthenticated on purpose, this is
  // what a stranger tapping/scanning the physical card sees. See
  // pages/PublicProfile.jsx.
  // cardNumber is optional -- present when the physical card's own URL
  // included ?card=N (see models/Card.js), so this specific card can be
  // individually paused; absent for cards encoded before that existed.
  getPublicProfile: (clientId, cardNumber) =>
    request(`/api/public/profile/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`, { auth: false }),
  // The client's saved AR element positions -- unauthenticated, feeds
  // the live camera AR view (pages/ArView.jsx) the same way
  // getMyArLayout feeds the dashboard editor.
  getPublicArLayout: (clientId, cardNumber) =>
    request(`/api/public/ar-layout/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`, { auth: false }),
  getPublicArIcons: () => request('/api/public/ar-icons', { auth: false }),
  // Admin-uploaded Magic Art packs (see backend/models/MagicArt.js) --
  // resolves an array, one entry per complete (image+video) pack. Shown
  // on the public MagicArt.jsx gallery page and scanned via the
  // dashboard's MagicCamera.jsx.
  getPublicMagicArt: () => request('/api/public/magic-art', { auth: false }),
  // Every ACTIVE Magic Business Card -- scanned by MagicCamera.jsx
  // alongside Magic Art, merged into one target list there.
  getPublicMagicCards: () => request('/api/public/magic-cards', { auth: false }),
  // ONE specific PHYSICAL card's ACTIVE Magic Business Card -- feeds
  // MagicCamera.jsx's client-scoped mode (reached via a specific card's
  // own AR QR -> "choose AR or Magic" screen), instead of the full
  // gallery-wide target list the two calls above feed. Same cardNumber
  // convention as getPublicProfile/getPublicArLayout above.
  getPublicMagicCard: (clientId, cardNumber) =>
    request(`/api/public/magic-card/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`, { auth: false }),
  // Admin-uploaded Street Art pieces (see backend/models/StreetArt.js) --
  // scanned by MagicCamera.jsx alongside Magic Art/Magic Business Card,
  // merged into the same target list there. Deliberately has NO gallery
  // page anywhere -- unlike getPublicMagicArt above, nothing ever renders
  // this list for browsing, it exists purely to feed the scanner.
  getPublicStreetArt: () => request('/api/public/street-art', { auth: false }),
  // Which homepage design to render (see HomeSwitch.jsx) -- toggled from
  // the admin app's topbar switch.
  getSiteSettings: () => request('/api/public/site-settings', { auth: false }),
  // Admin-managed FAQ entries (see admin-app's Faq.jsx), active ones only,
  // in admin's chosen order -- feeds pages/Faq.jsx.
  getPublicFaq: () => request('/api/public/faq', { auth: false }),
  // The logged-in client's own Magic Business Card for ONE specific
  // physical card (see backend/models/MagicBusinessCard.js) -- admin-
  // uploaded video + a design image derived from what was actually
  // purchased (see utils/cardVariant.js), distinct from the shared Magic
  // Art gallery above. Read-only here -- only returns data once admin has
  // activated it, otherwise a null-safe empty shape. Omit cardNumber to
  // default to card #1.
  getMyMagicCard: (cardNumber) => request(`/api/profile/magic-card${cardNumber ? `?card=${cardNumber}` : ''}`),
  // Where the client dragged the AR QR onto their own card design --
  // percentages (0-100), composited into the printable download.
  saveMyMagicCardQrPosition: (x, y, cardNumber) =>
    request('/api/profile/magic-card/qr-position', { method: 'POST', body: { x, y, cardNumber } }),
  // Where one AR component (contact/portfolio/social) is placed relative
  // to this card in MagicCamera.jsx's own 3D scene -- independent of the
  // main AR Layout system's positions (see that route's own comment).
  saveMyMagicCardComponentPosition: (key, x, y, z, rotation, cardNumber) =>
    request('/api/profile/magic-card/component-position', { method: 'POST', body: { key, x, y, z, rotation, cardNumber } }),
  activateMyMagicCard: (cardNumber) => request('/api/profile/magic-card/activate', { method: 'POST', body: { cardNumber } }),
  deactivateMyMagicCard: (cardNumber) => request('/api/profile/magic-card/deactivate', { method: 'POST', body: { cardNumber } }),
  uploadMyMagicCardVideo: async (file, crop, cardNumber) => {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('cropX', crop.x);
    formData.append('cropY', crop.y);
    formData.append('cropWidth', crop.width);
    formData.append('cropHeight', crop.height);
    if (cardNumber) formData.append('cardNumber', cardNumber);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/magic-card/video`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return parseUploadResponse(res);
  },
  removeMyMagicCardVideo: (cardNumber) =>
    request(`/api/profile/magic-card/video${cardNumber ? `?card=${cardNumber}` : ''}`, { method: 'DELETE' }),
  // Custom Card only -- backend 403s for every other plan, see
  // routes/profile.js's own gate on this route. Overrides the checkout
  // design for the Magic Camera effect specifically, without touching
  // what's used elsewhere (e.g. the printed card).
  uploadMyMagicCardImage: async (file, width, height, cardNumber) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('width', width);
    formData.append('height', height);
    if (cardNumber) formData.append('cardNumber', cardNumber);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/magic-card/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return parseUploadResponse(res);
  },
  removeMyMagicCardImage: (cardNumber) =>
    request(`/api/profile/magic-card/image${cardNumber ? `?card=${cardNumber}` : ''}`, { method: 'DELETE' }),

  // Admin-defined extra profile fields (see AttributeDefinition) -- used
  // by both Profile Settings (to know which extra inputs to render) and
  // the public profile page (to know which extra rows to render).
  getAttributeDefinitions: () => request('/api/public/attributes', { auth: false }),
  // The reverse direction of getPublicProfile's vCard download -- a
  // visitor leaving their own info for the card owner (see
  // PublicProfile.jsx's "Exchange Contact" flow).
  submitLead: (clientId, payload, cardNumber) =>
    request(`/api/public/leads/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`, { method: 'POST', body: payload, auth: false }),
  // "Raise a ticket" -- shown in place of a raw phone/email when a card is
  // temporarily deactivated (see PublicProfile.jsx's 'deactivated' branch).
  submitCardTicket: (clientId, payload, cardNumber) =>
    request(`/api/public/card-tickets/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`, { method: 'POST', body: payload, auth: false }),
  getCatalog: () => request('/api/public/catalog', { auth: false }),
  // Card variant showcase (photos, price, features) -- distinct from
  // getCatalog above, which is just the tap-demo videos. Both feed
  // Catalog.jsx, in separate sections.
  getCatalogEntries: () => request('/api/public/catalog-entries', { auth: false }),

  // Dashboard notification bell + Web Push subscription -- see
  // components/NotificationBell.jsx.
  getNotifications: () => request('/api/profile/notifications'),
  markNotificationRead: (id) => request(`/api/profile/notifications/${id}/read`, { method: 'POST' }),
  getPushPublicKey: () => request('/api/profile/push/public-key'),
  subscribePush: (subscription) => request('/api/profile/push/subscribe', { method: 'POST', body: subscription }),
  unsubscribePush: (endpoint) => request('/api/profile/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  submitRequest: (payload) => request('/api/profile/requests', { method: 'POST', body: payload }),
  listMyRequests: () => request('/api/profile/requests'),

  // Chat Support -- two-way conversation with admin (ChatSupport.jsx).
  getChat: () => request('/api/profile/chat'),
  sendChatMessage: (text) => request('/api/profile/chat', { method: 'POST', body: { text } }),

  // `variants` (only for a plan that has any): array of {variantId,
  // quantity} for a mixed order (e.g. 1x "White Night" + 1x "Revenge
  // Red") -- omit/leave undefined for a plan with no variants, which
  // still just uses `quantity` directly.
  createUpgradeOrder: (requestedPlan, quantity, variants) =>
    request('/api/profile/upgrade-order', { method: 'POST', body: { requestedPlan, quantity, variants } }),
  confirmUpgradePayment: (payload) => request('/api/profile/upgrade-confirm', { method: 'POST', body: payload }),

  createNewCardOrder: (payload) => request('/api/profile/new-card-order', { method: 'POST', body: payload }),
  confirmNewCardPayment: (payload) => request('/api/profile/new-card-confirm', { method: 'POST', body: payload }),

  // Public shop -- no login required, this IS how a new visitor gets an account
  listShopPlans: () => request('/api/public/plans', { auth: false }),
  createShopOrder: (payload) => request('/api/public/shop-order', { method: 'POST', body: payload, auth: false }),
  confirmShopPayment: (payload) => request('/api/public/shop-confirm', { method: 'POST', body: payload, auth: false }),
  submitContactForm: (payload) => request('/api/public/contact', { method: 'POST', body: payload, auth: false }),

  // Custom plan front/back design artwork -- uploads immediately on
  // file-select at Shop checkout (before payment), returning just a URL
  // to hold in state and send along with the confirm-payment call once
  // checkout completes. Public (no auth) -- mirrors the rest of the Shop
  // checkout flow, and unauthenticated new buyers have no token yet.
  uploadDesign: async (file) => {
    const formData = new FormData();
    formData.append('design', file);
    const res = await fetch(`${API_URL}/api/public/design-upload`, { method: 'POST', body: formData });
    return parseUploadResponse(res);
  },

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
    return parseUploadResponse(res);
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
    return parseUploadResponse(res);
  },
  removeBanner: () => request('/api/profile/banner', { method: 'DELETE' }),

  uploadLogo: async (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return parseUploadResponse(res);
  },
  removeLogo: () => request('/api/profile/logo', { method: 'DELETE' }),

  uploadArBanner: async (file) => {
    const formData = new FormData();
    formData.append('banner', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/ar-banner`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return parseUploadResponse(res);
  },
  removeArBanner: () => request('/api/profile/ar-banner', { method: 'DELETE' }),

  uploadArModel: async (file) => {
    const formData = new FormData();
    formData.append('model', file);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/profile/ar-model`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return parseUploadResponse(res);
  },
  removeArModel: () => request('/api/profile/ar-model', { method: 'DELETE' }),

  // cardNumber: which of the client's own physical cards -- each can have
  // its own arrangement (see backend/models/ArLayout.js). Omit to default
  // to card #1, same convention every per-card route uses.
  getMyArLayout: (cardNumber) => request(`/api/profile/ar-layout${cardNumber ? `?card=${cardNumber}` : ''}`),
  saveMyArLayout: (updates, cardNumber) =>
    request('/api/profile/ar-layout', { method: 'PUT', body: { ...updates, cardNumber } }),

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
    return parseUploadResponse(res);
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

  // Appointment requests -- sent from a contact's own saved phone number
  // (see pages/Contacts.jsx), in-app if they're already a Huntstag
  // account, an SMS invite otherwise. See pages/Appointments.jsx.
  sendAppointmentRequest: (contactId, note, proposedAt) =>
    request('/api/profile/appointments', { method: 'POST', body: { contactId, note, proposedAt } }),
  getReceivedAppointments: () => request('/api/profile/appointments/received'),
  getSentAppointments: () => request('/api/profile/appointments/sent'),
  respondToAppointment: (id, status) => request(`/api/profile/appointments/${id}`, { method: 'PATCH', body: { status } }),
  deleteAppointment: (id) => request(`/api/profile/appointments/${id}`, { method: 'DELETE' }),
  // Free/busy check before proposing a time -- { matched, busy: [isoString] }.
  // Only ever times, never who-with/notes, same "just enough to avoid a
  // conflict, nothing more" privacy level a calendar's free/busy view uses.
  getAppointmentBusyTimes: (phone) => request(`/api/profile/appointments/busy?phone=${encodeURIComponent(phone)}`),
};
