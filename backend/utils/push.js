const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Lazily configured, same reasoning as email.js's getTransporter() -- a
// missing WEB_PUSH_* env var during local dev shouldn't crash the whole
// server on boot.
let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT_EMAIL || 'mailto:info@huntsworld.com',
    process.env.WEB_PUSH_PUBLIC_KEY,
    process.env.WEB_PUSH_PRIVATE_KEY
  );
  configured = true;
  return true;
}

// Sends `payload` (plain object, JSON-stringified here) to every device
// this client has granted push permission on. Best-effort -- a push
// failure must never throw back into whatever triggered it (see this
// function's call site in routes/public.js, fire-and-forget same as
// sendEmail/sendSms already are elsewhere). A 404/410 from the push
// service means that subscription is dead (browser unsubscribed, or the
// device hasn't been seen in a long time) -- clean it up instead of
// retrying it forever.
async function sendPushToClient(clientId, payload) {
  if (!ensureConfigured()) {
    console.log(`[PUSH STUB -- WEB_PUSH_PUBLIC_KEY/PRIVATE_KEY not set] to ${clientId}:`, payload);
    return;
  }
  const subs = await PushSubscription.find({ clientId });
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error(`[PUSH] failed to send to ${clientId}:`, err.message);
        }
      }
    })
  );
}

module.exports = { sendPushToClient };
