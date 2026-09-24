const OrderSequence = require('../models/OrderSequence');

function businessYear(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    year: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

async function nextOrderNumber(date = new Date()) {
  const year = businessYear(date);
  const sequence = await OrderSequence.findOneAndUpdate(
    { _id: `orders-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return `HT${year}${String(sequence.value).padStart(3, '0')}`;
}

module.exports = { nextOrderNumber };
