const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

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

// Same idea, for admin-only routes -- most importantly, the "mark client
// as paid" endpoint and (indirectly, via the encode tool's login gate)
// the ability to write to a physical NFC card at all.
function requireAdmin(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'admin') {
      return res.status(403).json({ error: 'This endpoint requires an admin login' });
    }
    req.admin = payload; // { type: 'admin', adminId, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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

module.exports = { requireAuth, requireAdmin, requireSeniorAdmin };
