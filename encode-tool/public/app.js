/**
 * Frontend for the HuntsTAG encode tool GUI. Plain JS, no build step --
 * this is a local tool run by one operator, not a shipped web product,
 * so a framework would be pure overhead here.
 */

const loginView = document.getElementById('loginView');
const pickerView = document.getElementById('pickerView');
const statusView = document.getElementById('statusView');
const sessionInfo = document.getElementById('sessionInfo');
const sessionEmail = document.getElementById('sessionEmail');
const tabBar = document.getElementById('tabBar');

let currentClient = null; // { clientId, fullName }
let currentTabId = 'writeCard'; // remembers which tab to return to after an encode finishes
let statusViewHomeMarker = null; // set only while statusView is relocated inline into a pending-item row

// Moves the shared statusView node back to its normal place in the DOM
// (right after pickerView) and hides it. No-op if it was never relocated.
function returnStatusViewHome() {
  statusView.classList.add('hidden');
  statusView.classList.remove('inline-status');
  document.getElementById('pendingList').classList.remove('encoding-active');
  if (statusViewHomeMarker && statusViewHomeMarker.parentNode) {
    statusViewHomeMarker.parentNode.insertBefore(statusView, statusViewHomeMarker);
    statusViewHomeMarker.remove();
  }
  statusViewHomeMarker = null;
}

// Fetched once at startup so "Preview page" links and backend API URLs can be built
fetch('/api/settings')
  .then((r) => r.json())
  .then((cfg) => {
    window.PUBLIC_BASE_URL = cfg.publicBaseUrl;
    window.BACKEND_URL = cfg.backendUrl || 'http://localhost:4000';
  })
  .catch(() => {
    window.PUBLIC_BASE_URL = '';
    window.BACKEND_URL = 'http://localhost:4000';
  });

