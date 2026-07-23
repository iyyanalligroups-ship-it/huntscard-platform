const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { nanoid } = require('nanoid');
const { requireAuth } = require('../middleware/auth');
const Client = require('../models/Client');

const router = express.Router();

// Lock out brute-force login attempts. This matters more than usual here
// because a client's public tap URL (and therefore their clientId) is, by
// design, visible to anyone who receives their card -- so an attacker can
// find a real account to target more easily than in a typical app.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
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

function signToken(client) {
  return jwt.sign(
    { type: 'client', clientId: client.clientId, loginEmail: client.loginEmail },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

// POST /api/auth/register
// Self-service account creation -- replaces the old admin-only client
// creation flow. Free: no card, no payment, cardType/paid stay at their
// defaults (null/false). Getting an actual card happens afterward from
// inside the dashboard (Upgrade Card doubles as "get your first card"
// when cardType is still null -- same Razorpay-verified flow either way,
// see routes/profile.js upgrade-confirm).
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { fullName, phone, loginEmail, password } = req.body;
    if (!fullName || !loginEmail || !password) {
      return res.status(400).json({ error: 'fullName, loginEmail, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await Client.create({
      clientId: nanoid(10),
      loginEmail: loginEmail.toLowerCase(),
      passwordHash,
      fullName,
      phone: phone || '',
      mustChangePassword: false, // they chose this password themselves, no forced change needed
    });

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
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { loginEmail, password } = req.body;
    if (!loginEmail || !password) {
      return res.status(400).json({ error: 'loginEmail and password are required' });
    }

    const client = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    // Same generic error whether the email doesn't exist or the password is
    // wrong -- don't reveal which one it was, that helps attackers enumerate
    // valid accounts.
    if (!client) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, client.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
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

module.exports = router;
