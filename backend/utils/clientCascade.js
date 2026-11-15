const fs = require('fs');
const path = require('path');

// Removes everything that belongs to a client. Deleting only the Client record used to leave their cards,
// orders, AR layouts, addresses, contacts, chats, tickets, notifications, push subscriptions and activity
// behind, and those rows then showed up as "(deleted client)" in Fulfillment and other screens.
//
// Set to true to keep paid card / Magic Poster orders (and so their GST invoices) as accounting records when
// a client is deleted. They are deleted with everything else by default.
const KEEP_PAID_ORDERS = false;

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// Deletes an uploaded file from /uploads, given its URL or path. Never touches anything outside the uploads
// folder, and silently ignores files that are already gone.
function unlinkUpload(url) {
  if (!url || typeof url !== 'string') return;
  const match = url.match(/\/uploads\/(.+?)(?:[?#].*)?$/);
  if (!match) return;
  const resolved = path.resolve(UPLOADS_ROOT, match[1]);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;
  fs.unlink(resolved, () => {});
}

// Collections keyed by clientId (or a similar field). Each entry: [Model, filter builder].
function targets(clientId) {
  const Card = require('../models/Card');
  const CardRequest = require('../models/CardRequest');
  const ClientAddress = require('../models/ClientAddress');
  const Contact = require('../models/Contact');
  const ArLayout = require('../models/ArLayout');
  const MagicBusinessCard = require('../models/MagicBusinessCard');
  const MagicPosterOrder = require('../models/MagicPosterOrder');
  const Notification = require('../models/Notification');
  const PushSubscription = require('../models/PushSubscription');
  const ChatMessage = require('../models/ChatMessage');
  const SupportTicket = require('../models/SupportTicket');
  const CardTicket = require('../models/CardTicket');
  const AppointmentRequest = require('../models/AppointmentRequest');
  const ActivitySession = require('../models/ActivitySession');

  const paidGuard = KEEP_PAID_ORDERS ? { paymentStatus: { $ne: 'paid' } } : {};
  return [
    ['cards', Card, { clientId }],
    ['card orders', CardRequest, { clientId, ...paidGuard }],
    ['poster orders', MagicPosterOrder, { clientId, ...paidGuard }],
    ['addresses', ClientAddress, { clientId }],
    ['contacts', Contact, { clientId }],
    ['AR layouts', ArLayout, { clientId }],
    ['magic cards', MagicBusinessCard, { clientId }],
    ['notifications', Notification, { clientId }],
    ['push subscriptions', PushSubscription, { clientId }],
    ['chat messages', ChatMessage, { clientId }],
    ['support tickets', SupportTicket, { clientId }],
    ['card tickets', CardTicket, { clientId }],
    ['appointment requests', AppointmentRequest, { $or: [{ fromClientId: clientId }, { toClientId: clientId }] }],
    ['activity sessions', ActivitySession, { user: clientId }],
  ];
}

// Uploaded files that belong to this client (profile images, AR media, custom card designs, contact photos,
// their own Magic Business Card media). Collected BEFORE the rows are deleted.
async function collectFileUrls(client) {
  const Contact = require('../models/Contact');
  const MagicBusinessCard = require('../models/MagicBusinessCard');
  const urls = [
    client.photoUrl,
    client.bannerUrl,
    client.logoUrl,
    client.arVideoUrl,
    client.arBannerUrl,
    client.arModelUrl,
    client.customDesignFrontUrl,
    client.customDesignBackUrl,
  ];
  const [contacts, magic] = await Promise.all([
    Contact.find({ clientId: client.clientId, photoUrl: { $nin: [null, ''] } }).select('photoUrl').lean(),
    MagicBusinessCard.find({ clientId: client.clientId }).select('imageUrl videoUrl modelUrl audioUrl').lean(),
  ]);
  contacts.forEach((c) => urls.push(c.photoUrl));
  magic.forEach((m) => urls.push(m.imageUrl, m.videoUrl, m.modelUrl, m.audioUrl));
  return urls.filter(Boolean);
}

// Deletes everything linked to `client` (a plain object or document with clientId and the file fields above).
// Returns how many rows were removed per collection. The Client record itself is NOT deleted here.
async function deleteClientData(client, { dryRun = false } = {}) {
  const clientId = client.clientId;
  if (!clientId) throw new Error('clientId is required');
  const report = {};
  const urls = await collectFileUrls(client);
  for (const [label, Model, filter] of targets(clientId)) {
    if (dryRun) {
      report[label] = await Model.countDocuments(filter);
    } else {
      const r = await Model.deleteMany(filter);
      report[label] = r.deletedCount || 0;
    }
  }
  report.files = urls.length;
  if (!dryRun) urls.forEach(unlinkUpload);
  return report;
}

module.exports = { deleteClientData, unlinkUpload, targets, KEEP_PAID_ORDERS };