function getBackendUrl() {
  return (window.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

function getAuthHeader() {
  return window.SESSION_TOKEN ? { Authorization: `Bearer ${window.SESSION_TOKEN}` } : {};
}

// In-page substitute for window.confirm()/alert() -- Electron's native
// synchronous dialogs can leave this BrowserWindow unable to deliver
// clicks/focus to its own inputs afterward (a known Chromium/Electron
// quirk), which looks exactly like the whole app freezing. This never
// leaves the page, so no such focus loss can happen.
const confirmModalOverlay = document.getElementById('confirmModalOverlay');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const confirmModalCancelBtn = document.getElementById('confirmModalCancelBtn');
const confirmModalOkBtn = document.getElementById('confirmModalOkBtn');

function showConfirm(message, { okOnly = false } = {}) {
  return new Promise((resolve) => {
    confirmModalMessage.textContent = message;
    confirmModalCancelBtn.classList.toggle('hidden', okOnly);
    confirmModalOverlay.classList.remove('hidden');

    function cleanup(result) {
      confirmModalOverlay.classList.add('hidden');
      confirmModalOkBtn.removeEventListener('click', onOk);
      confirmModalCancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    confirmModalOkBtn.addEventListener('click', onOk);
    confirmModalCancelBtn.addEventListener('click', onCancel);
  });
}

function showAlert(message) {
  return showConfirm(message, { okOnly: true });
}

// The card actually stores the API host (e.g. api.huntstag.com/c/...) since
// that's what serves the tap page -- but showing "api." on screen exposes
// backend infrastructure to whoever's looking at this admin tool. Strip it
// for DISPLAY ONLY; the real link (href, iframe preview) still uses the
// unmodified URL underneath, so nothing about the actual behavior changes.
function friendlyUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/^api\./, '');
    return u.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------
// Settings -- backend URL + public base URL, editable before or after
// login (you need the backend URL right before you can log in at all).
// ---------------------------------------------------------------------
const settingsView = document.getElementById('settingsView');
const settingsBtn = document.getElementById('settingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsError = document.getElementById('settingsError');
const settingsSuccess = document.getElementById('settingsSuccess');
let settingsPreviousView = null;

async function openSettings() {
  settingsError.classList.add('hidden');
  settingsSuccess.classList.add('hidden');
  try {
    const res = await fetch('/api/settings');
    const cfg = await res.json();
    document.getElementById('settingsBackendUrl').value = cfg.backendUrl || '';
    document.getElementById('settingsPublicBaseUrl').value = cfg.publicBaseUrl || '';
  } catch {
    // leave fields as-is if this fails -- not fatal, just means stale values shown
  }
  settingsPreviousView = [loginView, pickerView, statusView].find((v) => !v.classList.contains('hidden')) || loginView;
  [loginView, pickerView, statusView].forEach((v) => v.classList.add('hidden'));
  settingsView.classList.remove('hidden');
}

function closeSettings() {
  settingsView.classList.add('hidden');
  (settingsPreviousView || loginView).classList.remove('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);

settingsSaveBtn.addEventListener('click', async () => {
  const backendUrl = document.getElementById('settingsBackendUrl').value.trim();
  const publicBaseUrl = document.getElementById('settingsPublicBaseUrl').value.trim();
  settingsError.classList.add('hidden');
  settingsSuccess.classList.add('hidden');

  // Client-side validation before hitting the server
  if (!backendUrl || !/^https?:\/\//.test(backendUrl)) {
    settingsError.textContent = 'Backend URL must start with http:// or https://';
    settingsError.classList.remove('hidden');
    return;
  }
  if (publicBaseUrl && !/^https?:\/\//.test(publicBaseUrl)) {
    settingsError.textContent = 'Public base URL must start with http:// or https://';
    settingsError.classList.remove('hidden');
    return;
  }

  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backendUrl, publicBaseUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    settingsError.textContent = body.error || 'Could not save settings';
    settingsError.classList.remove('hidden');
    return;
  }
  window.PUBLIC_BASE_URL = body.publicBaseUrl;
  settingsSuccess.textContent = '✅ Saved.';
  settingsSuccess.classList.remove('hidden');
});

// ---------------------------------------------------------------------
// View switching (top-level: login / tabs / active-encode status)
// ---------------------------------------------------------------------
function showView(view) {
  [loginView, pickerView, statusView].forEach((v) => v.classList.add('hidden'));
  view.classList.remove('hidden');
}

const TAB_IDS = ['writeCard', 'readCard', 'protectTestCard', 'recoverCard', 'pickerView', 'analyzeCard'];

// Shows exactly one tab's content, hides the rest, and highlights the
// matching tab button. This is the logged-in "home" -- separate pages in
// spirit, kept as one DOM for simplicity since it's a local single-user
// tool with no need for real URL routing. Callers are responsible for
// also calling showView(pickerView) so the outer login/status switcher
// (loginView / pickerView / statusView) is in the right state -- this
// function only decides WHICH tab shows inside that "logged in" state.
function showTab(tabId) {
  currentTabId = tabId;
  TAB_IDS.forEach((id) => document.getElementById(id).classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  tabBar.classList.remove('hidden');
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    showView(pickerView); // pickerView acts as the generic "logged-in home" container in the outer switcher
    showTab(btn.dataset.tab);
  });
});

// ---------------------------------------------------------------------
// Session bootstrap
// ---------------------------------------------------------------------
async function checkSession() {
  const res = await fetch('/api/session');
  const body = await res.json();
  if (body.loggedIn) {
    window.SESSION_TOKEN = body.token;
    if (body.backendUrl) window.BACKEND_URL = body.backendUrl;
    if (body.publicBaseUrl) window.PUBLIC_BASE_URL = body.publicBaseUrl;
    sessionEmail.textContent = body.adminEmail;
    sessionInfo.classList.remove('hidden');
    showView(pickerView);
    showTab(currentTabId);
    loadPending();
  } else {
    sessionInfo.classList.add('hidden');
    tabBar.classList.add('hidden');
    showView(loginView);
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.classList.add('hidden');

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    errorEl.textContent = body.error || 'Login failed';
    errorEl.classList.remove('hidden');
    return;
  }

  if (body.token) window.SESSION_TOKEN = body.token;
  if (body.backendUrl) window.BACKEND_URL = body.backendUrl;
  if (body.publicBaseUrl) window.PUBLIC_BASE_URL = body.publicBaseUrl;

  document.getElementById('loginPassword').value = '';
  checkSession();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  checkSession();
});

// ---------------------------------------------------------------------
// Pending client list
// ---------------------------------------------------------------------
async function loadPending() {
  const listEl = document.getElementById('pendingList');
  const emptyEl = document.getElementById('pendingEmpty');
  listEl.innerHTML = '';

  const res = await fetch(`${getBackendUrl()}/api/admin/encode/pending`, {
    headers: getAuthHeader(),
  });
  if (res.status === 401) {
    // The backend rejected our token (expired/revoked), but the local
    // gui-server still has it saved -- checkSession() alone would just see
    // that saved session, report loggedIn again, and call loadPending()
    // again, looping forever. Clear it server-side first so checkSession()
    // correctly reports loggedIn: false and shows the login screen.
    await fetch('/api/logout', { method: 'POST' });
    return checkSession();
  }
  const clients = await res.json();

  if (clients.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  clients.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'pending-item';
    item.innerHTML = `
      <div class="pending-item-row">
        <div>
          <div class="pending-item-name">${escapeHtml(c.fullName)}</div>
          <div class="pending-item-meta">${escapeHtml(c.clientId)} &middot; ${escapeHtml(c.cardType || 'no plan set')}</div>
        </div>
        <div class="pending-item-actions">
          <a class="preview-link" href="${escapeHtml((window.PUBLIC_BASE_URL || '') + '/c/' + c.clientId)}" target="_blank" rel="noopener">Preview page</a>
          <button class="edit-toggle">Edit details</button>
          <button class="encode-btn">Encode this card</button>
        </div>
      </div>
      <div class="edit-panel hidden">
        <label>Full name</label>
        <input class="edit-fullName" value="${escapeHtml(c.fullName || '')}" />
        <label>Phone</label>
        <input class="edit-phone" value="${escapeHtml(c.phone || '')}" placeholder="+91..." />
        <label>Login email</label>
        <input class="edit-loginEmail" value="${escapeHtml(c.loginEmail || '')}" type="email" />
        <div class="edit-panel-actions">
          <button class="save-btn">Save details</button>
          <span class="save-status"></span>
        </div>
      </div>
    `;
    item.querySelector('.encode-btn').addEventListener('click', () => armClient(c, item));
    item.querySelector('.edit-toggle').addEventListener('click', () => {
      item.querySelector('.edit-panel').classList.toggle('hidden');
    });
    item.querySelector('.save-btn').addEventListener('click', async () => {
      const statusEl = item.querySelector('.save-status');
      const fullName = item.querySelector('.edit-fullName').value.trim();
      const phone = item.querySelector('.edit-phone').value.trim();
      const loginEmail = item.querySelector('.edit-loginEmail').value.trim();

      statusEl.textContent = 'Saving...';
      statusEl.className = 'save-status';

      const res = await fetch(`${getBackendUrl()}/api/admin/clients/${encodeURIComponent(c.clientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ fullName, phone, loginEmail }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        statusEl.textContent = body.error || 'Could not save';
        statusEl.classList.add('save-error');
      } else {
        statusEl.textContent = 'Saved';
        statusEl.classList.add('save-ok');
        item.querySelector('.pending-item-name').textContent = fullName;
        c.fullName = fullName; // keep the in-memory object in sync so "Encode this card" uses the new name
      }
    });
    listEl.appendChild(item);
  });
}

document.getElementById('refreshBtn').addEventListener('click', loadPending);

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

// ---------------------------------------------------------------------
// Arm + live status
// ---------------------------------------------------------------------
async function armClient(client, item) {
  const res = await fetch('/api/arm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: client.clientId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    await showAlert(body.error || 'Could not start encoding');
    return;
  }

  currentClient = client;
  document.getElementById('statusName').textContent = client.fullName;
  resetSteps();
  document.getElementById('successPanel').classList.add('hidden');
  document.getElementById('errorPanel').classList.add('hidden');
  document.getElementById('cancelBtn').classList.remove('hidden');
  setStep('arm', 'active');

  if (item) {
    // Picked from "Paid clients awaiting a card" -- keep that whole list
    // visible and show the writing progress right inside this client's
    // own row, instead of navigating away to a separate full-page view.
    statusViewHomeMarker = document.createComment('status-view-home');
    statusView.parentNode.insertBefore(statusViewHomeMarker, statusView);
    item.appendChild(statusView);
    statusView.classList.remove('hidden');
    statusView.classList.add('inline-status');
    item.classList.add('pending-item-active');
    document.getElementById('pendingList').classList.add('encoding-active');
  } else {
    tabBar.classList.add('hidden');
    showView(statusView);
  }
}

function resetSteps() {
  document.querySelectorAll('.steps li').forEach((li) => li.classList.remove('active', 'done'));
}

function setStep(step, state) {
  const el = document.getElementById(`step-${step}`);
  if (!el) return;
  if (state === 'active') el.classList.add('active');
  if (state === 'done') {
    el.classList.remove('active');
    el.classList.add('done');
  }
}

// Password acknowledgment gate -- Done/Read-back stay disabled until
// this is checked, so it's much harder to walk away without saving a
// password that's never shown again.
document.getElementById('passwordSavedCheck').addEventListener('change', (e) => {
  document.getElementById('doneBtn').disabled = !e.target.checked;
  document.getElementById('readAfterWriteBtn').disabled = !e.target.checked;
});

document.getElementById('copyPasswordBtn').addEventListener('click', async () => {
  const password = document.getElementById('chipPassword').textContent;
  const btn = document.getElementById('copyPasswordBtn');
  try {
    await navigator.clipboard.writeText(password);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Copy failed -- select manually';
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
});

document.getElementById('cancelBtn').addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  if (statusViewHomeMarker) {
    returnStatusViewHome();
    loadPending();
  } else {
    showView(pickerView);
    showTab(currentTabId);
    loadPending();
  }
});

document.getElementById('doneBtn').addEventListener('click', () => {
  if (statusViewHomeMarker) {
    returnStatusViewHome();
    loadPending();
  } else {
    showView(pickerView);
    showTab(currentTabId);
    loadPending();
  }
});

document.getElementById('retryBtn').addEventListener('click', () => {
  if (statusViewHomeMarker) {
    returnStatusViewHome();
    loadPending();
  } else {
    showView(pickerView);
    showTab(currentTabId);
    loadPending();
  }
});

// ---------------------------------------------------------------------
// Live status stream from the reader
// ---------------------------------------------------------------------
const evtSource = new EventSource('/api/events');
const readerBanner = document.getElementById('readerBanner');
const readerPill = document.getElementById('readerPill');

evtSource.addEventListener('reader-connected', (e) => {
  const data = JSON.parse(e.data);
  readerBanner.textContent = `🔌 Reader connected: ${data.name}`;
  readerBanner.classList.add('connected');
  readerPill.textContent = 'Reader connected';
  readerPill.classList.add('connected');
});

evtSource.addEventListener('reader-disconnected', () => {
  readerBanner.textContent = '🔌 Reader disconnected -- re-plug the ACR1252U.';
  readerBanner.classList.remove('connected');
  readerPill.textContent = 'Reader disconnected';
  readerPill.classList.remove('connected');
});

evtSource.addEventListener('nfc-error', (e) => {
  const data = JSON.parse(e.data);
  readerBanner.textContent = `⚠️ ${data.message}`;
  readerBanner.classList.remove('connected');
  readerPill.textContent = 'Reader error';
  readerPill.classList.remove('connected');
});

// If nothing has reported a reader within a few seconds of loading, say
// so plainly rather than leaving "checking..." up forever -- that state
// looked identical to "working" and was the actual cause of the last
// confusing "I placed the card and nothing happened" report.
setTimeout(() => {
  if (readerPill.textContent === 'checking reader...') {
    readerPill.textContent = 'No reader detected';
  }
}, 4000);

evtSource.addEventListener('card-ignored', (e) => {
  const data = JSON.parse(e.data);
  readerBanner.textContent = `A card was tapped, but nothing is armed: ${data.reason}`;
});

evtSource.addEventListener('writing', () => setStep('writing', 'active'));
evtSource.addEventListener('verifying', () => {
  setStep('writing', 'done');
  setStep('verifying', 'active');
});
evtSource.addEventListener('locking', () => {
  setStep('verifying', 'done');
  setStep('locking', 'active');
});

evtSource.addEventListener('success', (e) => {
  const data = JSON.parse(e.data);
  setStep('locking', 'done');
  setStep('success', 'done');
  document.getElementById('cancelBtn').classList.add('hidden');
  document.getElementById('successCardNumber').textContent = data.cardNumber ? `#${data.cardNumber}` : '';
  document.getElementById('chipPassword').textContent = data.chipPassword;
  document.getElementById('successPanel').classList.remove('hidden');

  // Still force acknowledgment before letting anyone move on -- not
  // because the password is lost forever if they don't (it's saved
  // encrypted in the database now, an admin can look it up later), just
  // to make sure it was actually noted at the point of handing over the
  // physical card, when it's cheapest to double-check.
  const passwordSavedCheck = document.getElementById('passwordSavedCheck');
  passwordSavedCheck.checked = false;
  document.getElementById('doneBtn').disabled = true;
  document.getElementById('readAfterWriteBtn').disabled = true;
});

evtSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data);
  document.getElementById('cancelBtn').classList.add('hidden');
  document.getElementById('errorMessage').textContent = `❌ Encoding failed: ${data.message}`;
  document.getElementById('errorPanel').classList.remove('hidden');
});

// ---------------------------------------------------------------------
// Read / test a card
// ---------------------------------------------------------------------
const startReadBtn = document.getElementById('startReadBtn');
const readStatus = document.getElementById('readStatus');
const readStatusText = document.getElementById('readStatusText');
const cancelReadBtn = document.getElementById('cancelReadBtn');
const readResult = document.getElementById('readResult');
let readTimeoutId = null;

function resetReadUI() {
  clearTimeout(readTimeoutId);
  readStatus.classList.add('hidden');
  cancelReadBtn.classList.add('hidden');
  startReadBtn.disabled = false;
}

startReadBtn.addEventListener('click', async () => {
  readResult.classList.add('hidden');
  document.getElementById('phonePreviewWrap').classList.add('hidden');
  readStatusText.textContent = 'Arming...';
  readStatus.classList.remove('hidden');
  cancelReadBtn.classList.add('hidden');
  startReadBtn.disabled = true;

  const res = await fetch('/api/arm-read', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    resetReadUI();
    readResult.className = 'read-result read-error';
    readResult.textContent = `⚠️ Could not arm read mode: ${body.error || `HTTP ${res.status}`}`;
    readResult.classList.remove('hidden');
    return;
  }
  readStatusText.textContent = 'Armed -- lift the card fully off the reader first, then place it flat.';
  cancelReadBtn.classList.remove('hidden');

  // If nothing happens within 20s, don't leave the button stuck forever
  // requiring a page reload -- most readers only fire on a fresh
  // insertion, so a card left sitting on the pad from a previous read
  // won't retrigger. Time out and let the operator retry.
  readTimeoutId = setTimeout(() => {
    resetReadUI();
    readResult.className = 'read-result read-error';
    readResult.textContent = '⚠️ No card detected in 20s. Lift the card fully off the reader, then click "Read a card" again.';
    readResult.classList.remove('hidden');
  }, 20000);
});

cancelReadBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetReadUI();
});

