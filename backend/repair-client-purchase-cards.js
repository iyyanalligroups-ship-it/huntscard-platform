// Recreate physical Card rows that are missing for one client's paid
// upgrade orders. Safe by default: this only reports the proposed repair.
// Pass --apply to write it after reviewing the output.
//
//   node repair-client-purchase-cards.js charles.bmtechx@gmail.com
//   node repair-client-purchase-cards.js charles.bmtechx@gmail.com --apply
require('dotenv').config();
const mongoose = require('mongoose');
const Client = require('./models/Client');
const Card = require('./models/Card');
const CardRequest = require('./models/CardRequest');
const createCardsForPurchase = require('./utils/createCardsForPurchase');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');
  if (!email || email.startsWith('--')) {
    throw new Error('Usage: node repair-client-purchase-cards.js <login-email> [--apply]');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(process.env.MONGODB_URI);
  const client = await Client.findOne({ loginEmail: email }).select('clientId loginEmail');
  if (!client) throw new Error(`Client not found: ${email}`);

  const requests = await CardRequest.find({
    clientId: client.clientId,
    type: 'upgrade',
    paymentStatus: 'paid',
    status: { $in: ['approved', 'fulfilled'] },
  }).sort({ createdAt: 1 });

  const missing = [];
  for (const request of requests) {
    const linkedCount = await Card.countDocuments({
      clientId: client.clientId,
      $or: [
        { purchaseRequestId: request._id },
        ...(request.orderNumber ? [{ orderNumber: request.orderNumber }] : []),
      ],
    });
    const expectedCount = request.variantBreakdown?.length
      ? request.variantBreakdown.reduce((sum, item) => sum + item.quantity, 0)
      : request.quantity || 1;
    if (linkedCount < expectedCount) {
      missing.push({ request, quantity: expectedCount - linkedCount });
    }
  }

  console.log(`Client: ${client.loginEmail} (${client.clientId})`);
  if (missing.length === 0) {
    console.log('No missing purchase-linked cards found.');
    return;
  }

  for (const item of missing) {
    console.log(
      `${apply ? 'Restoring' : 'Would restore'} ${item.quantity} card(s): ` +
        `${item.request.requestedPlan} / ${item.request.orderNumber || item.request._id}`
    );
    if (!apply) continue;

    // Rebuild only the missing tail. Requests created before per-card
    // linkage may have no surviving Card rows at all, which is the deleted
    // history this utility is intended to recover.
    const variants = [];
    for (const entry of item.request.variantBreakdown || []) {
      for (let i = 0; i < entry.quantity; i += 1) variants.push(entry.variantId);
    }
    const missingVariants = variants.slice(-item.quantity);
    await createCardsForPurchase({
      clientId: client.clientId,
      cardType: item.request.requestedPlan,
      quantity: item.quantity,
      variantBreakdown: missingVariants.length
        ? missingVariants.map((variantId) => ({ variantId, quantity: 1 }))
        : [],
      purchaseRequestId: item.request._id,
      orderNumber: item.request.orderNumber,
    });
  }

  console.log(apply ? 'Repair complete.' : 'Dry run only. Re-run with --apply to write these cards.');
}

main()
  .catch((err) => {
    console.error(`Repair failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
