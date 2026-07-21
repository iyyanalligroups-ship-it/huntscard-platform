/**
 * Run this once to create an admin account. There is no public
 * registration endpoint for admins on purpose -- this keeps admin
 * creation out of the API surface entirely.
 *
 * Usage:
 *   node seed-admin.js "you@example.com" "a-strong-password" "Your Name"
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Admin = require('./models/Admin');

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error('Usage: node seed-admin.js <email> <password> [name]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Use at least 10 characters for an admin password.');
    process.exit(1);
  }
  await connectDB();

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`Admin with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Admin.create({ email: email.toLowerCase(), passwordHash, name, role: 'admin', mustChangePassword: false });

  console.log(`✅ Admin account created for ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
