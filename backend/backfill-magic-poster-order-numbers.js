// One-off backfill: Magic Poster orders now get a human-readable
// orderNumber (MOxxxxxxxxxx) at creation time, for order lookup before an
// order ships (trackingId doesn't exist until then), plus a snapshotted
// subtotal/deliveryFee/gstPercent/gstAmount pricing breakdown -- all newly
// `required` fields the schema didn't have before. Existing docs predate
// both, so this assigns every doc missing them a fresh orderNumber and a
// best-effort pricing breakdown: subtotal = amount, deliveryFee = 0,
// gstPercent = 0, gstAmount = 0 (this app never charged delivery/GST
// before this feature, so a pre-existing order's whole `amount` was
// effectively subtotal-only -- there's no way to know what, if anything,
// was bundled into it otherwise).
// Safe to re-run: only touches docs where orderNumber is unset. Run this
// AFTER migrate-magic-poster-status.js.
//   node backfill-magic-poster-order-numbers.js
require('dotenv').config();
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const MagicPosterOrder = require('./models/MagicPosterOrder');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const missing = await MagicPosterOrder.find({ orderNumber: { $exists: false } });
  let count = 0;
  for (const doc of missing) {
    doc.orderNumber = `MO${nanoid(10).toUpperCase()}`;
    if (doc.subtotal === undefined || doc.subtotal === null) doc.subtotal = doc.amount;
    if (doc.deliveryFee === undefined || doc.deliveryFee === null) doc.deliveryFee = 0;
    if (doc.gstPercent === undefined || doc.gstPercent === null) doc.gstPercent = 0;
    if (doc.gstAmount === undefined || doc.gstAmount === null) doc.gstAmount = 0;
    await doc.save();
    count++;
  }

  console.log(`Assigned orderNumber + backfilled pricing on ${count} order(s).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
