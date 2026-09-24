// One-off order-number migration shared by card purchases and Magic Poster
// orders. Format: HT + two-digit year in Asia/Kolkata + a per-year sequence,
// e.g. HT26001. Default mode is a read-only preview; pass --apply to write.
//
//   node migrate-order-numbers.js
//   node migrate-order-numbers.js --apply
//
// Safe to rerun: the same chronological data produces the same identifiers.
require('dotenv').config();
const mongoose = require('mongoose');
const CardRequest = require('./models/CardRequest');
const MagicPosterOrder = require('./models/MagicPosterOrder');
const OrderSequence = require('./models/OrderSequence');

const apply = process.argv.includes('--apply');

function orderDate(order) {
  if (order.createdAt) return new Date(order.createdAt);
  return order._id.getTimestamp();
}

function businessYear(date) {
  return new Intl.DateTimeFormat('en-GB', {
    year: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);

  // A manual unpaid request is not an order. An unpaid checkout that already
  // owns an orderNumber is included because it can still be paid later.
  const [cardRequests, posterOrders] = await Promise.all([
    CardRequest.find({
      $or: [
        { paymentStatus: 'paid' },
        { orderNumber: { $exists: true, $nin: [null, ''] } },
      ],
    }).select('_id orderNumber legacyOrderNumber createdAt').lean(),
    MagicPosterOrder.find({}).select('_id orderNumber legacyOrderNumber createdAt').lean(),
  ]);

  const orders = [
    ...cardRequests.map((order) => ({ ...order, collection: 'card' })),
    ...posterOrders.map((order) => ({ ...order, collection: 'poster' })),
  ].sort((a, b) => {
    const timeDelta = orderDate(a).getTime() - orderDate(b).getTime();
    if (timeDelta !== 0) return timeDelta;
    const idDelta = String(a._id).localeCompare(String(b._id));
    if (idDelta !== 0) return idDelta;
    return a.collection.localeCompare(b.collection);
  });

  const yearlyCounts = new Map();
  const plan = orders.map((order) => {
    const year = businessYear(orderDate(order));
    const sequence = (yearlyCounts.get(year) || 0) + 1;
    yearlyCounts.set(year, sequence);
    return {
      ...order,
      year,
      nextOrderNumber: `HT${year}${String(sequence).padStart(3, '0')}`,
    };
  });

  const changed = plan.filter((order) => order.orderNumber !== order.nextOrderNumber);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${orders.length} order(s), ${changed.length} number(s) to update.`);
  console.log(`Card orders: ${cardRequests.length}; Magic Poster orders: ${posterOrders.length}.`);
  for (const [year, count] of [...yearlyCounts.entries()].sort()) {
    console.log(`20${year}: HT${year}001 - HT${year}${String(count).padStart(3, '0')} (${count})`);
  }

  if (!apply || changed.length === 0) {
    if (!apply) console.log('No database changes made. Run with --apply to migrate.');
    return;
  }

  // Two phases prevent unique-index collisions while values swap. The old
  // value is retained once only, even if the migration is rerun later.
  const cardChanges = changed.filter((order) => order.collection === 'card');
  const posterChanges = changed.filter((order) => order.collection === 'poster');
  const temporaryOps = (entries, prefix) => entries.map((order) => ({
    updateOne: {
      filter: { _id: order._id },
      update: {
        $set: {
          orderNumber: `MIG-${prefix}-${order._id}`,
          ...(order.legacyOrderNumber || !order.orderNumber
            ? {}
            : { legacyOrderNumber: order.orderNumber }),
        },
      },
    },
  }));
  const finalOps = (entries) => entries.map((order) => ({
    updateOne: {
      filter: { _id: order._id },
      update: { $set: { orderNumber: order.nextOrderNumber } },
    },
  }));

  if (cardChanges.length) await CardRequest.bulkWrite(temporaryOps(cardChanges, 'CARD'), { ordered: true });
  if (posterChanges.length) await MagicPosterOrder.bulkWrite(temporaryOps(posterChanges, 'POSTER'), { ordered: true });
  if (cardChanges.length) await CardRequest.bulkWrite(finalOps(cardChanges), { ordered: true });
  if (posterChanges.length) await MagicPosterOrder.bulkWrite(finalOps(posterChanges), { ordered: true });

  for (const [year, count] of yearlyCounts.entries()) {
    await OrderSequence.updateOne(
      { _id: `orders-${year}` },
      { $set: { value: count } },
      { upsert: true }
    );
  }

  // Verify the complete selected dataset, not just the rows that changed.
  const [savedCards, savedPosters] = await Promise.all([
    CardRequest.find({ _id: { $in: cardRequests.map((order) => order._id) } }).select('_id orderNumber').lean(),
    MagicPosterOrder.find({ _id: { $in: posterOrders.map((order) => order._id) } }).select('_id orderNumber').lean(),
  ]);
  const saved = new Map(
    [...savedCards, ...savedPosters].map((order) => [String(order._id), order.orderNumber])
  );
  const failures = plan.filter((order) => saved.get(String(order._id)) !== order.nextOrderNumber);
  const duplicateCount = plan.length - new Set(plan.map((order) => order.nextOrderNumber)).size;
  if (failures.length || duplicateCount) {
    throw new Error(`Verification failed: ${failures.length} mismatched and ${duplicateCount} duplicate order number(s).`);
  }
  console.log(`Migration verified: ${plan.length} unique order number(s); sequence counters updated.`);
}

main()
  .catch((err) => {
    console.error('Order-number migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
