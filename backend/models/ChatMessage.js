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
    text: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
