require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const contactsRoutes = require('./routes/contacts');
const appointmentsRoutes = require('./routes/appointments');
const notificationsRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');
const publicRoutes = require('./routes/public');
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/admin');

async function main() {
  await connectDB();

  const app = express();
  // Running behind nginx as a reverse proxy on the VPS -- without this,
  // express-rate-limit throws a validation error on every single request
  // (nginx adds an X-Forwarded-For header that Express doesn't trust by
  // default), and the app can't correctly identify real client IPs for
  // rate limiting either. '1' means trust exactly one hop -- the nginx
  // proxy immediately in front of this process, not an arbitrary chain.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  // Uploaded client photos -- backend/uploads/photos/*, referenced by
  // Client.photoUrl. Public and unauthenticated on purpose, same as any
  // profile photo on a public tap page.
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Public tap/QR page -- what a phone opens when it taps the physical
  // card. clientId is read client-side from the URL path itself (see
  // public-tap/index.html), so the same static file works for every
  // client -- no per-client server-side templating needed.
  app.get('/c/:clientId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public-tap', 'index.html'));
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/profile', contactsRoutes);
  app.use('/api/profile', appointmentsRoutes);
  app.use('/api/profile', notificationsRoutes);
  app.use('/api/profile', chatRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin', adminRoutes);

  // Basic 404 + error handlers so the app doesn't crash on unexpected input
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`[server] huntsTAG backend listening on port ${port}`));
}

main().catch((err) => {
  console.error('[startup] failed to start server:', err.message);
  process.exit(1);
});
