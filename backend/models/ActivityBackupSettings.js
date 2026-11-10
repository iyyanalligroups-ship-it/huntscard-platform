const mongoose = require('mongoose');

// The one settings document for the activity backup (start/stop, how often, where to save, purge).
// Kept in the database, not in .env, so an admin can change it from the panel. The key can be
// overridden with ACTIVITY_BACKUP_SETTINGS_KEY so tests never touch the real settings.
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    intervalDays: { type: Number, default: 15, min: 1, max: 90 },
    timeOfDay: { type: String, default: '02:00' }, // India time, HH:MM
    storage: { type: String, enum: ['local', 'drive'], default: 'local' },
    purgeAfterBackup: { type: Boolean, default: false },
    // Every finished day up to and including this one is saved (YYYY-MM-DD, India). Moves forward only
    // when every file of a run succeeded.
    lastSavedThrough: { type: String, default: null },
    // The next scheduled run is due at this time. It moves forward only after a fully successful run, so
    // a run that keeps failing shows up as OVERDUE. retryAt is when a failed run is tried again.
    nextDueAt: { type: Date, default: null },
    retryAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastRunStatus: { type: String, default: null }, // ok | partial | failed
    lastRunId: { type: mongoose.Schema.Types.ObjectId, default: null },
    lastAlertDay: { type: String, default: null }, // one overdue alert per day
    drive: {
      refreshTokenEnc: { type: String, default: null }, // AES-GCM, never sent to the browser
      email: { type: String, default: null },
      connectedAt: { type: Date, default: null },
    },
    lockUntil: { type: Date, default: null }, // a run holds this so two never overlap
  },
  { timestamps: true }
);

schema.statics.settingsKey = () => process.env.ACTIVITY_BACKUP_SETTINGS_KEY || 'activity-backup';
schema.statics.load = function load() {
  const key = this.settingsKey();
  return this.findOneAndUpdate({ key }, { $setOnInsert: { key } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};

module.exports = mongoose.models.ActivityBackupSettings || mongoose.model('ActivityBackupSettings', schema);