document.getElementById('readAfterWriteBtn').addEventListener('click', async () => {
  if (statusViewHomeMarker) returnStatusViewHome();
  showView(pickerView);
  showTab('readCard');
  loadPending();
  startReadBtn.click();
});

evtSource.addEventListener('reading', () => {
  clearTimeout(readTimeoutId);
  readStatusText.textContent = 'Card detected -- reading...';
  cancelReadBtn.classList.add('hidden');
});

evtSource.addEventListener('read-result', (e) => {
  const data = JSON.parse(e.data);
  resetReadUI();

  const lockBadge = data.lockStatus?.error
    ? `<span class="lock-badge lock-unknown">🔒 Lock status: couldn't check (${escapeHtml(data.lockStatus.error)})</span>`
    : data.lockStatus?.locked
      ? `<span class="lock-badge lock-yes">🔒 Password-protected -- write access is locked</span>`
      : `<span class="lock-badge lock-no">🔓 Not password-protected -- still writable/unlocked</span>`;

  const urlLine = data.url
    ? `This card opens: <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(friendlyUrl(data.url))}</a>`
    : `⚠️ No readable link found${data.urlError ? `: ${escapeHtml(data.urlError)}` : ''}`;

  readResult.className = 'read-result read-ok';
  readResult.innerHTML = `<div>${data.url ? '✅ ' : ''}${urlLine}</div><div class="lock-badge-row">${lockBadge}</div>`;
  readResult.classList.remove('hidden');

  if (data.url) {
    // Load it in the phone-shaped frame so you can see the actual mobile
    // rendering right here on localhost -- no separate device needed for
    // this first look.
    // Cache-bust every time -- the URL itself never changes between
    // taps of the same card, so just re-setting .src to an identical
    // value doesn't actually reload the iframe. Without this, the
    // preview silently keeps showing whatever it first fetched, even
    // after real profile changes (like adding a Huntsworld link).
    const bustUrl = data.url + (data.url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    document.getElementById('phonePreviewFrame').src = bustUrl;
    document.getElementById('phonePreviewWrap').classList.remove('hidden');
  } else {
    document.getElementById('phonePreviewWrap').classList.add('hidden');
  }
});

evtSource.addEventListener('read-error', (e) => {
  const data = JSON.parse(e.data);
  resetReadUI();
  readResult.className = 'read-result read-error';
  readResult.textContent = `⚠️ ${data.message}`;
  readResult.classList.remove('hidden');
  document.getElementById('phonePreviewWrap').classList.add('hidden');
});

// ---------------------------------------------------------------------
// 1. Write client data -- look up ANY client by ID and edit their
// contact details, same real update the admin webpage makes.
// ---------------------------------------------------------------------
document.getElementById('writeLookupBtn').addEventListener('click', async () => {
  const clientId = document.getElementById('writeIdInput').value.trim();
  const errorEl = document.getElementById('writeLookupError');
  const formEl = document.getElementById('writeForm');
  errorEl.classList.add('hidden');
  formEl.classList.add('hidden');
  if (!clientId) return;

  const res = await fetch(`${getBackendUrl()}/api/admin/encode/client/${encodeURIComponent(clientId)}`, {
    headers: getAuthHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = body.error || 'Client not found';
    errorEl.classList.remove('hidden');
    return;
  }

  const cardCount = Array.isArray(body.cards) ? body.cards.length : 0;
  document.getElementById('writeFormMeta').textContent =
    `${body.clientId} · ${body.paid ? 'paid' : 'not paid'} · ${cardCount === 0 ? 'no cards yet' : `${cardCount} card${cardCount === 1 ? '' : 's'} encoded`}`;
  document.getElementById('writeFullName').value = body.fullName || '';
  document.getElementById('writeJobTitle').value = body.jobTitle || '';
  document.getElementById('writeBio').value = body.bio || '';
  document.getElementById('writePhone').value = body.phone || '';
  document.getElementById('writeWhatsapp').value = body.whatsapp || '';
  document.getElementById('writeLoginEmail').value = body.loginEmail || '';
  document.getElementById('writePublicEmail').value = body.publicEmail || '';
  document.getElementById('writeInstagram').value = body.instagramUrl || '';
  document.getElementById('writeTwitter').value = body.twitterUrl || '';
  document.getElementById('writePortfolio').value = body.portfolioUrl || '';
  document.getElementById('writeHuntsworld').value = body.huntsworldUrl || '';
  formEl.dataset.clientId = body.clientId;
  formEl.classList.remove('hidden');
});

document.getElementById('writeSaveBtn').addEventListener('click', async () => {
  const clientId = document.getElementById('writeForm').dataset.clientId;
  const statusEl = document.getElementById('writeSaveStatus');

  statusEl.textContent = 'Saving...';
  statusEl.className = 'save-status';

  const res = await fetch(`${getBackendUrl()}/api/admin/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      fullName: document.getElementById('writeFullName').value.trim(),
      jobTitle: document.getElementById('writeJobTitle').value.trim(),
      bio: document.getElementById('writeBio').value.trim(),
      phone: document.getElementById('writePhone').value.trim(),
      whatsapp: document.getElementById('writeWhatsapp').value.trim(),
      publicEmail: document.getElementById('writePublicEmail').value.trim(),
      instagramUrl: document.getElementById('writeInstagram').value.trim(),
      twitterUrl: document.getElementById('writeTwitter').value.trim(),
      portfolioUrl: document.getElementById('writePortfolio').value.trim(),
      huntsworldUrl: document.getElementById('writeHuntsworld').value.trim(),
    }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    statusEl.textContent = body.error || 'Could not save';
    statusEl.classList.add('save-error');
  } else {
    statusEl.textContent = 'Saved';
    statusEl.classList.add('save-ok');
  }
});

// ---------------------------------------------------------------------
// 3b. Gift a card by Client ID -- same encode flow as picking from the
// paid list, but skips the paid:true requirement entirely. A client can
// have several cards now (see models/Card.js), so this always reserves a
// NEW card slot -- there's no more "already encoded, replace it?" block.
// ---------------------------------------------------------------------
document.getElementById('giftLookupBtn').addEventListener('click', () => attemptGiftArm());

async function attemptGiftArm() {
  const clientId = document.getElementById('giftIdInput').value.trim();
  const errorEl = document.getElementById('giftError');
  errorEl.classList.add('hidden');
  if (!clientId) return;

  const res = await fetch('/api/arm-by-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    errorEl.textContent = body.error || 'Could not start encoding';
    errorEl.classList.remove('hidden');
    return;
  }

  // Reuse the exact same status screen as the normal paid-client flow --
  // it doesn't care how the client was found, only that a job is armed.
  document.getElementById('statusName').textContent = clientId;
  resetSteps();
  document.getElementById('successPanel').classList.add('hidden');
  document.getElementById('errorPanel').classList.add('hidden');
  document.getElementById('cancelBtn').classList.remove('hidden');
  tabBar.classList.add('hidden');
  setStep('arm', 'active');
  showView(statusView);
}

// ---------------------------------------------------------------------
// Password tester -- attempts REAL authentication with a specific
// password, not just a lock/unlock guess.
// ---------------------------------------------------------------------
const protectTestBtn = document.getElementById('protectTestBtn');
const protectTestStatus = document.getElementById('protectTestStatus');
const protectTestStatusText = document.getElementById('protectTestStatusText');
const protectTestCancelBtn = document.getElementById('protectTestCancelBtn');
const protectTestResult = document.getElementById('protectTestResult');
let protectTestTimeoutId = null;

function resetProtectTestUI() {
  clearTimeout(protectTestTimeoutId);
  protectTestStatus.classList.add('hidden');
  protectTestCancelBtn.classList.add('hidden');
  protectTestBtn.disabled = false;
}

protectTestBtn.addEventListener('click', async () => {
  const password = document.getElementById('protectTestPwd').value.trim().toUpperCase();
  protectTestResult.classList.add('hidden');

  if (!/^[0-9A-F]{8}$/.test(password)) {
    protectTestResult.className = 'read-result read-error';
    protectTestResult.textContent = '⚠️ Enter the full 8-character password (e.g. 9C9707C8).';
    protectTestResult.classList.remove('hidden');
    return;
  }

  protectTestStatusText.textContent = 'Arming...';
  protectTestStatus.classList.remove('hidden');
  protectTestCancelBtn.classList.add('hidden');
  protectTestBtn.disabled = true;

  const res = await fetch('/api/arm-protect-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    resetProtectTestUI();
    protectTestResult.className = 'read-result read-error';
    protectTestResult.textContent = `⚠️ ${body.error || 'Could not arm test'}`;
    protectTestResult.classList.remove('hidden');
    return;
  }

  protectTestStatusText.textContent = 'Armed -- lift the card off the reader first, then place it flat.';
  protectTestCancelBtn.classList.remove('hidden');

  protectTestTimeoutId = setTimeout(() => {
    resetProtectTestUI();
    protectTestResult.className = 'read-result read-error';
    protectTestResult.textContent = '⚠️ No card detected in 20s. Lift the card off, then try again.';
    protectTestResult.classList.remove('hidden');
  }, 20000);
});

protectTestCancelBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetProtectTestUI();
});

evtSource.addEventListener('protect-test-result', (e) => {
  const data = JSON.parse(e.data);
  resetProtectTestUI();
  if (data.correctPassword) {
    protectTestResult.className = 'read-result read-ok';
    protectTestResult.textContent = '✅ Correct -- this password genuinely unlocks this card.';
  } else {
    protectTestResult.className = 'read-result read-error';
    protectTestResult.textContent = `❌ Rejected -- this password does NOT unlock this card${data.reason ? ` (${data.reason})` : ''}.`;
  }
  protectTestResult.classList.remove('hidden');
});

// ---------------------------------------------------------------------
// Recover a card -- unlock an already-locked card with its known
// password, wipe it, and remove the password lock, so it can be
// written fresh again through the normal flow.
// ---------------------------------------------------------------------
const recoverBtn = document.getElementById('recoverBtn');
const recoverStatus = document.getElementById('recoverStatus');
const recoverStatusText = document.getElementById('recoverStatusText');
const recoverCancelBtn = document.getElementById('recoverCancelBtn');
const recoverResult = document.getElementById('recoverResult');
let recoverTimeoutId = null;

function resetRecoverUI() {
  clearTimeout(recoverTimeoutId);
  recoverStatus.classList.add('hidden');
  recoverCancelBtn.classList.add('hidden');
  recoverBtn.disabled = false;
}

recoverBtn.addEventListener('click', async () => {
  const password = document.getElementById('recoverPwd').value.trim().toUpperCase();
  recoverResult.classList.add('hidden');

  if (!/^[0-9A-F]{8}$/.test(password)) {
    recoverResult.className = 'read-result read-error';
    recoverResult.textContent = '⚠️ Enter the full 8-character password (e.g. 9C9707C8).';
    recoverResult.classList.remove('hidden');
    return;
  }

  const confirmed = await showConfirm(
    'This permanently wipes the card\'s current data and removes its password lock. This cannot be undone. Continue?'
  );
  if (!confirmed) return;

  recoverStatusText.textContent = 'Arming...';
  recoverStatus.classList.remove('hidden');
  recoverCancelBtn.classList.add('hidden');
  recoverBtn.disabled = true;

  const res = await fetch('/api/arm-recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    resetRecoverUI();
    recoverResult.className = 'read-result read-error';
    recoverResult.textContent = `⚠️ ${body.error || 'Could not arm recovery'}`;
    recoverResult.classList.remove('hidden');
    return;
  }

  recoverStatusText.textContent = 'Armed -- lift the card off the reader first, then place it flat.';
  recoverCancelBtn.classList.remove('hidden');

  recoverTimeoutId = setTimeout(() => {
    resetRecoverUI();
    recoverResult.className = 'read-result read-error';
    recoverResult.textContent = '⚠️ No card detected in 20s. Lift the card off, then try again.';
    recoverResult.classList.remove('hidden');
  }, 20000);
});

recoverCancelBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetRecoverUI();
});

evtSource.addEventListener('recover-success', () => {
  resetRecoverUI();
  document.getElementById('recoverPwd').value = '';
  recoverResult.className = 'read-result read-ok';
  recoverResult.textContent = '✅ Unlocked and wiped -- this card is now blank and unprotected, ready for Write or Create a card.';
  recoverResult.classList.remove('hidden');
});

evtSource.addEventListener('recover-error', (e) => {
  const data = JSON.parse(e.data);
  resetRecoverUI();
  recoverResult.className = 'read-result read-error';
  recoverResult.textContent = `❌ ${data.message || 'Recovery failed'}`;
  recoverResult.classList.remove('hidden');
});

// ---------------------------------------------------------------------
// Blank a card with no password -- same idea as Recover above, but for a
// card that was never password-locked in the first place, so there's no
// password to enter or authenticate with.
// ---------------------------------------------------------------------
const blankBtn = document.getElementById('blankBtn');
const blankStatus = document.getElementById('blankStatus');
const blankStatusText = document.getElementById('blankStatusText');
const blankCancelBtn = document.getElementById('blankCancelBtn');
const blankResult = document.getElementById('blankResult');
let blankTimeoutId = null;

function resetBlankUI() {
  clearTimeout(blankTimeoutId);
  blankStatus.classList.add('hidden');
  blankCancelBtn.classList.add('hidden');
  blankBtn.disabled = false;
}

blankBtn.addEventListener('click', async () => {
  blankResult.classList.add('hidden');

  const confirmed = await showConfirm(
    'This permanently wipes the card\'s current data. This cannot be undone. Continue?'
  );
  if (!confirmed) return;

  blankStatusText.textContent = 'Arming...';
  blankStatus.classList.remove('hidden');
  blankCancelBtn.classList.add('hidden');
  blankBtn.disabled = true;

  const res = await fetch('/api/arm-blank', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    resetBlankUI();
    blankResult.className = 'read-result read-error';
    blankResult.textContent = `⚠️ ${body.error || 'Could not arm wipe'}`;
    blankResult.classList.remove('hidden');
    return;
  }

  blankStatusText.textContent = 'Armed -- lift the card off the reader first, then place it flat.';
  blankCancelBtn.classList.remove('hidden');

  blankTimeoutId = setTimeout(() => {
    resetBlankUI();
    blankResult.className = 'read-result read-error';
    blankResult.textContent = '⚠️ No card detected in 20s. Lift the card off, then try again.';
    blankResult.classList.remove('hidden');
  }, 20000);
});

blankCancelBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetBlankUI();
});

evtSource.addEventListener('blank-success', () => {
  resetBlankUI();
  blankResult.className = 'read-result read-ok';
  blankResult.textContent = '✅ Wiped -- this card is now blank, ready for Write or Create a card.';
  blankResult.classList.remove('hidden');
});

evtSource.addEventListener('blank-error', (e) => {
  const data = JSON.parse(e.data);
  resetBlankUI();
  blankResult.className = 'read-result read-error';
  blankResult.textContent = `❌ ${data.message || 'Wipe failed'}`;
  blankResult.classList.remove('hidden');
});

// ---------------------------------------------------------------------
// Card type analyser -- read-only chip identification (NTAG213/215/216).
// Exists because some cards handed out as "NTAG216" turned out to
// actually be NTAG213, which this tool's password lock doesn't support.
// ---------------------------------------------------------------------
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeStatus = document.getElementById('analyzeStatus');
const analyzeStatusText = document.getElementById('analyzeStatusText');
const analyzeCancelBtn = document.getElementById('analyzeCancelBtn');
const analyzeResult = document.getElementById('analyzeResult');
let analyzeTimeoutId = null;

function resetAnalyzeUI() {
  clearTimeout(analyzeTimeoutId);
  analyzeStatus.classList.add('hidden');
  analyzeCancelBtn.classList.add('hidden');
  analyzeBtn.disabled = false;
}

analyzeBtn.addEventListener('click', async () => {
  analyzeResult.classList.add('hidden');

  analyzeStatusText.textContent = 'Arming...';
  analyzeStatus.classList.remove('hidden');
  analyzeCancelBtn.classList.add('hidden');
  analyzeBtn.disabled = true;

  const res = await fetch('/api/arm-analyze', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    resetAnalyzeUI();
    analyzeResult.className = 'read-result read-error';
    analyzeResult.textContent = `⚠️ ${body.error || 'Could not arm analyser'}`;
    analyzeResult.classList.remove('hidden');
    return;
  }

  analyzeStatusText.textContent = 'Armed -- lift the card off the reader first, then place it flat.';
  analyzeCancelBtn.classList.remove('hidden');

  analyzeTimeoutId = setTimeout(() => {
    resetAnalyzeUI();
    analyzeResult.className = 'read-result read-error';
    analyzeResult.textContent = '⚠️ No card detected in 20s. Lift the card off, then try again.';
    analyzeResult.classList.remove('hidden');
  }, 20000);
});

analyzeCancelBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetAnalyzeUI();
});

evtSource.addEventListener('reading', () => {
  if (!analyzeStatus.classList.contains('hidden')) {
    clearTimeout(analyzeTimeoutId);
    analyzeStatusText.textContent = 'Card detected -- reading...';
    analyzeCancelBtn.classList.add('hidden');
  }
});

evtSource.addEventListener('analyze-result', (e) => {
  const data = JSON.parse(e.data);
  resetAnalyzeUI();

  const supportBadge = data.supported
    ? '<span class="lock-badge lock-no">✅ Supported -- this tool\'s password lock works on this card</span>'
    : '<span class="lock-badge lock-yes">❌ NOT supported -- do not attempt to lock/unlock this card, it will fail</span>';

  const details = [
    `Chip type: <b>${escapeHtml(data.chipType)}</b>`,
    data.totalPages ? `Total pages: ${data.totalPages}` : null,
    data.uid ? `UID: ${escapeHtml(data.uid)}` : null,
  ].filter(Boolean).join('<br>');

  analyzeResult.className = 'read-result read-ok';
  analyzeResult.innerHTML = `<div>${details}</div><div class="lock-badge-row">${supportBadge}</div>`;
  analyzeResult.classList.remove('hidden');
});

evtSource.addEventListener('analyze-error', (e) => {
  const data = JSON.parse(e.data);
  resetAnalyzeUI();
  analyzeResult.className = 'read-result read-error';
  analyzeResult.textContent = `❌ ${data.message || 'Could not identify this card'}`;
  analyzeResult.classList.remove('hidden');
});

// ---------------------------------------------------------------------
// Rewrite test -- the real-world check: actually attempt to write new
// data, optionally with a password, and report whether it was accepted.
// ---------------------------------------------------------------------
const rewriteTestBtn = document.getElementById('rewriteTestBtn');
const rewriteTestStatus = document.getElementById('rewriteTestStatus');
const rewriteTestStatusText = document.getElementById('rewriteTestStatusText');
const rewriteTestCancelBtn = document.getElementById('rewriteTestCancelBtn');
const rewriteTestResult = document.getElementById('rewriteTestResult');
let rewriteTestTimeoutId = null;

function resetRewriteTestUI() {
  clearTimeout(rewriteTestTimeoutId);
  rewriteTestStatus.classList.add('hidden');
  rewriteTestCancelBtn.classList.add('hidden');
  rewriteTestBtn.disabled = false;
}

rewriteTestBtn.addEventListener('click', async () => {
  const testText = document.getElementById('rewriteTestData').value.trim() || 'TEST';
  const password = document.getElementById('rewriteTestPwd').value.trim().toUpperCase();
  rewriteTestResult.classList.add('hidden');

  if (password && !/^[0-9A-F]{8}$/.test(password)) {
    rewriteTestResult.className = 'read-result read-error';
    rewriteTestResult.textContent = '⚠️ Password must be exactly 8 hex characters, or leave it blank to test writing with no password at all.';
    rewriteTestResult.classList.remove('hidden');
    return;
  }

  rewriteTestStatusText.textContent = 'Arming...';
  rewriteTestStatus.classList.remove('hidden');
  rewriteTestCancelBtn.classList.add('hidden');
  rewriteTestBtn.disabled = true;

  const res = await fetch('/api/arm-rewrite-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testText, password: password || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    resetRewriteTestUI();
    rewriteTestResult.className = 'read-result read-error';
    rewriteTestResult.textContent = `⚠️ ${body.error || 'Could not arm test'}`;
    rewriteTestResult.classList.remove('hidden');
    return;
  }

  rewriteTestStatusText.textContent = 'Armed -- lift the card off the reader first, then place it flat.';
  rewriteTestCancelBtn.classList.remove('hidden');

  rewriteTestTimeoutId = setTimeout(() => {
    resetRewriteTestUI();
    rewriteTestResult.className = 'read-result read-error';
    rewriteTestResult.textContent = '⚠️ No card detected in 20s. Lift the card off, then try again.';
    rewriteTestResult.classList.remove('hidden');
  }, 20000);
});

rewriteTestCancelBtn.addEventListener('click', async () => {
  await fetch('/api/disarm', { method: 'POST' });
  resetRewriteTestUI();
});

evtSource.addEventListener('rewrite-test-result', (e) => {
  const data = JSON.parse(e.data);
  resetRewriteTestUI();

  let text;
  if (data.authAttempted && !data.authSucceeded) {
    text = `❌ Password rejected -- write was never attempted. ${data.message || ''}`;
  } else if (data.writeSucceeded) {
    text = data.authAttempted
      ? '✅ Write succeeded WITH the password -- card is protected and this password genuinely unlocks it.'
      : '⚠️ Write succeeded with NO password -- this card is NOT protected. Anyone with a generic NFC writer could rewrite it.';
  } else {
    text = `🔒 Write REJECTED${data.authAttempted ? '' : ' with no password given'} -- this card is protected.${data.message ? ` (${data.message})` : ''}`;
  }

  rewriteTestResult.className = `read-result ${data.writeSucceeded && !data.authAttempted ? 'read-error' : 'read-ok'}`;
  rewriteTestResult.textContent = text;
  rewriteTestResult.classList.remove('hidden');
});

checkSession();
