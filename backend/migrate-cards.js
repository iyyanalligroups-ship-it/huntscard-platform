// One-off migration: backfills a `Card` #1 record for every existing
// client that already has a physical card under the old single-card
// model (Client.chipEncoded/chipPasswordHash/encodedAt/encodedBy/
// cardActive). Safe to re-run -- skips any client that already has a
// Card #1. Usage:  node migrate-cards.js
//
// The original raw chip password can't be recovered (it was only ever
// one-way hashed under the old model, see encode-tool/lib.js's
// hashPassword) -- migrated cards are created with passwordEncrypted:
// null, and the admin UI shows "password unknown (encoded before this
// feature)" for those.
require('dotenv').config();
const mongoose = require('mongoose');
const Client = require('./models/Client');
const Card = require('./models/Card');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const clients = await Client.find({ chipEncoded: true }).select(
    'clientId cardType cardVariantId cardActive encodedAt encodedBy'
  );

  let created = 0;
  let skipped = 0;
  for (const client of clients) {
    const existing = await Card.findOne({ clientId: client.clientId, cardNumber: 1 });
    if (existing) {
      skipped++;
      continue;
    }
    await Card.create({
      clientId: client.clientId,
      cardNumber: 1,
      cardType: client.cardType || null,
      cardVariantId: client.cardVariantId || null,
      active: client.cardActive !== false,
      encoded: true,
      encodedAt: client.encodedAt || null,
      encodedBy: client.encodedBy || null,
      passwordEncrypted: null, // not recoverable -- see header comment
    });
    created++;
  }

  console.log(`Migration complete. Created ${created} Card record(s), skipped ${skipped} already-migrated client(s).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
