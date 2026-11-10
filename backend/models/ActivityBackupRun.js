const mongoose = require('mongoose');

// One row per backup run, for the "Backup runs" table on the Activity backups page.
const schema = new mongoose.Schema(
  {
    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: Date,
    trigger: { type: String, enum: ['schedule', 'manual', 'test', 'retry'], required: true },
    startedBy: { type: String, default: '' }, // admin email, '' for the scheduler
    place: { type: String, enum: ['local', 'drive'], required: true },
    fromDay: String,
    toDay: String,
    includesToday: { type: Boolean, default: false },
    status: { type: String, enum: ['running', 'ok', 'partial', 'failed'], default: 'running' },
    people: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    replaced: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    removed: { type: Number, default: 0 }, // sessions removed from the database by the purge
    bytes: { type: Number, default: 0 },
    failures: [{ _id: false, user: String, day: String, reason: String }],
    retryOf: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: false }
);

module.exports = mongoose.models.ActivityBackupRun || mongoose.model('ActivityBackupRun', schema);
