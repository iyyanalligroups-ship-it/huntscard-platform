const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { str, limiter } = require('../utils/upload');
const SupportTicket = require('../models/SupportTicket');
const OrderSequence = require('../models/OrderSequence');
const CardRequest = require('../models/CardRequest');
const MagicPosterOrder = require('../models/MagicPosterOrder');
const Card = require('../models/Card');
const Client = require('../models/Client');
const { sendTicketRaised, sendCustomerReply } = require('../utils/supportMail');

const router = express.Router();

// Client side of "Raise a ticket". The owner is always req.user.clientId from the verified token, never
// something from the body or URL. The admin side lives in routes/admin.js (same collection).

const MAX_OPEN_TICKETS = 10;
const createLimiter = limiter(15, 60, 'Too many tickets raised. Please try again later.');

async function nextTicketNumber() {
  const year = new Intl.DateTimeFormat('en-GB', { year: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date());
  const seq = await OrderSequence.findOneAndUpdate(
    { _id: `support-tickets-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `TK${year}-${String(seq.value).padStart(6, '0')}`;
}

// Customers never see which team member replied (or their email) -- only "Support team".
function forClient(ticket) {
  const o = ticket.toObject ? ticket.toObject() : ticket;
  o.messages = o.messages.map((m) => ({ ...m, byName: '' }));
  delete o.takenBy;
  return o;
}

// List row: no message bodies.
function summary(t) {
  const last = t.messages[t.messages.length - 1];
  return {
    _id: t._id,
    ticketNumber: t.ticketNumber,
    category: t.category,
    subject: t.subject,
    orderNumber: t.orderNumber,
    cardNumber: t.cardNumber,
    status: t.status,
    clientUnread: t.clientUnread,
    messageCount: t.messages.length,
    lastMessageFrom: last ? last.from : null,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
  };
}

// GET /api/profile/tickets -- this client's tickets, most recently active first.
router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ clientId: req.user.clientId }).sort({ lastActivityAt: -1 }).limit(100);
    res.json(tickets.map(summary));
  } catch (err) {
    console.error('[tickets GET]', err);
    res.status(500).json({ error: 'Could not load your tickets.' });
  }
});

// POST /api/profile/tickets { category, subject, description, orderNumber?, cardNumber? }
router.post('/tickets', requireAuth, createLimiter, async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const category = str(req.body.category);
    const subject = str(req.body.subject).trim();
    const description = str(req.body.description).trim();
    const orderNumber = str(req.body.orderNumber).trim() || null;
    const cardNumberRaw = req.body.cardNumber;
    const cardNumber = cardNumberRaw === undefined || cardNumberRaw === null || cardNumberRaw === '' ? null : Number(cardNumberRaw);

    if (!SupportTicket.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose what the ticket is about.' });
    if (subject.length < 5 || subject.length > 120) return res.status(400).json({ error: 'Subject must be 5 to 120 characters.' });
    if (description.length < 10 || description.length > 2000) return res.status(400).json({ error: 'Describe the problem in 10 to 2000 characters.' });

    if (orderNumber) {
      const [cardOrder, posterOrder] = await Promise.all([
        CardRequest.exists({ clientId, orderNumber }),
        MagicPosterOrder.exists({ clientId, orderNumber }),
      ]);
      if (!cardOrder && !posterOrder) return res.status(400).json({ error: 'That order was not found on your account.' });
    }
    if (cardNumber !== null) {
      if (!Number.isInteger(cardNumber) || cardNumber < 1) return res.status(400).json({ error: 'Choose a valid card.' });
      if (!(await Card.exists({ clientId, cardNumber }))) return res.status(400).json({ error: 'That card was not found on your account.' });
    }

    const openCount = await SupportTicket.countDocuments({ clientId, status: { $ne: 'resolved' } });
    if (openCount >= MAX_OPEN_TICKETS) {
      return res.status(429).json({ error: `You already have ${MAX_OPEN_TICKETS} open tickets. Please wait for those to be resolved.` });
    }

    const ticket = await SupportTicket.create({
      ticketNumber: await nextTicketNumber(),
      clientId,
      category,
      subject,
      orderNumber,
      cardNumber,
      messages: [{ from: 'client', text: description }],
      adminUnread: true,
      clientUnread: false,
    });
    // Mail format: one mail to the support inbox, one confirmation to the customer (never blocks the response).
    Client.findOne({ clientId }).select('clientId fullName phone loginEmail').then((client) => {
      if (client) sendTicketRaised({ ticket, client, description });
    }).catch(() => {});
    res.status(201).json(forClient(ticket));
  } catch (err) {
    console.error('[tickets POST]', err);
    res.status(500).json({ error: 'Could not raise the ticket. Please try again.' });
  }
});

// GET /api/profile/tickets/:id -- one ticket with its whole conversation. Opening it clears the unread dot.
router.get('/tickets/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Ticket not found.' });
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, clientId: req.user.clientId },
      { $set: { clientUnread: false } },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    res.json(forClient(ticket));
  } catch (err) {
    console.error('[tickets/:id GET]', err);
    res.status(500).json({ error: 'Could not load the ticket.' });
  }
});

// POST /api/profile/tickets/:id/reply { text } -- a reply on a resolved ticket reopens it.
router.post('/tickets/:id/reply', requireAuth, createLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Ticket not found.' });
    const text = str(req.body.text).trim();
    if (text.length < 1 || text.length > 2000) return res.status(400).json({ error: 'Write a message of up to 2000 characters.' });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, clientId: req.user.clientId });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    if (ticket.messages.length >= 200) return res.status(400).json({ error: 'This ticket has too many messages. Please raise a new one.' });

    ticket.messages.push({ from: 'client', text });
    if (ticket.status === 'resolved') {
      ticket.status = 'open';
      ticket.resolvedAt = null;
    }
    ticket.adminUnread = true;
    ticket.lastActivityAt = new Date();
    await ticket.save();
    Client.findOne({ clientId: req.user.clientId }).select('clientId fullName phone loginEmail').then((client) => {
      sendCustomerReply({ ticket, client, text });
    }).catch(() => {});
    res.json(forClient(ticket));
  } catch (err) {
    console.error('[tickets reply POST]', err);
    res.status(500).json({ error: 'Could not send your message.' });
  }
});

module.exports = router;
