const crypto = require('crypto');

// Server-to-server client for huntsworld's HuntsTAG-coupon bridge (see
// huntsworld/server/routes/huntstagCouponRoute.js and
// middleware/serviceAuthMiddleware.js). Never called from the browser --
// HUNTSTAG_COUPON_SERVICE_SECRET must never reach client-app JS. Every
// request is HMAC-signed over `${timestamp}.${rawBodyString}`, matching
// exactly what that middleware verifies.
function signedHeaders(bodyString) {
  const secret = process.env.HUNTSTAG_COUPON_SERVICE_SECRET;
  if (!secret) throw new Error('HUNTSTAG_COUPON_SERVICE_SECRET is not configured');
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${bodyString}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Service-Timestamp': timestamp,
    'X-Service-Signature': signature,
  };
}

async function callHuntsworld(path, body) {
  const base = (process.env.HUNTSWORLD_SERVER_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('HUNTSWORLD_SERVER_URL is not configured');
  const bodyString = JSON.stringify(body);
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: signedHeaders(bodyString),
    body: bodyString,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Read-only check -- does not consume the coupon.
async function peekHuntstagCoupon(code, phone) {
  const { data } = await callHuntsworld('/api/v1/huntstag-coupons/service/peek', { code, phone });
  return data; // { valid, huntstagPlanKey, huntstagPlanLabel } or { valid: false, reason }
}

// Atomically consumes the coupon on huntsworld's side.
async function redeemHuntstagCoupon(code, phone, redeemedClientId) {
  const { data } = await callHuntsworld('/api/v1/huntstag-coupons/service/redeem', { code, phone, redeemedClientId });
  return data; // { valid, huntstagPlanKey } or { valid: false, reason }
}

module.exports = { peekHuntstagCoupon, redeemHuntstagCoupon };
