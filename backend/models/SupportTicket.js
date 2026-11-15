const mongoose = require('mongoose');

// A support ticket raised by a logged-in client from their dashboard ("Raise a ticket"), with a two-way
// conversation between the client and the admin team. Not the same as CardTicket, which is raised by an
// anonymous visitor who tapped a deactivated card.
const MessageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['client', 'admin'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    byName: { type: String, trim: true, default: '' }, // admin's display name; empty for the client
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true }, // e.g. TK26-000012
    clientId: { type: String, required: true, index: true },
    category: { type: String, enum: ['order', 'card', 'payment', 'account', 'other'], required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    // Optional links to what the problem is about (validated to belong to this client).
    orderNumber: { type: String, trim: true, default: null },
    cardNumber: { type: Number, default: null },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
    messages: { type: [MessageSchema], default: [] },
    // The admin who took this ticket (set when they reply, change its status, or press "Take ticket").
    takenBy: {
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
    },
    // New message waiting for the other side to read.
    clientUnread: { type: Boolean, default: false },
    adminUnread: { type: Boolean, default: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SupportTicketSchema.statics.CATEGORIES = ['order', 'card', 'payment', 'account', 'other'];

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
