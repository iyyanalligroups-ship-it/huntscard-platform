const mongoose = require('mongoose');

// What the backup remembers about each saved file: one per person per day per place. This is how a
// re-run knows what is already saved (so no duplicates), and what the purge may safely delete.
const schema = new mongoose.Schema(
  {
    user: { type: String, required: true }, // Client.clientId
    userName: { type: String, default: '' },
    day: { type: String, required: true }, // YYYY-MM-DD, India
    variant: { type: String, enum: ['', 'more'], default: '' }, // 'more' = "<day> (more).docx", written when a purged day came back with less data
    place: { type: String, enum: ['local', 'drive'], required: true },
    name: String,
    fileId: String, // Drive file id, or the relative path for the server folder
    folderId: String,
    size: { type: Number, default: 0 },
    sessionCount: { type: Number, default: 0 },
    eventCount: { type: Number, default: 0 },
    stamp: String, // fingerprint of the sessions the file was built from
    writtenAt: Date,
    confirmedAt: Date, // set only after the place was asked for the file and it was there
    purged: { type: Boolean, default: false },
    purgedAt: Date,
    runId: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true }
);

// The place is part of the key, so the server-folder test copy and the Drive copy never collide.
schema.index({ user: 1, day: 1, variant: 1, place: 1 }, { unique: true });
schema.index({ place: 1, day: 1 });

module.exports = mongoose.models.ActivityBackupFile || mongoose.model('ActivityBackupFile', schema);
