const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { nanoid } = require('nanoid');
const { requireAuth } = require('../middleware/auth');
const { str } = require('../utils/upload');
const Client = require('../models/Client');
const RegistrationOtp = require('../models/RegistrationOtp');
const { sendSms } = require('../utils/sms');
const { sendEmail } = require('../utils/email');
const { passwordResetEmail } = require('../utils/emailTemplates');
const { claimAppointmentRequests } = require('./appointments');

const router = express.Router();

// Lock out brute-force login attempts. This matters more than usual here
// because a client's public tap URL (and therefore their clientId) is, by
// design, visible to anyone who receives their card -- so an attacker can
// find a real account to target more easily than in a typical app.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Too many signup attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Forgot/reset-password is exactly the kind of endpoint that needs
// brute-force protection -- both a 6-digit code and repeated OTP requests
// are guessable/spammable without this.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many refresh attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const LOGIN_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LOGIN_OTP_MAX_ATTEMPTS = 5;
const LOGIN_OTP_RESEND_COOLDOWN_MS = 45 * 1000; // matches the Resend button's own countdown in AuthModal.jsx
const REGISTRATION_OTP_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const REGISTRATION_OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const REGISTRATION_VERIFICATION_TOKEN_TTL = '15m';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_OTP_MAX_ATTEMPTS = 5;
const RESET_OTP_RESEND_COOLDOWN_MS = 45 * 1000;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signToken(client) {
  return jwt.sign(
    { type: 'client', clientId: client.clientId, loginEmail: client.loginEmail },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

function normalizePhone(value) {
  return str(value).replace(/\D/g, '');
}

// POST /api/auth/register-otp/request
// Sends an OTP before an account exists. The temporary record is kept in a
// separate collection so an unverified phone number is never stored as a
// Client account.
router.post('/register-otp/request', otpLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
    }

    const existingClient = await Client.findOne({ phone }).select('_id');
    if (existingClient) {
      return res.status(409).json({ error: 'This phone number is already registered. Log in instead.' });
    }

    const pending = await RegistrationOtp.findOne({ phone });
    const withinCooldown =
      pending?.lastSentAt && Date.now() - pending.lastSentAt.getTime() < REGISTRATION_OTP_RESEND_COOLDOWN_MS;
    if (withinCooldown) {
      return res.status(429).json({ error: 'Please wait before requesting another verification code.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await RegistrationOtp.findOneAndUpdate(
      { phone },
      {
        otpHash: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + REGISTRATION_OTP_TTL_MS),
        attempts: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendSms(phone, `Your OTP for login/verification is ${otp}. Please do not share this with anyone. – HUNTSWORLD`);
    res.json({ ok: true, message: 'A verification code has been sent to your phone.' });
  } catch (err) {
    console.error('[auth/register-otp/request]', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// POST /api/auth/register-otp/verify
// A successful OTP check returns a short-lived signed proof. /register
// requires that proof and verifies that it belongs to the submitted phone.
router.post('/register-otp/verify', otpLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = str(req.body.otp);
    if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Enter a valid phone number and 6-digit code.' });
    }

    const pending = await RegistrationOtp.findOne({ phone });
    if (!pending || !pending.otpHash || !pending.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
    }
    if (pending.expiresAt < new Date()) {
      await RegistrationOtp.deleteOne({ phone });
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (pending.attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const ok = await bcrypt.compare(otp, pending.otpHash);
    if (!ok) {
      pending.attempts += 1;
      await pending.save();
      return res.status(401).json({ error: 'Incorrect code' });
    }

    await RegistrationOtp.deleteOne({ phone });
    const verificationToken = jwt.sign(
      { type: 'registration-phone', phone },
      process.env.JWT_SECRET,
      { expiresIn: REGISTRATION_VERIFICATION_TOKEN_TTL }
    );
    res.json({ ok: true, verificationToken });
  } catch (err) {
    console.error('[auth/register-otp/verify]', err);
    res.status(500).json({ error: 'Phone verification failed' });
  }
});

// POST /api/auth/register
// Self-service account creation -- replaces the old admin-only client
// creation flow. Free: no card, no payment, cardType/paid stay at their
// defaults (null/false). Getting an actual card happens afterward from
// inside the dashboard (Upgrade Card doubles as "get your first card"
// when cardType is still null -- same Razorpay-verified flow either way,
// see routes/profile.js upgrade-confirm).
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { gender, dateOfBirth } = req.body;
    const fullName = str(req.body.fullName);
    const designation = str(req.body.designation);
    const phone = str(req.body.phone);
    const loginEmail = str(req.body.loginEmail);
    const password = str(req.body.password);
    const phoneVerificationToken = str(req.body.phoneVerificationToken);
    if (!fullName || !phone || !password) {
      return res.status(400).json({ error: 'Full name, phone number, and password are required.' });
    }
    if (!phoneVerificationToken) {
      return res.status(400).json({ error: 'Complete phone verification before creating your account.' });
    }
    const normalizedEmail = loginEmail ? loginEmail.toLowerCase() : '';
    const normalizedPhone = String(phone).replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ error: 'gender must be male, female, or other' });
    }

    try {
      const proof = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
      if (proof.type !== 'registration-phone' || proof.phone !== normalizedPhone) {
        throw new Error('Phone verification does not match');
      }
    } catch {
      return res.status(400).json({ error: 'Phone verification expired or is invalid. Verify your number again.' });
    }

    if (normalizedEmail) {
      const existing = await Client.findOne({ loginEmail: normalizedEmail });
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
      }
    }
    const existingPhone = await Client.findOne({ phone: normalizedPhone }).select('_id');
    if (existingPhone) {
      return res.status(409).json({ error: 'An account with this phone number already exists. Try logging in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await Client.create({
      clientId: nanoid(10),
      ...(normalizedEmail ? { loginEmail: normalizedEmail } : {}),
      passwordHash,
      fullName,
      ...(designation ? { designation } : {}),
      phone: normalizedPhone,
      gender: gender || null,
      dateOfBirth: dateOfBirth || null,
      mustChangePassword: false, // they chose this password themselves, no forced change needed
    });

    // Best-effort -- claims any appointment requests sent to this phone
    // number before this account existed (see routes/appointments.js).
    // Never blocks/fails registration if this has a problem.
    claimAppointmentRequests(client).catch((err) => console.error('[claimAppointmentRequests]', err));

    const token = signToken(client);
    res.status(201).json({
      token,
      clientId: client.clientId,
      mustChangePassword: false,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}`,
    });
  } catch (err) {
    console.error('[auth/register POST]', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
// Accepts EITHER the login email or the phone number as the identifier --
// same shared password either way.
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const identifier = str(req.body.identifier);
    const password = str(req.body.password);
    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier and password are required' });
    }

    const client = await Client.findOne({
      $or: [{ loginEmail: identifier.toLowerCase() }, { phone: identifier }],
    });
    // Same generic error whether the identifier doesn't exist or the
    // password is wrong -- don't reveal which one it was, that helps
    // attackers enumerate valid accounts.
    if (!client) {
      return res.status(401).json({ error: 'Invalid email/phone or password' });
    }

    const ok = await bcrypt.compare(password, client.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email/phone or password' });
    }

    if (client.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
    }

    const token = signToken(client);
    res.json({
      token,
      clientId: client.clientId,
      mustChangePassword: client.mustChangePassword,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}`,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/login-otp/request
// Passwordless login via phone OTP -- phone only, no email equivalent.
// Separate from the forgot-password reset-token fields so a login-OTP
// request and a password reset in flight at the same time can't clobber
// each other. This endpoint intentionally tells the UI when a number is not
// registered, so the user can be directed to registration first.
router.post('/login-otp/request', otpLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
    }

    const client = await Client.findOne({ phone });
    if (!client) {
      return res.status(404).json({ error: 'This phone number is not registered. Please register first.' });
    }
    if (client.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
    }
    // A too-soon resend (button double-tap, multiple tabs, a direct API
    // hit before the cooldown elapses) silently no-ops instead of erroring
    // -- an explicit "please wait" response here would leak whether this
    // phone number has an account, the same enumeration risk the generic
    // response below already guards against.
    const withinCooldown =
      client?.loginOtpLastSentAt && Date.now() - client.loginOtpLastSentAt.getTime() < LOGIN_OTP_RESEND_COOLDOWN_MS;
    if (!withinCooldown) {
      const otp = crypto.randomInt(100000, 1000000).toString();
      client.loginOtpHash = await bcrypt.hash(otp, 10);
      client.loginOtpExpiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);
      client.loginOtpAttempts = 0;
      client.loginOtpLastSentAt = new Date();
      await client.save();
      // This exact wording (including the en dash and no other text) is
      // the DLT-registered template on the ChennaiSMS account -- India's
      // TRAI regulations reject anything that doesn't match a pre-approved
      // template byte-for-byte, confirmed against this exact string.
      await sendSms(phone, `Your OTP for login/verification is ${otp}. Please do not share this with anyone. – HUNTSWORLD`);
    }

    res.json({ ok: true, message: 'A login code has been sent to your phone.' });
  } catch (err) {
    console.error('[auth/login-otp/request]', err);
    res.status(500).json({ error: 'Failed to send login code' });
  }
});

