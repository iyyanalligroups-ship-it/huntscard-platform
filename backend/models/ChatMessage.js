const mongoose = require('mongoose');

// One message in a client<->admin support chat. There's no separate
// "thread" document -- clientId groups a client's messages into one
// running conversation, same "derive the thread from a shared key"
// principle as CardTicket.clientId. `read` means "has the OTHER party
// (whoever didn't send this message) seen it yet" -- a client message's
// `read` is about admin having seen it, an admin message's `read` is
// about the client having seen it. One boolean is enough since a message
// only ever has one "other party" to read it.
const ChatMessageSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    sender: { type: String, enum: ['client', 'admin'], required: true },
    // A deleted message keeps its row (so the conversation can show "This
    // message was deleted") but its text is wiped -- hence not required then.
    text: { type: String, required: function () { return !this.deleted; }, trim: true, default: '' },
    read: { type: Boolean, default: false },
    // Who has used "Delete for me" on this message ('client' / 'admin') -- hidden from that side only.
    hiddenFor: { type: [String], default: [] },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    // Quoted message, snapshotted at send time (text is blanked if the
    // quoted message is later deleted).
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
      sender: { type: String, enum: ['client', 'admin'], default: undefined },
      text: { type: String, default: undefined },
      deleted: { type: Boolean, default: undefined },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
