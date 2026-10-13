const express = require('express');
const { requireAuth } = require('../middleware/auth');
const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

// ---------------------------------------------------------------------
// Client side of the two-way support chat (client-app's ChatSupport.jsx).
// The admin side lives in routes/admin.js -- same ChatMessage collection,
// req.user.clientId (from the verified JWT) is the only source of
// ownership here, never anything from the request body/URL.
// ---------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 4000;
const DELETED_TEXT = 'This message was deleted';

// A deleted message (or a quote of one) is returned with placeholder text, never its original.
function present(m) {
  const o = m.toObject ? m.toObject() : m;
  if (o.deleted) o.text = DELETED_TEXT;
  if (o.replyTo?.deleted) o.replyTo.text = DELETED_TEXT;
  return o;
}

// GET /api/profile/chat -- the client's own conversation with admin,
// oldest first. Marks every admin message in it as read, since fetching
// the thread IS the client viewing it.
router.get('/chat', requireAuth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ clientId: req.user.clientId, hiddenFor: { $ne: 'client' } }).sort({ createdAt: 1 });
    await ChatMessage.updateMany(
      { clientId: req.user.clientId, sender: 'admin', read: false },
      { $set: { read: true } }
    );
    res.json(messages.map(present));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chat.' });
  }
});

// POST /api/profile/chat { text } -- send a message to admin.
router.post('/chat', requireAuth, async (req, res) => {
  const text = (req.body.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Message is too long.' });

  try {
    const doc = { clientId: req.user.clientId, sender: 'client', text, read: false };
    // Optional reply: quote a message from this client's own conversation.
    if (req.body.replyTo && mongoose.isValidObjectId(req.body.replyTo)) {
      const quoted = await ChatMessage.findOne({ _id: req.body.replyTo, clientId: req.user.clientId });
      if (quoted) {
        doc.replyTo = {
          messageId: quoted._id,
          sender: quoted.sender,
          text: quoted.deleted ? '' : quoted.text.slice(0, 160),
          deleted: quoted.deleted || undefined,
        };
      }
    }
    const message = await ChatMessage.create(doc);
    res.status(201).json(present(message));
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// PATCH /api/profile/chat/:id { text } -- edit one of the client's own (not deleted) messages.
router.patch('/chat/:id', requireAuth, async (req, res) => {
  const text = (req.body.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Message is too long.' });
  try {
    const message = await ChatMessage.findOne({ _id: req.params.id, clientId: req.user.clientId });
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.sender !== 'client') return res.status(403).json({ error: 'Only your own messages can be edited.' });
    if (message.deleted) return res.status(400).json({ error: 'A deleted message cannot be edited.' });
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    await ChatMessage.updateMany(
      { 'replyTo.messageId': message._id, 'replyTo.deleted': { $ne: true } },
      { $set: { 'replyTo.text': text.slice(0, 160) } }
    );
    res.json(present(message));
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit message.' });
  }
});

// DELETE /api/profile/chat/:id -- "delete for everyone": the row stays (shown as
// "This message was deleted") but its text is wiped, including inside quotes of it.
router.delete('/chat/:id', requireAuth, async (req, res) => {
  try {
    const message = await ChatMessage.findOne({ _id: req.params.id, clientId: req.user.clientId });
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    // ?mode=me -- hide it from this client's view only; any message in their chat can be hidden.
    if (req.query.mode === 'me') {
      await ChatMessage.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: 'client' } });
      return res.json({ _id: message._id, hidden: true });
    }
    if (message.sender !== 'client') return res.status(403).json({ error: 'Only your own messages can be deleted for everyone.' });
    if (!message.deleted) {
      await ChatMessage.updateOne({ _id: message._id }, { $set: { deleted: true, deletedAt: new Date(), text: '' } });
      await ChatMessage.updateMany(
        { 'replyTo.messageId': message._id },
        { $set: { 'replyTo.text': '', 'replyTo.deleted': true } }
      );
    }
    res.json(present(await ChatMessage.findById(message._id)));
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message.' });
  }
});

module.exports = router;
