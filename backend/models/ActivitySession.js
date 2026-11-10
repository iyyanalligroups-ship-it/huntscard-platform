const mongoose = require('mongoose');

// One row per login of a (non-admin) client: who, from where, when, and every step they did.
// Written by utils/activityLog.js after each request finishes; never read on the hot path.
// No TTL index on purpose -- days are removed by the retention/purge job only after they are
// confirmed in the Google Drive backup (see utils/activityLog.js header).
const EVENTS_KEEP = 1500;

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    label: { type: String, required: true },
    method: String, // HTTP method for server events; 'UI' for events sent by the web/mobile tracker
    path: String,
    ref: String, // id of the thing touched (contact id, card number...)
    status: Number,
    changes: [{ _id: false, label: String, before: String, after: String }],
  },
  { _id: false }
);

const activitySessionSchema = new mongoose.Schema(
  {
    sid: { type: String, required: true, unique: true },
    user: { type: String, required: true }, // Client.clientId
    role: { type: String, default: 'client' },
    platform: { type: String, enum: ['web', 'app'], default: 'web' },
    ip: String,
    userAgent: String,
    startedAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    endReason: { type: String, enum: ['logout', 'switched', null], default: null },
    eventCount: { type: Number, default: 0 }, // total ever, even when old events were trimmed
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: false }
);

activitySessionSchema.index({ user: 1, startedAt: -1 });
activitySessionSchema.index({ startedAt: 1 });
activitySessionSchema.index({ lastActivityAt: 1 });

activitySessionSchema.statics.EVENTS_KEEP = EVENTS_KEEP;

module.exports = mongoose.models.ActivitySession || mongoose.model('ActivitySession', activitySessionSchema);
