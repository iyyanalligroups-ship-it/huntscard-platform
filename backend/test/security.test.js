// Security regression tests. Run: node --test test/
// Models and Razorpay are replaced with in-memory fakes (nothing touches a database or the network).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-real';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy-razorpay-secret';
process.env.BACKEND_URL = 'http://localhost:4000';
process.env.PUBLIC_BASE_URL = 'http://localhost:5173';

const root = path.join(__dirname, '..');
function fake(modPath, exports) {
  const file = require.resolve(path.join(root, modPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports, children: [], paths: [] };
}

// ---- fakes ----
const calls = { clientFindOne: [] };
let clientRecord = null;
let createdClient = null;
const thenable = (result) => Object.assign(Promise.resolve(result), { select: () => Promise.resolve(result) });
fake('models/Client.js', {
  findOne: (q) => {
    calls.clientFindOne.push(q);
    return thenable(clientRecord);
  },
  create: async (data) => {
    createdClient = { ...data };
    return createdClient;
  },
});
let registrationOtpRecord = null;
let lastSms = null;
fake('models/RegistrationOtp.js', {
  findOne: async ({ phone }) => registrationOtpRecord?.phone === phone ? registrationOtpRecord : null,
  findOneAndUpdate: async ({ phone }, update) => {
    registrationOtpRecord = {
      phone,
      ...update,
      save: async function save() { return this; },
    };
    return registrationOtpRecord;
  },
  deleteOne: async ({ phone }) => {
    if (registrationOtpRecord?.phone === phone) registrationOtpRecord = null;
  },
});
fake('utils/sms.js', { sendSms: async (phone, message) => { lastSms = { phone, message }; } });
fake('routes/appointments.js', { claimAppointmentRequests: async () => {} });
const adminRecord = { role: 'admin', _id: 'a1', email: 'a@x.test' };
fake('models/Admin.js', { findById: () => thenable(adminRecord), findOne: () => thenable(null) });
const contact = { _id: '507f1f77bcf86cd799439011', clientId: 'c1' };
fake('models/Contact.js', { findOneAndUpdate: async () => contact });
let existingPayment = null;
const plan = { key: 'gold', variants: [], requiresDesignUpload: false };
fake('models/CardRequest.js', { findOne: async () => existingPayment, create: async (d) => d });
fake('models/CardPlan.js', { findOne: async () => plan });
let orderNotes = {};
require.cache[require.resolve('razorpay')] = {
  id: 'razorpay', filename: 'razorpay', loaded: true, children: [], paths: [],
  exports: class {
    constructor() {
      this.orders = { fetch: async () => ({ notes: orderNotes }), create: async () => ({}) };
    }
  },
};

const authRoutes = require('../routes/auth');
const adminAuthRoutes = require('../routes/adminAuth');
const contactsRoutes = require('../routes/contacts');
const publicRoutes = require('../routes/public');
const adminRoutes = require('../routes/admin');
const { requireAuth } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/profile', contactsRoutes);
app.get('/api/profile/whoami', requireAuth, (req, res) => res.json({ ok: true }));
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

let server;
let base;
test.before(async () => {
  await new Promise((r) => { server = http.createServer(app).listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (p, body, headers = {}) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);
const DAY = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const expiredClient = (days) => sign({ type: 'client', clientId: 'c1', loginEmail: 'a@x.test', iat: now() - (days + 1) * DAY, exp: now() - days * DAY });
const expiredAdmin = (days) => sign({ type: 'admin', adminId: 'a1', iat: now() - (days + 1) * DAY, exp: now() - days * DAY });

test.beforeEach(() => {
  clientRecord = { clientId: 'c1', loginEmail: 'a@x.test', blocked: false };
  createdClient = null;
  registrationOtpRecord = null;
  lastSms = null;
  existingPayment = null;
  calls.clientFindOne.length = 0;
});

// ---------------- token refresh ----------------
test('expired token on a protected route answers 401 TOKEN_EXPIRED', async () => {
  const r = await fetch(base + '/api/profile/whoami', { headers: { Authorization: 'Bearer ' + expiredClient(1) } });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'TOKEN_EXPIRED');
});
test('garbage token answers 401 TOKEN_INVALID', async () => {
  const r = await fetch(base + '/api/profile/whoami', { headers: { Authorization: 'Bearer nonsense' } });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'TOKEN_INVALID');
});
test('refresh: token expired 1 day ago is exchanged for a working token', async () => {
  const r = await post('/api/auth/refresh', { token: expiredClient(1) });
  assert.equal(r.status, 200);
  const { token } = await r.json();
  const ok = await fetch(base + '/api/profile/whoami', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(ok.status, 200);
});
test('refresh: token expired 40 days ago is refused', async () => {
  assert.equal((await post('/api/auth/refresh', { token: expiredClient(40) })).status, 401);
});
test('refresh: garbage, wrong-secret, wrong-type and missing tokens are refused', async () => {
  assert.equal((await post('/api/auth/refresh', { token: 'garbage' })).status, 401);
  assert.equal((await post('/api/auth/refresh', { token: jwt.sign({ type: 'client', clientId: 'c1' }, 'other-secret', { expiresIn: '1h' }) })).status, 401);
  assert.equal((await post('/api/auth/refresh', { token: sign({ type: 'admin', adminId: 'a1' }, { expiresIn: '1h' }) })).status, 401);
  assert.equal((await post('/api/auth/refresh', {})).status, 401);
});
test('refresh: admin-issued impersonation tokens cannot be extended', async () => {
  const t = sign({ type: 'client', clientId: 'c1', impersonatedBy: 'a@x.test' }, { expiresIn: '1m' });
  assert.equal((await post('/api/auth/refresh', { token: t })).status, 401);
});
test('refresh: blocked client is refused', async () => {
  clientRecord = { clientId: 'c1', loginEmail: 'a@x.test', blocked: true };
  assert.equal((await post('/api/auth/refresh', { token: expiredClient(1) })).status, 403);
});
test('admin refresh: recent expired admin token works; 40-day and client tokens do not', async () => {
  assert.equal((await post('/api/admin/auth/refresh', { token: expiredAdmin(1) })).status, 200);
  assert.equal((await post('/api/admin/auth/refresh', { token: expiredAdmin(40) })).status, 401);
  assert.equal((await post('/api/admin/auth/refresh', { token: expiredClient(1) })).status, 401);
});

// ---------------- query operator injection ----------------
test('login-otp request with an operator object never reaches the query', async () => {
  const r = await post('/api/auth/login-otp/request', { phone: { $ne: null } });
  assert.equal(r.status, 400);
  assert.equal(calls.clientFindOne.length, 0);
});
test('login-otp verify and login reject operator objects', async () => {
  assert.equal((await post('/api/auth/login-otp/verify', { phone: { $gt: '' }, otp: '123456' })).status, 400);
  assert.equal((await post('/api/auth/login', { identifier: { $ne: null }, password: 'x' })).status, 400);
  assert.equal(calls.clientFindOne.length, 0);
});
test('login-otp request clearly rejects an unregistered phone number', async () => {
  clientRecord = null;
  const r = await post('/api/auth/login-otp/request', { phone: '9876543210' });
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /not registered/i);
});
test('registration requires phone-verification proof for the submitted number', async () => {
  const fields = {
    fullName: 'Test User',
    phone: '9876543210',
    loginEmail: 'test@example.com',
    password: 'password123',
  };
  assert.equal((await post('/api/auth/register', fields)).status, 400);

  const phoneVerificationToken = sign(
    { type: 'registration-phone', phone: '9999999999' },
    { expiresIn: '15m' }
  );
  assert.equal((await post('/api/auth/register', { ...fields, phoneVerificationToken })).status, 400);
});
test('phone-verified registration can create an account without email', async () => {
  clientRecord = null;
  const phone = '9876543210';
  const phoneVerificationToken = sign(
    { type: 'registration-phone', phone },
    { expiresIn: '15m' }
  );
  const response = await post('/api/auth/register', {
    fullName: 'Phone Only',
    phone,
    password: 'password123',
    phoneVerificationToken,
  });
  assert.equal(response.status, 201);
  assert.equal(createdClient.phone, phone);
  assert.equal(createdClient.loginEmail, undefined);
});
test('registration OTP verifies the phone and returns matching signed proof', async () => {
  clientRecord = null;
  const phone = '9876543210';
  assert.equal((await post('/api/auth/register-otp/request', { phone })).status, 200);
  assert.equal(lastSms.phone, phone);
  const otp = lastSms.message.match(/is (\d{6})/)[1];

  const verified = await post('/api/auth/register-otp/verify', { phone, otp });
  assert.equal(verified.status, 200);
  const { verificationToken } = await verified.json();
  const proof = jwt.verify(verificationToken, process.env.JWT_SECRET);
  assert.equal(proof.type, 'registration-phone');
  assert.equal(proof.phone, phone);
  assert.equal(registrationOtpRecord, null);
});

// ---------------- uploads ----------------
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
async function uploadPhoto(id, filename) {
  const fd = new FormData();
  fd.append('photo', new Blob([PNG], { type: 'image/png' }), filename);
  const token = sign({ type: 'client', clientId: 'c1' }, { expiresIn: '1h' });
  return fetch(`${base}/api/profile/contacts/${id}/photo`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
}
test('contact photo: ":id" cannot steer the file outside the uploads folder', async () => {
  const names = () => fs.readdirSync(root).filter((f) => f.includes('traversal-probe'));
  const before = names();
  const r = await uploadPhoto('..%2F..%2Ftraversal-probe', 'a.png');
  assert.equal(r.status, 404);
  assert.deepEqual(names(), before);
});
test('contact photo: stored extension follows the MIME type, not the filename', async () => {
  const dir = path.join(root, 'uploads', 'contact-photos');
  const existing = new Set(fs.readdirSync(dir));
  const r = await uploadPhoto('507f1f77bcf86cd799439011', 'evil.html');
  assert.equal(r.status, 200);
  const created = fs.readdirSync(dir).filter((f) => !existing.has(f));
  try {
    assert.equal(created.length, 1);
    assert.match(created[0], /^contact-[0-9a-f]{16}\.png$/);
  } finally {
    created.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  }
});

// ---------------- payments ----------------
const sig = (o, p) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${o}|${p}`).digest('hex');
const shop = (over = {}) =>
  post('/api/public/shop-confirm', {
    requestedPlan: 'gold', fullName: 'T', loginEmail: 'buyer@x.test',
    razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig('order_1', 'pay_1'), ...over,
  });
test('shop-confirm: paying for one plan cannot be redeemed as another', async () => {
  clientRecord = null;
  orderNotes = { requestedPlan: 'basic', loginEmail: 'buyer@x.test' };
  assert.equal((await shop()).status, 400);
});
test('shop-confirm: the order must have been made for the same email', async () => {
  clientRecord = null;
  orderNotes = { requestedPlan: 'gold', loginEmail: 'someone-else@x.test' };
  assert.equal((await shop()).status, 400);
});
test('shop-confirm: a payment id that was already used is refused', async () => {
  clientRecord = null;
  existingPayment = { razorpayPaymentId: 'pay_1' };
  assert.equal((await shop()).status, 409);
});
test('shop-confirm: a bad signature is refused', async () => {
  assert.equal((await shop({ razorpay_signature: 'x' })).status, 400);
});

// ---------------- app upload header check ----------------
test('app upload: a non-zip file renamed .apk is rejected on assemble', async () => {
  const auth = { Authorization: 'Bearer ' + sign({ type: 'admin', adminId: 'a1' }, { expiresIn: '1h' }) };
  const uploadId = 'test-' + crypto.randomBytes(6).toString('hex');
  const tmp = path.join(root, 'uploads', 'app-downloads', '.tmp', uploadId);
  try {
    const c = await fetch(`${base}/api/admin/app-downloads/android/chunk?uploadId=${uploadId}&index=0`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('this is not a zip file'),
    });
    assert.equal(c.status, 200);
    const done = await post('/api/admin/app-downloads/android/complete', { uploadId, total: 1, size: 22, filename: 'x.apk' }, auth);
    assert.equal(done.status, 400);
    assert.match((await done.json()).error, /not a valid \.apk/);
    assert.ok(!fs.existsSync(path.join(root, 'uploads', 'app-downloads', 'HuntsTAG.apk.uploading')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------- contacts paging ----------------
test('contacts: ?limit pages the list, no ?limit keeps the plain array', async () => {
  const all = Array.from({ length: 25 }, (_, i) => ({ _id: String(i), name: 'n' + i }));
  const ContactModel = require('../models/Contact.js');
  const prev = { find: ContactModel.find, countDocuments: ContactModel.countDocuments, updateOne: ContactModel.updateOne };
  ContactModel.updateOne = async () => ({});
  let skipped = 0, limited = 0;
  ContactModel.find = () => {
    const q = { sort: () => q, skip: (n) => { skipped = n; return q; }, limit: (n) => { limited = n; return q; },
      then: (res, rej) => Promise.resolve(all.slice(skipped, limited ? skipped + limited : undefined)).then(res, rej) };
    return q;
  };
  ContactModel.countDocuments = async () => all.length;
  try {
    const h = { Authorization: 'Bearer ' + sign({ type: 'client', clientId: 'c1' }, { expiresIn: '1h' }) };
    const p1 = await (await fetch(base + '/api/profile/contacts?skip=0&limit=10', { headers: h })).json();
    assert.equal(p1.contacts.length, 10); assert.equal(p1.total, 25); assert.equal(p1.hasMore, true);
    const p3 = await (await fetch(base + '/api/profile/contacts?skip=20&limit=10', { headers: h })).json();
    assert.equal(p3.contacts.length, 5); assert.equal(p3.hasMore, false);
    skipped = 0; limited = 0;
    const plain = await (await fetch(base + '/api/profile/contacts', { headers: h })).json();
    assert.ok(Array.isArray(plain));
  } finally { Object.assign(ContactModel, prev); }
});
