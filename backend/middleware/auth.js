const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const Admin = require('../models/Admin');

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Verifies the JWT and attaches the decoded payload (which includes the
// owner's clientId) to req.user. Every protected client route relies on
// this -- req.user.clientId is the ONLY source of truth for "who is
// logged in", never a clientId taken from the URL or request body.
//
// Also checks payload.type === 'client' -- this is the separate-scope
// requirement from the original report ("JWT -- separate scopes for
// client, admin, public read"). An admin token will not pass this check,
// and vice versa, even though both are signed with the same JWT_SECRET.
//
// Also re-checks blocked status against the DB on every request, not
// just at login -- so blocking someone takes effect immediately, even if
// they already have a valid, unexpired token in hand.
async function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'client') {
      return res.status(403).json({ error: 'This endpoint requires a client login' });
    }

    const client = await Client.findOne({ clientId: payload.clientId }).select('blocked');
    if (client?.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
    }

    req.user = payload; // { type: 'client', clientId, loginEmail, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Shared by requireAdmin/requireEncodeAccess below -- verifies the JWT,
// then re-fetches the admin's CURRENT role from the DB rather than
// trusting the token's baked-in claim, so a promotion/demotion/removal
// (see Admin.js's role comment -- Admin Prime is a singleton that alone
// manages the roster) takes effect on the very next request instead of
// waiting out the token's remaining lifetime. Same principle requireAuth
// above already applies to a client's blocked status.
async function loadAdmin(req) {
  const token = getToken(req);
  if (!token) return { error: 401, message: 'Missing or malformed Authorization header' };

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { error: 401, message: 'Invalid or expired token' };
  }
  if (payload.type !== 'admin') return { error: 403, message: 'This endpoint requires an admin login' };

  const admin = await Admin.findById(payload.adminId).select('role');
  if (!admin) return { error: 401, message: 'This admin account no longer exists' };

  return { admin: { ...payload, role: admin.role } }; // live role, not the token's stale claim
}

// Admin routes in general -- 'employee' accounts are scoped to ONLY the
// encode tool (see requireEncodeAccess below) and are rejected here, so
// every other admin route is automatically off-limits to them with no
// further per-route change needed.
async function requireAdmin(req, res, next) {
  const result = await loadAdmin(req);
  if (result.error) return res.status(result.error).json({ error: result.message });
  if (result.admin.role === 'employee') {
    return res.status(403).json({ error: 'Employee accounts can only use the Encode Tool, not this dashboard.' });
  }
  req.admin = result.admin;
  next();
}

// Same as requireAdmin, but also allows 'employee' through -- used only
// by the specific routes the encode tool itself calls (see the "Per-card
// records" section of routes/admin.js).
async function requireEncodeAccess(req, res, next) {
  const result = await loadAdmin(req);
  if (result.error) return res.status(result.error).json({ error: result.message });
  req.admin = result.admin;
  next();
}

// Same as requireAdmin, but also rejects role === 'subadmin'. Only used
// for the fulfillment pipeline's claim/assign/dispatch actions -- every
// other admin route (clients, plans, encode tool login) stays full-parity
// for both roles, per the deliberate scoping decision made when this was
// built.
function requireSeniorAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin?.role === 'subadmin') {
      return res.status(403).json({ error: 'This action requires a full admin account, not subadmin.' });
    }
    next();
  });
}

// Only the single Admin Prime account -- see models/Admin.js's role
// comment for the full list of what this singleton alone controls
// (roster management, revenue visibility, blank-card inventory, the
// encode-tool installer upload).
function requireAdminPrime(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin?.role !== 'primeadmin') {
      return res.status(403).json({ error: 'This action requires the Admin Prime account.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, requireSeniorAdmin, requireEncodeAccess, requireAdminPrime };
