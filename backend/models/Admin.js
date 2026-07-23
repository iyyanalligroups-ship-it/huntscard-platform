const mongoose = require('mongoose');

// Deliberately a separate collection from Client -- admin accounts are
// never created through public registration. The first one is created
// with seed-admin.js; every subsequent one is invited by an existing
// admin from the Team screen (see routes/admin.js).
const AdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
    // 'admin' has full access including claim/assign/dispatch on the
    // fulfillment pipeline. 'subadmin' has the same full access as
    // before (create clients, encode tool, everything) EXCEPT claiming,
    // assigning, or dispatching orders -- they can only complete work
    // that's already been assigned to them. Deliberately scoped, not a
    // full permissions rework.
    role: { type: String, enum: ['admin', 'subadmin'], default: 'admin' },
    // True for team-invited admins until they change their generated
    // temp password on first login -- same pattern as Client. The root
    // admin created via seed-admin.js sets a real password directly, so
    // seed-admin.js explicitly sets this to false.
    mustChangePassword: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', AdminSchema);
