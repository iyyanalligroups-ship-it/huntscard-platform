// One-off dev helper: mark a client as paid without going through Razorpay.
// Usage:  node mark-paid.js <clientId>
// Run this from inside the backend/ folder so it picks up the same .env
// (MONGODB_URI) the server itself uses.
require('dotenv').config();
const mongoose = require('mongoose');
const Client = require('./models/Client');

const clientId = process.argv[2];
if (!clientId) {
  console.error('Usage: node mark-paid.js <clientId>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const client = await Client.findOneAndUpdate(
    { clientId },
    { $set: { paid: true, cardType: 'premium' } },
    { new: true }
  );

  if (!client) {
    console.log(`No client found with clientId "${clientId}". Check it matches exactly (case-sensitive).`);
  } else {
    console.log(`✅ Marked as paid: ${client.fullName} (${client.clientId}) -- cardType now "${client.cardType}"`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
