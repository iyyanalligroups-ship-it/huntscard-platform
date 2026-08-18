const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

// ---------------------------------------------------------------------
// Client side of the two-way support chat (client-app's ChatSupport.jsx).
// The admin side lives in routes/admin.js -- same ChatMessage collection,
// req.user.clientId (from the verified JWT) is the only source of
// ownership here, never anything from the request body/URL.
// ---------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 4000;

// GET /api/profile/chat -- the client's own conversation with admin,
// oldest first. Marks every admin message in it as read, since fetching
// the thread IS the client viewing it.
router.get('/chat', requireAuth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ clientId: req.user.clientId }).sort({ createdAt: 1 });
    await ChatMessage.updateMany(
      { clientId: req.user.clientId, sender: 'admin', read: false },
      { $set: { read: true } }
    );
    res.json(messages);
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
    const message = await ChatMessage.create({ clientId: req.user.clientId, sender: 'client', text, read: false });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

module.exports = router;
