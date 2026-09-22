// One-off migration: the Magic Poster order pipeline grew a 4th stage
// (Ordered -> Shipping -> Delivery -> Completed, was Pending -> Delivery
// -> Completed). Existing docs still carry the old 'pending' value, which
// no longer exists in the schema enum -- this renames every 'pending' doc
// to the new first-stage value 'ordered'. 'delivery' and 'completed' docs
// are untouched (those values are unchanged by the new pipeline).
// Safe to re-run: updateMany on status:'pending' is a no-op once none
// remain. Run this BEFORE backfill-magic-poster-order-numbers.js.
//   node migrate-magic-poster-status.js
require('dotenv').config();
const mongoose = require('mongoose');
const MagicPosterOrder = require('./models/MagicPosterOrder');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await MagicPosterOrder.updateMany({ status: 'pending' }, { $set: { status: 'ordered' } });
  console.log(`Migrated ${result.modifiedCount} order(s) from 'pending' to 'ordered'.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
