const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const Contact = require('../models/Contact');

const router = express.Router();

// ---------------------------------------------------------------------
// Personal phone-contacts backup, scoped to the logged-in client. Gets
// data in via three paths: the browser's Contact Picker API, an
// Excel/CSV upload, or the manual Add/Edit form (all client-side, see
// client-app/src/pages/Contacts.jsx). Export is a vCard or Excel file the
// client re-imports on a new phone/device. req.user.clientId (from the
// verified JWT) is the only source of ownership anywhere in this file --
// never an id taken from the request body/URL, same rule the rest of
// profile.js follows.
// ---------------------------------------------------------------------

// Best-effort split of a single full name into first/last -- first word is
// firstName, everything else is lastName. Used both to backfill contacts
// saved before firstName/lastName existed, and for import sources (Contact
// Picker, Excel without explicit First/Last columns) that only ever hand
// over one name string.
function splitName(fullName) {
  const trimmed = (fullName || '').toString().trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// GET /api/profile/contacts -- list everything saved for this client.
router.get('/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.find({ clientId: req.user.clientId }).sort({ name: 1 });

    // Self-healing backfill for contacts saved before firstName/lastName
    // existed -- idempotent (no-ops once a doc has them), so this just
    // runs harmlessly on every request rather than needing a one-off
    // migration script.
    const needsBackfill = contacts.filter((c) => !c.firstName && !c.lastName);
    if (needsBackfill.length > 0) {
      await Promise.all(
        needsBackfill.map((c) => {
          const { firstName, lastName } = splitName(c.name);
          c.firstName = firstName;
          c.lastName = lastName;
          return Contact.updateOne({ _id: c._id }, { $set: { firstName, lastName } });
        })
      );
    }

    res.json(contacts);
  } catch (err) {
    console.error('[contacts GET]', err);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

// POST /api/profile/contacts -- create one contact by hand. Unlike bulk
// import, a duplicate phone number here is a real error (409), not a
// silent skip -- this is a single deliberate action, not a batch restore.
router.post('/contacts', requireAuth, async (req, res) => {
  const { firstName, lastName, phone, email, org, address, notes } = req.body || {};
  const trimmedPhone = (phone || '').toString().trim();
  if (!trimmedPhone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const existing = await Contact.findOne({ clientId: req.user.clientId, phone: trimmedPhone });
    if (existing) return res.status(409).json({ error: 'A contact with this phone number is already saved.' });

    const trimmedFirst = (firstName || '').toString().trim();
    const trimmedLast = (lastName || '').toString().trim();
    const contact = await Contact.create({
      clientId: req.user.clientId,
      firstName: trimmedFirst,
      lastName: trimmedLast,
      name: [trimmedFirst, trimmedLast].filter(Boolean).join(' ').trim() || trimmedPhone,
      phone: trimmedPhone,
      email: (email || '').toString().trim(),
      org: (org || '').toString().trim(),
      address: (address || '').toString().trim(),
      notes: (notes || '').toString().trim(),
    });
    res.status(201).json(contact);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A contact with this phone number is already saved.' });
    console.error('[contacts create POST]', err);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/profile/contacts/:id -- edit an existing contact, however it
// originally got into the system (picker, Excel, or manual).
router.put('/contacts/:id', requireAuth, async (req, res) => {
  const { firstName, lastName, phone, email, org, address, notes } = req.body || {};
  const trimmedPhone = (phone || '').toString().trim();
  if (!trimmedPhone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const contact = await Contact.findOne({ _id: req.params.id, clientId: req.user.clientId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    if (trimmedPhone !== contact.phone) {
      const dup = await Contact.findOne({ clientId: req.user.clientId, phone: trimmedPhone, _id: { $ne: contact._id } });
      if (dup) return res.status(409).json({ error: 'A contact with this phone number is already saved.' });
    }

    contact.firstName = (firstName || '').toString().trim();
    contact.lastName = (lastName || '').toString().trim();
    contact.phone = trimmedPhone;
    contact.email = (email || '').toString().trim();
    contact.org = (org || '').toString().trim();
    contact.address = (address || '').toString().trim();
    contact.notes = (notes || '').toString().trim();
    await contact.save(); // pre-save hook on the model resyncs `name` from firstName/lastName

    res.json(contact);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A contact with this phone number is already saved.' });
    console.error('[contacts update PUT]', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// POST /api/profile/contacts/import -- body: { contacts: [{ name, phone,
// email, org, address }] }. A phone number already saved for this client
// is left untouched (skipped), never overwritten -- confirmed behavior.
router.post('/contacts/import', requireAuth, async (req, res) => {
  const incoming = Array.isArray(req.body?.contacts) ? req.body.contacts : [];

  // Nothing to dedupe or restore a contact by without a phone number.
  const withPhone = incoming
    .map((c) => ({
      name: (c.name || '').toString().trim(),
      phone: (c.phone || '').toString().trim(),
      email: (c.email || '').toString().trim(),
      org: (c.org || '').toString().trim(),
      address: (c.address || '').toString().trim(),
      notes: (c.notes || '').toString().trim(),
    }))
    .filter((c) => c.phone);

  if (withPhone.length === 0) {
    return res.json({ imported: 0, skipped: incoming.length });
  }

  try {
    const existing = await Contact.find({ clientId: req.user.clientId }).select('phone');
    const existingPhones = new Set(existing.map((c) => c.phone));

    const toInsert = [];
    const seenThisBatch = new Set(); // guards against duplicates within the same picker selection
    for (const c of withPhone) {
      if (existingPhones.has(c.phone) || seenThisBatch.has(c.phone)) continue;
      seenThisBatch.add(c.phone);
      const name = c.name || c.phone;
      const { firstName, lastName } = splitName(name);
      toInsert.push({ ...c, name, firstName, lastName, clientId: req.user.clientId });
    }

    if (toInsert.length > 0) {
      await Contact.insertMany(toInsert, { ordered: false });
    }

    res.json({ imported: toInsert.length, skipped: incoming.length - toInsert.length });
  } catch (err) {
    console.error('[contacts import POST]', err);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// DELETE /api/profile/contacts/:id
router.delete('/contacts/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Contact.findOneAndDelete({ _id: req.params.id, clientId: req.user.clientId });
    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[contacts DELETE]', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ---------------------------------------------------------------------
// Contact photo -- manual upload only (not pulled from the Contact
// Picker's `icon` property). Same shape as the photo/banner uploads in
// profile.js: disk storage, 5MB limit, JPEG/PNG/WEBP only.
// ---------------------------------------------------------------------

const CONTACT_PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'contact-photos');
fs.mkdirSync(CONTACT_PHOTOS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const contactPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: CONTACT_PHOTOS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = crypto.randomBytes(6).toString('hex');
      cb(null, `${req.params.id}-${unique}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// Multer's own message for an oversize file is just "File too large" -- no
// mention of the actual limit. Same fix as profile.js's uploadErrorMessage.
function uploadErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 'File is too large -- max 5MB.';
  return err.message;
}

// POST /api/profile/contacts/:id/photo
router.post('/contacts/:id/photo', requireAuth, (req, res) => {
  contactPhotoUpload.single('photo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: uploadErrorMessage(err) });
    if (!req.file) return res.status(400).json({ error: 'No photo file received' });

    try {
      const photoUrl = `${process.env.BACKEND_URL}/uploads/contact-photos/${req.file.filename}`;
      const contact = await Contact.findOneAndUpdate(
        { _id: req.params.id, clientId: req.user.clientId },
        { $set: { photoUrl } },
        { new: true }
      );
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      res.json(contact);
    } catch (err2) {
      console.error('[contacts photo POST]', err2);
      res.status(500).json({ error: 'Failed to save photo' });
    }
  });
});

// DELETE /api/profile/contacts/:id/photo
router.delete('/contacts/:id/photo', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, clientId: req.user.clientId },
      { $set: { photoUrl: null } },
      { new: true }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    console.error('[contacts photo DELETE]', err);
    res.status(500).json({ error: 'Failed to remove photo' });
  }
});

// vCard 3.0 requires backslash, comma, semicolon, and newlines escaped
// inside field values -- otherwise those characters get parsed as field
// separators by the receiving phone's contacts app instead of literal text.
function escapeVCardValue(value) {
  return (value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function contactToVCard(c) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCardValue(c.lastName)};${escapeVCardValue(c.firstName)};;;`,
    `FN:${escapeVCardValue(c.name)}`,
  ];
  if (c.phone) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${escapeVCardValue(c.email)}`);
  if (c.org) lines.push(`ORG:${escapeVCardValue(c.org)}`);
  if (c.address) lines.push(`ADR:;;${escapeVCardValue(c.address)};;;;`);
  if (c.notes) lines.push(`NOTE:${escapeVCardValue(c.notes)}`);
  if (c.photoUrl) lines.push(`PHOTO;VALUE=URI:${c.photoUrl}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// GET /api/profile/contacts/export -- all of this client's contacts as a
// single .vcf file. Opening it on a phone (Android or iPhone) hands off
// to the OS's own "Add to Contacts" screen -- this is the actual restore
// path, not a live API call, since no browser can write into a phone's
// address book directly.
router.get('/contacts/export', requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.find({ clientId: req.user.clientId }).sort({ name: 1 });
    const vcf = contacts.map(contactToVCard).join('\r\n');

    res.set({
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="huntstag-contacts.vcf"',
    });
    res.send(vcf);
  } catch (err) {
    console.error('[contacts export GET]', err);
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

module.exports = router;
