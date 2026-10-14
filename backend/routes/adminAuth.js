const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/auth');
const Admin = require('../models/Admin');
const { str, limiter } = require('../utils/upload');

// Generous on purpose (admins retype passwords on the encode tool), but not unlimited.
const adminLoginLimiter = limiter(60, 15, 'Too many login attempts. Try again in 15 minutes.');

const router = express.Router();

// Deliberately NO POST /register here. Admin accounts are created with
// seed-admin.js, run directly on the server / by whoever holds DB access
// -- not exposed as a public API endpoint.

// No brute-force rate limiting on this route -- removed at the user's
// request so admins/employees can retry as many times as needed (e.g.
// re-typing a password on the encode tool) without getting locked out.
// This route is shared by both the web admin dashboard and the encode
// tool, so the change applies to both.
// POST /api/admin/auth/login
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const email = str(req.body.email);
    const password = str(req.body.password);
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { type: 'admin', adminId: admin._id.toString(), email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '2h' }
    );

    res.json({
      token,
      adminId: admin._id.toString(),
      name: admin.name,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
    });
  } catch (err) {
    console.error('[admin/auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/auth/refresh { token } -- same idea as the client refresh in routes/auth.js:
// an admin token that expired within the grace period is swapped for a fresh one. The admin
// must still exist; role is read from the DB, not the old token.
const REFRESH_GRACE_SECONDS = Number(process.env.TOKEN_REFRESH_GRACE_DAYS || 30) * 24 * 60 * 60;
router.post('/refresh', limiter(60, 15), async (req, res) => {
  try {
    const old = str(req.body.token) || (req.headers.authorization || '').replace(/^Bearer /, '');
    let payload;
    try {
      payload = jwt.verify(old, process.env.JWT_SECRET, { ignoreExpiration: true });
    } catch {
      return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
    if (payload.type !== 'admin' || !payload.exp || Date.now() / 1000 > payload.exp + REFRESH_GRACE_SECONDS) {
      return res.status(401).json({ error: 'Session is too old. Please log in again.', code: 'TOKEN_INVALID' });
    }
    const admin = await Admin.findById(payload.adminId);
    if (!admin) return res.status(401).json({ error: 'This admin account no longer exists', code: 'TOKEN_INVALID' });
    const token = jwt.sign(
      { type: 'admin', adminId: admin._id.toString(), email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '2h' }
    );
    res.json({ token, role: admin.role });
  } catch (err) {
    console.error('[admin/auth/refresh]', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// POST /api/admin/auth/change-password
// Same pattern as the client-side version: requires the current password
// to prove the session isn't hijacked, clears mustChangePassword on
// success. Used both for team-invited admins on first login and for any
// admin who just wants to rotate their password.
router.post('/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 10) {
      return res.status(400).json({ error: 'New password must be at least 10 characters' });
    }

    const admin = await Admin.findById(req.admin.adminId);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.mustChangePassword = false;
    await admin.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/auth/change-password]', err);
    res.status(500).json({ error: 'Password change failed' });
  }
});

module.exports = router;
