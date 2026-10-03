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

function upload(path, asset, fieldName = 'photo') {
  const form = new FormData();
  form.append(fieldName, {
    uri: asset.uri,
    name: asset.fileName || `${fieldName}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  });
  return request(path, { method: 'POST', body: form, form: true });
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
};
