// One-off bootstrap: sets the FIRST Admin Prime account (a genuine
// singleton -- see backend/models/Admin.js's role comment). Refuses if
// one already exists, since from that point on the only way to change
// who holds the role is the app's own transfer route
// (POST /api/admin/team/:id/promote-to-prime, Admin Prime only).
// Usage:  node promote-admin-prime.js <email>
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node promote-admin-prime.js <email>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const existingPrime = await Admin.findOne({ role: 'primeadmin' }).select('email');
  if (existingPrime) {
    console.log(
      `An Admin Prime already exists (${existingPrime.email}). Use the app's own "Promote to Admin Prime" action (as that account) to transfer the role instead of running this script again.`
    );
    await mongoose.disconnect();
    return;
  }

  const admin = await Admin.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { role: 'primeadmin' } },
    { new: true }
  ).select('email name role');

  if (!admin) {
    console.log(`No admin found with email "${email}". Check it matches exactly (case-sensitive).`);
  } else {
    console.log(`✅ ${admin.email} is now Admin Prime.`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exitCode = 1;
});
