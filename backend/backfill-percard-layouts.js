// One-off migration: sets cardNumber: 1 on every existing per-client
// ArLayout and MagicBusinessCard doc that predates the per-physical-card
// feature. Must run BEFORE the cardNumber-filtered routes go live --
// otherwise every existing client's saved AR Layout/Magic Business Card
// customization would silently stop matching (queries now filter by
// {clientId, cardNumber}) and fall back to the admin default, which looks
// exactly like "my customization disappeared" from the client's side.
//
// Card #1 is the correct target: it's the same card every other
// single-card-era feature already treats as "the" card (see
// backfill-fulfillment-cards.js, migrate-cards.js, and admin.js's
// mirrorCardOneToClient). Safe to re-run -- only touches docs that still
// have cardNumber unset.
// Usage: node backfill-percard-layouts.js
require('dotenv').config();
const mongoose = require('mongoose');
const ArLayout = require('./models/ArLayout');
const MagicBusinessCard = require('./models/MagicBusinessCard');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // ArLayout's cardNumber-less docs are exactly its per-client docs (the
  // global default has clientId unset too, so this filter can't touch it).
  const arResult = await ArLayout.updateMany(
    { clientId: { $ne: null }, cardNumber: null },
    { $set: { cardNumber: 1 } }
  );

  const magicResult = await MagicBusinessCard.updateMany(
    { cardNumber: null },
    { $set: { cardNumber: 1 } }
  );

  console.log(`ArLayout: ${arResult.modifiedCount} doc(s) backfilled to cardNumber 1.`);
  console.log(`MagicBusinessCard: ${magicResult.modifiedCount} doc(s) backfilled to cardNumber 1.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
