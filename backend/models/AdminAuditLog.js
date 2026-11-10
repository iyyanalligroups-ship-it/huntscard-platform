const mongoose = require('mongoose');

// Who did what in the admin panel for the activity logs and their Google Drive backup: deletes,
// backup start/stop/settings, and alerts (overdue or failed backups). Read by the "Activity backups"
// page. Not used for anything else yet.
const AdminAuditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    kind: { type: String, enum: ['activity', 'backup', 'alert'], required: true, index: true },
    adminEmail: { type: String, default: '' }, // '' for the system (scheduler)
    action: { type: String, required: true },
    summary: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.models.AdminAuditLog || mongoose.model('AdminAuditLog', AdminAuditLogSchema);
