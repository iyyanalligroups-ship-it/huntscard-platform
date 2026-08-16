// One-off migration: makes sure every paid client has a Card #1 that fully
// reflects their current Client-level fulfillment state (dispatch/delivery/
// tracking/claim/assign, not just the encoded flag migrate-cards.js already
// handled). Needed before GET /api/admin/fulfillment starts reading from
// Card instead of Client -- otherwise any paid-but-not-yet-encoded client
// (still sitting in "Needs attention") has zero Card records and would
// simply vanish from the page.
//
// Safe to re-run: creates Card #1 if missing, or fills in whatever
// fulfillment fields are still missing on an existing one (e.g. a client
// migrate-cards.js already gave a bare Card #1 to, before this feature's
// fields existed on Card at all). Never overwrites a field that's already
// been independently set on the Card itself. Usage: node
// backfill-fulfillment-cards.js
require('dotenv').config();
const mongoose = require('mongoose');
const Client = require('./models/Client');
const Card = require('./models/Card');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const clients = await Client.find({ paid: true }).select(
    'clientId cardType cardVariantId cardActive chipEncoded encodedAt encodedBy ' +
    'claimedBy assignedTo dispatched dispatchedAt dispatchedBy trackingId delivered deliveredAt'
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const client of clients) {
    const fulfillmentFields = {
      claimedBy: client.claimedBy || null,
      assignedTo: client.assignedTo || null,
      dispatched: client.dispatched === true,
      dispatchedAt: client.dispatchedAt || null,
      dispatchedBy: client.dispatchedBy || null,
      trackingId: client.trackingId || null,
      delivered: client.delivered === true,
      deliveredAt: client.deliveredAt || null,
    };

    const existing = await Card.findOne({ clientId: client.clientId, cardNumber: 1 });
    if (!existing) {
      await Card.create({
        clientId: client.clientId,
        cardNumber: 1,
        cardType: client.cardType || null,
        cardVariantId: client.cardVariantId || null,
        active: client.cardActive !== false,
        encoded: client.chipEncoded === true,
        encodedAt: client.encodedAt || null,
        encodedBy: client.encodedBy || null,
        passwordEncrypted: null, // not recoverable for pre-existing cards, see migrate-cards.js's header comment
        ...fulfillmentFields,
      });
      created++;
      continue;
    }

    // Only fill in fields the fulfillment feature added that this Card
    // doesn't have a real value for yet -- never clobber anything already
    // set independently (e.g. by an admin action taken on the Card itself
    // since it was created).
    const missing = {};
    for (const [field, value] of Object.entries(fulfillmentFields)) {
      const current = existing[field];
      const isUnset = current === null || current === undefined || current === false;
      if (isUnset && value !== false && value !== null) missing[field] = value;
    }
    if (Object.keys(missing).length > 0) {
      await Card.updateOne({ _id: existing._id }, { $set: missing });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Backfill complete. Created ${created}, updated ${updated}, already up to date ${skipped} (of ${clients.length} paid clients).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
