import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'huntstag_client_token';
const CLIENT_ID_KEY = 'huntstag_client_id';
const CHANGE_PASSWORD_KEY = 'huntstag_must_change_password';

const defaultHost = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultHost).replace(/\/$/, '');
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || API_URL.replace(/:4000$/, ':5173')).replace(/\/$/, '');

let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export async function readSession() {
  const [token, clientId, mustChangePassword] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(CLIENT_ID_KEY),
    SecureStore.getItemAsync(CHANGE_PASSWORD_KEY),
  ]);
  return { token, clientId, mustChangePassword: mustChangePassword === 'true' };
}

export async function saveSession({ token, clientId, mustChangePassword = false }) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(CLIENT_ID_KEY, clientId || ''),
    SecureStore.setItemAsync(CHANGE_PASSWORD_KEY, String(Boolean(mustChangePassword))),
  ]);
}

export async function markPasswordChanged() {
  await SecureStore.setItemAsync(CHANGE_PASSWORD_KEY, 'false');
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(CLIENT_ID_KEY),
    SecureStore.deleteItemAsync(CHANGE_PASSWORD_KEY),
  ]);
}

export function resolveAssetUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function request(path, { method = 'GET', body, auth = true, form = false } = {}) {
  const headers = {};
  if (!form) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ? body : body == null ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the huntsTAG API at ${API_URL}. Check EXPO_PUBLIC_API_URL and that the backend is running.`);
  }

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) throw new Error('The server returned an unreadable response.');
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      await clearSession();
      unauthorizedHandler?.();
    }
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function filePart(asset, fieldName) {
  return {
    uri: asset.uri,
    name: asset.fileName || asset.name || `${fieldName}.${(asset.mimeType || '').split('/')[1] || 'jpg'}`,
    type: asset.mimeType || 'image/jpeg',
  };
}

function upload(path, asset, fieldName = 'photo', fields = {}, auth = true) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  form.append(fieldName, filePart(asset, fieldName));
  return request(path, { method: 'POST', body: form, form: true, auth });
}

const qs = (params) => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `?${query}` : '';
};

// Authenticated binary download (invoices, vCard export) -- returns the
// Authorization header + absolute URL so the caller can hand it to
// expo-file-system's downloadAsync.
export async function authedDownloadTarget(path) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return { url: `${API_URL}${path}`, headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

export function publicUrl(path) {
  return `${API_URL}${path}`;
}

export const api = {
  login: (identifier, password) => request('/api/auth/login', { method: 'POST', body: { identifier, password }, auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  requestLoginOtp: (phone) => request('/api/auth/login-otp/request', { method: 'POST', body: { phone }, auth: false }),
  verifyLoginOtp: (phone, otp) => request('/api/auth/login-otp/verify', { method: 'POST', body: { phone, otp }, auth: false }),
  forgotPassword: (loginEmail) => request('/api/auth/forgot-password', { method: 'POST', body: { loginEmail }, auth: false }),
  verifyForgotPasswordOtp: (loginEmail, otp) => request('/api/auth/forgot-password/verify-otp', { method: 'POST', body: { loginEmail, otp }, auth: false }),
  resetPassword: (token, newPassword) => request('/api/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  changePassword: (currentPassword, newPassword) => request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  getProfile: () => request('/api/profile/me'),
  updateProfile: (updates) => request('/api/profile/me', { method: 'PUT', body: updates }),
  uploadPhoto: (asset) => upload('/api/profile/photo', asset),
  getMyCards: () => request('/api/profile/cards'),
  pauseCard: () => request('/api/profile/pause-card', { method: 'POST' }),
  unpauseCard: () => request('/api/profile/unpause-card', { method: 'POST' }),
  pauseMyCard: (number) => request(`/api/profile/cards/${number}/pause`, { method: 'POST' }),
  unpauseMyCard: (number) => request(`/api/profile/cards/${number}/unpause`, { method: 'POST' }),
  listPlans: () => request('/api/public/plans', { auth: false }),
  listMyRequests: () => request('/api/profile/requests'),
  listMyMagicPosterOrders: () => request('/api/profile/magic-poster/orders?limit=50'),
  listContacts: () => request('/api/profile/contacts'),
  createContact: (payload) => request('/api/profile/contacts', { method: 'POST', body: payload }),
  updateContact: (id, payload) => request(`/api/profile/contacts/${id}`, { method: 'PUT', body: payload }),
  deleteContact: (id) => request(`/api/profile/contacts/${id}`, { method: 'DELETE' }),
  getReceivedAppointments: () => request('/api/profile/appointments/received'),
  getSentAppointments: () => request('/api/profile/appointments/sent'),
  respondToAppointment: (id, status) => request(`/api/profile/appointments/${id}`, { method: 'PATCH', body: { status } }),
  deleteAppointment: (id) => request(`/api/profile/appointments/${id}`, { method: 'DELETE' }),
  getChat: () => request('/api/profile/chat'),
  sendChatMessage: (message) => request('/api/profile/chat', { method: 'POST', body: { text: message } }),

  // ---- public (no login) ----
  getPublicProfile: (clientId, cardNumber) => request(`/api/public/profile/${clientId}${qs({ card: cardNumber })}`, { auth: false }),
  getPublicMagicArt: () => request('/api/public/magic-art', { auth: false }),
  getSiteSettings: () => request('/api/public/site-settings', { auth: false }),
  getPublicFaq: () => request('/api/public/faq', { auth: false }),
  getAttributeDefinitions: () => request('/api/public/attributes', { auth: false }),
  getCatalog: () => request('/api/public/catalog', { auth: false }),
  getCatalogEntries: () => request('/api/public/catalog-entries', { auth: false }),
  submitContactForm: (payload) => request('/api/public/contact', { method: 'POST', body: payload, auth: false }),
  submitLead: (clientId, payload, cardNumber) => request(`/api/public/leads/${clientId}${qs({ card: cardNumber })}`, { method: 'POST', body: payload, auth: false }),
  submitCardTicket: (clientId, payload, cardNumber) => request(`/api/public/card-tickets/${clientId}${qs({ card: cardNumber })}`, { method: 'POST', body: payload, auth: false }),
  getCountries: () => request('/api/public/geo/countries', { auth: false }),
  getStates: (country) => request(`/api/public/geo/states${qs({ country })}`, { auth: false }),
  getCities: (country, state) => request(`/api/public/geo/cities${qs({ country, state })}`, { auth: false }),
  uploadDesign: (asset) => upload('/api/public/design-upload', asset, 'design', {}, false),

  // ---- profile media ----
  uploadBanner: (asset) => upload('/api/profile/banner', asset, 'banner'),
  removeBanner: () => request('/api/profile/banner', { method: 'DELETE' }),
  uploadLogo: (asset) => upload('/api/profile/logo', asset, 'logo'),
  removeLogo: () => request('/api/profile/logo', { method: 'DELETE' }),
  uploadArBanner: (asset) => upload('/api/profile/ar-banner', asset, 'banner'),
  removeArBanner: () => request('/api/profile/ar-banner', { method: 'DELETE' }),
  uploadArModel: (asset) => upload('/api/profile/ar-model', asset, 'model'),
  removeArModel: () => request('/api/profile/ar-model', { method: 'DELETE' }),

  // ---- notifications ----
  getNotifications: () => request('/api/profile/notifications'),
  markNotificationRead: (id) => request(`/api/profile/notifications/${id}/read`, { method: 'POST' }),

  // ---- AR layout + Magic Business Card ----
  getMyArLayout: (cardNumber) => request(`/api/profile/ar-layout${qs({ card: cardNumber })}`),
  saveMyArLayout: (updates, cardNumber) => request('/api/profile/ar-layout', { method: 'PUT', body: { ...updates, cardNumber } }),
  getMyMagicCard: (cardNumber) => request(`/api/profile/magic-card${qs({ card: cardNumber })}`),
  saveMyMagicCardQrPosition: (x, y, cardNumber) => request('/api/profile/magic-card/qr-position', { method: 'POST', body: { x, y, cardNumber } }),
  saveMyMagicCardComponentPosition: (key, x, y, z, rotation, cardNumber) =>
    request('/api/profile/magic-card/component-position', { method: 'POST', body: { key, x, y, z, rotation, cardNumber } }),
  activateMyMagicCard: (cardNumber) => request('/api/profile/magic-card/activate', { method: 'POST', body: { cardNumber } }),
  deactivateMyMagicCard: (cardNumber) => request('/api/profile/magic-card/deactivate', { method: 'POST', body: { cardNumber } }),
  uploadMyMagicCardVideo: (asset, crop, cardNumber) =>
    upload('/api/profile/magic-card/video', asset, 'video', { cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height, cardNumber }),
  removeMyMagicCardVideo: (cardNumber) => request(`/api/profile/magic-card/video${qs({ card: cardNumber })}`, { method: 'DELETE' }),
  uploadMyMagicCardModel: (asset, cardNumber) => upload('/api/profile/magic-card/model', asset, 'model', { cardNumber }),
  removeMyMagicCardModel: (cardNumber) => request(`/api/profile/magic-card/model${qs({ card: cardNumber })}`, { method: 'DELETE' }),
  uploadMyMagicCardImage: (asset, width, height, cardNumber) => upload('/api/profile/magic-card/image', asset, 'image', { width, height, cardNumber }),
  removeMyMagicCardImage: (cardNumber) => request(`/api/profile/magic-card/image${qs({ card: cardNumber })}`, { method: 'DELETE' }),

  // ---- shop / checkout ----
  submitRequest: (payload) => request('/api/profile/requests', { method: 'POST', body: payload }),
  getCardCheckoutPricing: (state) => request('/api/profile/card-checkout/pricing', { method: 'POST', body: { state } }),
  createUpgradeOrder: (requestedPlan, quantity, variants, deliveryAddressId) =>
    request('/api/profile/upgrade-order', { method: 'POST', body: { requestedPlan, quantity, variants, deliveryAddressId } }),
  confirmUpgradePayment: (payload) => request('/api/profile/upgrade-confirm', { method: 'POST', body: payload }),
  previewCoupon: (code) => request('/api/profile/coupon/preview', { method: 'POST', body: { code } }),
  claimCoupon: (payload) => request('/api/profile/coupon/claim', { method: 'POST', body: payload }),
  createNewCardOrder: (payload) => request('/api/profile/new-card-order', { method: 'POST', body: payload }),
  confirmNewCardPayment: (payload) => request('/api/profile/new-card-confirm', { method: 'POST', body: payload }),
  createMagicPosterOrder: (items, delivery) => request('/api/profile/magic-poster/order', { method: 'POST', body: { items, delivery } }),
  confirmMagicPosterPayment: (payload) => request('/api/profile/magic-poster/confirm', { method: 'POST', body: payload }),
  getMagicPosterPricing: (items, state) => request('/api/profile/magic-poster/pricing', { method: 'POST', body: { items, state } }),
  listMyMagicPosterOrdersPage: ({ q, skip, limit } = {}) => request(`/api/profile/magic-poster/orders${qs({ q, skip, limit })}`),
  listAddresses: () => request('/api/profile/addresses'),
  createAddress: (payload) => request('/api/profile/addresses', { method: 'POST', body: payload }),
  updateAddress: (id, payload) => request(`/api/profile/addresses/${id}`, { method: 'PATCH', body: payload }),
  deleteAddress: (id) => request(`/api/profile/addresses/${id}`, { method: 'DELETE' }),

  // ---- contacts + appointments (extras) ----
  importContacts: (contacts) => request('/api/profile/contacts/import', { method: 'POST', body: { contacts } }),
  uploadContactPhoto: (id, asset) => upload(`/api/profile/contacts/${id}/photo`, asset, 'photo'),
  removeContactPhoto: (id) => request(`/api/profile/contacts/${id}/photo`, { method: 'DELETE' }),
  sendAppointmentRequest: (contactId, note, proposedAt) => request('/api/profile/appointments', { method: 'POST', body: { contactId, note, proposedAt } }),
  getAppointmentBusyTimes: (phone) => request(`/api/profile/appointments/busy${qs({ phone })}`),
};
