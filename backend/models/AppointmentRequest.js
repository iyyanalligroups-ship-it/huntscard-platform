const mongoose = require('mongoose');

// A request to meet, sent from one client to a phone number in their own
// Contacts list (see Contact.js) -- the recipient doesn't need to already
// be a Huntstag account. If they are (matched by phone, see
// normalizePhone in routes/appointments.js), toClientId is set right
// away and they see it on their own Appointment Requests page. If not,
// toClientId stays null and an SMS invite goes out instead
// (invitedViaSms: true) -- toClientId gets claimed automatically the
// moment an account is created with a matching phone (see the
// claimAppointmentRequests hook in routes/auth.js's POST /register).
const appointmentRequestSchema = new mongoose.Schema(
  {
    fromClientId: { type: String, required: true, index: true },
    toClientId: { type: String, default: null, index: true },
    // Always stored, even once toClientId resolves -- this is what SMS
    // invites and the claim-on-register logic key off, and what lets the
    // sender's own "sent" list show a name/number for a still-unclaimed
    // invite.
    toPhone: { type: String, required: true, trim: true },
    toName: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 500 },
    // Optional suggested date/time -- not required at send time (the
    // arrow-icon action in Contacts is meant to be quick), left here for
    // the accept flow / a future proper scheduling step to fill in.
    proposedAt: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    invitedViaSms: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppointmentRequest', appointmentRequestSchema);