// POST /api/auth/login-otp/verify
// Same response shape as POST /login, so the frontend's existing session
// handling works unchanged regardless of which method logged the client in.
router.post('/login-otp/verify', otpLimiter, async (req, res) => {
  try {
    const phone = str(req.body.phone);
    const otp = str(req.body.otp);
    if (!phone || !otp) {
      return res.status(400).json({ error: 'phone and otp are required' });
    }

    const client = await Client.findOne({ phone });
    if (!client || !client.loginOtpHash || !client.loginOtpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
    }
    if (client.loginOtpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (client.loginOtpAttempts >= LOGIN_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const ok = await bcrypt.compare(otp, client.loginOtpHash);
    if (!ok) {
      client.loginOtpAttempts += 1;
      await client.save();
      return res.status(401).json({ error: 'Incorrect code' });
    }

    if (client.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
    }

    client.loginOtpHash = null;
    client.loginOtpExpiresAt = null;
    client.loginOtpAttempts = 0;
    await client.save();

    const token = signToken(client);
    res.json({
      token,
      clientId: client.clientId,
      mustChangePassword: client.mustChangePassword,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}`,
    });
  } catch (err) {
    console.error('[auth/login-otp/verify]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/change-password
// Client must supply their current password (the admin-issued temp one,
// or whatever they last set) to prove they're not a hijacked session --
// same principle as any "change password" flow.
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const client = await Client.findOne({ clientId: req.user.clientId });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const ok = await bcrypt.compare(currentPassword, client.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    client.passwordHash = await bcrypt.hash(newPassword, 12);
    client.mustChangePassword = false;
    await client.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/change-password]', err);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// POST /api/auth/forgot-password
// Looks up the client by login email and emails a 6-digit OTP (see
// utils/email.js). Always returns the same generic message whether or not
// the email matched an account, same "don't reveal which part was wrong"
// principle /login already follows -- otherwise this endpoint could be used
// to enumerate registered accounts. A too-soon resend (see loginOtpLastSentAt
// above for the same pattern on the phone-login flow) silently no-ops
// instead of erroring, for the same enumeration-safety reason.
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const loginEmail = str(req.body.loginEmail);
    if (!loginEmail) return res.status(400).json({ error: 'loginEmail is required' });

    const client = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    const withinCooldown =
      client?.resetOtpLastSentAt && Date.now() - client.resetOtpLastSentAt.getTime() < RESET_OTP_RESEND_COOLDOWN_MS;
    if (client && !withinCooldown) {
      const otp = crypto.randomInt(100000, 1000000).toString();
      client.resetOtpHash = await bcrypt.hash(otp, 10);
      client.resetOtpExpiresAt = new Date(Date.now() + RESET_OTP_TTL_MS);
      client.resetOtpAttempts = 0;
      client.resetOtpLastSentAt = new Date();
      await client.save();
      await sendEmail(
        client.loginEmail,
        'Your HuntsTAG password reset code',
        passwordResetEmail(otp)
      );
    }

    res.json({ ok: true, message: 'If an account exists for this email, a reset code has been sent.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

// POST /api/auth/forgot-password/verify-otp
// Checks the emailed code and, on success, mints a resetToken -- the same
// kind of token /reset-password already expects, so that route (and its
// "not guessable, no attempt-limiting needed" reasoning below) is completely
// unchanged by this OTP step being added in front of it. Clears the OTP
// fields immediately on success so the code can't be reused.
router.post('/forgot-password/verify-otp', otpLimiter, async (req, res) => {
  try {
    const loginEmail = str(req.body.loginEmail);
    const otp = str(req.body.otp);
    if (!loginEmail || !otp) {
      return res.status(400).json({ error: 'loginEmail and otp are required' });
    }

    const client = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    if (!client || !client.resetOtpHash || !client.resetOtpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
    }
    if (client.resetOtpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (client.resetOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const ok = await bcrypt.compare(otp, client.resetOtpHash);
    if (!ok) {
      client.resetOtpAttempts += 1;
      await client.save();
      return res.status(401).json({ error: 'Incorrect code' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    client.resetTokenHash = hashResetToken(rawToken);
    client.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    client.resetOtpHash = null;
    client.resetOtpExpiresAt = null;
    client.resetOtpAttempts = 0;
    await client.save();

    res.json({ ok: true, token: rawToken });
  } catch (err) {
    console.error('[auth/forgot-password/verify-otp]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/reset-password
// Verifies the token minted by /forgot-password/verify-otp above and sets a
// new password. No attempt-limiting needed here (unlike the 6-digit OTP)
// since a 256-bit token isn't guessable -- the otpLimiter rate limit still
// applies for general abuse protection.
router.post('/reset-password', otpLimiter, async (req, res) => {
  try {
    const token = str(req.body.token);
    const newPassword = str(req.body.newPassword);
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const resetTokenHash = hashResetToken(token);
    const client = await Client.findOne({ resetTokenHash });
    if (!client || !client.resetTokenExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired link. Request a new one.' });
    }
    if (client.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Link expired. Request a new one.' });
    }

    client.passwordHash = await bcrypt.hash(newPassword, 12);
    client.mustChangePassword = false; // they chose this password themselves
    client.resetTokenHash = null;
    client.resetTokenExpiresAt = null;
    await client.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// POST /api/auth/refresh { token }
// Swaps a client token that expired recently for a fresh one, so a session doesn't end at the
// 1-hour mark. The signature must still be valid; only the expiry is waived, and only up to
// TOKEN_REFRESH_GRACE_DAYS after it. Blocked accounts and deleted accounts are refused.
const REFRESH_GRACE_SECONDS = Number(process.env.TOKEN_REFRESH_GRACE_DAYS || 30) * 24 * 60 * 60;
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const old = str(req.body.token) || (req.headers.authorization || '').replace(/^Bearer /, '');
    let payload;
    try {
      payload = jwt.verify(old, process.env.JWT_SECRET, { ignoreExpiration: true });
    } catch {
      return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
    if (payload.type !== 'client' || payload.impersonatedBy || !payload.exp || Date.now() / 1000 > payload.exp + REFRESH_GRACE_SECONDS) {
      return res.status(401).json({ error: 'Session is too old. Please log in again.', code: 'TOKEN_INVALID' });
    }
    const client = await Client.findOne({ clientId: payload.clientId });
    if (!client) return res.status(401).json({ error: 'Account not found', code: 'TOKEN_INVALID' });
    if (client.blocked) return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
    res.json({ token: signToken(client), clientId: client.clientId });
  } catch (err) {
    console.error('[auth/refresh]', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

module.exports = router;
