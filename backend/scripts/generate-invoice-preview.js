const fs = require('fs');
const path = require('path');
const { buildInvoicePdf } = require('../utils/invoice');

const outputPath = process.argv[2];
const theme = process.argv[3] || 'default';
if (!outputPath) throw new Error('Pass an output PDF path.');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const stream = fs.createWriteStream(outputPath);
const order = {
  orderNumber: 'HT26001',
  createdAt: new Date('2026-09-24T10:30:00.000Z'),
  paymentStatus: 'paid',
  trackingId: 'TRK908271635',
  delivery: {
    name: 'Charles Xavier',
    phone: '8807226257',
    line1: '445/6 RC Street, Chinna Nellikollai',
    line2: '',
    city: 'Chidambaram',
    state: 'Tamil Nadu',
    country: 'India',
    pincode: '608704',
  },
  items: [
    { name: 'AK Good Bad Ugly', unitPrice: 100, quantity: 2 },
    { name: 'Tamil Queen', unitPrice: 200, quantity: 1 },
  ],
  subtotal: 400,
  deliveryFee: 60,
  gstPercent: 18,
  gstAmount: 83,
  amount: 543,
};

buildInvoicePdf(order, { fullName: 'Charles Xavier' }, stream, { theme });
stream.on('finish', () => console.log(outputPath));
