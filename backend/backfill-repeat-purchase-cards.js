// One-off migration: retroactively creates the Card(s) that a repeat
// "upgrade" purchase SHOULD have created if this feature had existed at the
// time. backfill-fulfillment-cards.js only brings Card #1 up to date with a
// client's CURRENT state -- it has no way to know a client bought a second
// (or third...) card in the past, since nothing recorded that as a
// separate trackable unit before this fix. This script reconstructs it
// from the permanent CardRequest audit trail instead.
//
// Deliberately scoped to type: 'upgrade' only (clientId on that request IS
// the card owner). 'new_card' requests are attributed to the *purchaser*
// for audit, not the recipient -- their actual owner isn't reliably
// parseable from the free-text note, so those are left alone here.
// A 'new_card' purchase already creates a fresh Client (and, going
// forward, fresh Cards) with correct defaults, so it wasn't exposed to
// this specific bug unless that recipient LATER made a repeat upgrade
// purchase themselves, which this script does cover.
//
// Safe to re-run: walks each client's paid upgrade requests in
// chronological order, flattens every one into individual card "units"
// (respecting each request's own variantBreakdown/quantity), and only
// creates whatever units aren't already covered by Cards that exist today
// -- never removes or reassigns an existing Card. Usage:
//   node backfill-repeat-purchase-cards.js
require('dotenv').config();
const mongoose = require('mongoose');
const CardRequest = require('./models/CardRequest');
const Card = require('./models/Card');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const requests = await CardRequest.find({ type: 'upgrade', paymentStatus: 'paid' }).sort({ createdAt: 1 });
  const byClient = {};
  for (const r of requests) (byClient[r.clientId] ||= []).push(r);

  let clientsTouched = 0;
  let cardsCreated = 0;

  for (const [clientId, reqs] of Object.entries(byClient)) {
    const existingCount = await Card.countDocuments({ clientId });

    const allUnits = [];
    for (const r of reqs) {
      const breakdown = r.variantBreakdown || [];
      if (breakdown.length > 0) {
        for (const entry of breakdown) {
          for (let i = 0; i < entry.quantity; i++) {
            allUnits.push({ variantId: entry.variantId, cardType: r.requestedPlan });
          }
        }
      } else {
        for (let i = 0; i < (r.quantity || 1); i++) {
          allUnits.push({ variantId: null, cardType: r.requestedPlan });
        }
      }
    }

    // Units already accounted for by whatever Cards exist today (Card #1
    // from backfill-fulfillment-cards.js, plus anything already created by
    // this feature going forward) -- only the shortfall needs creating.
    const missingUnits = allUnits.slice(existingCount);
    if (missingUnits.length === 0) continue;

    const last = await Card.findOne({ clientId }).sort({ cardNumber: -1 }).select('cardNumber');
    let nextNumber = (last?.cardNumber || 0) + 1;
    const docs = missingUnits.map((u) => ({
      clientId,
      cardNumber: nextNumber++,
      cardType: u.cardType,
      cardVariantId: u.variantId,
    }));
    await Card.insertMany(docs);
    clientsTouched++;
    cardsCreated += docs.length;
  }

  console.log(`Reconciliation complete. Created ${cardsCreated} card(s) across ${clientsTouched} client(s) (of ${Object.keys(byClient).length} clients with paid upgrade purchases).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
