/**
 * HuntsTAG NFC encode tool -- local GUI version
 * -----------------------------------------------------------------------
 * PHASE 1 of the plan: a real local web app (open in your normal browser
 * at http://localhost:5175) instead of the terminal. This runs entirely
 * on your own machine -- nothing here is deployed or exposed outside it,
 * same as the terminal tool. Only YOU, on THIS PC, with the ACR1252U
 * plugged in, can reach it.
 *
 * PHASE 2 (later, once the design is approved): this exact server gets
 * wrapped in Electron and shipped as a double-clickable .exe -- the UI
 * and all the hardware logic below carry over unchanged. Nothing built
 * here is throwaway.
 *
 * Uses the SAME functions from ./lib.js that already passed a real
 * hardware write/verify/lock test via the terminal tool -- this GUI adds
 * no new hardware logic, only a different front end for it.
 */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { NFC } = require('nfc-pcsc');
const { writeNdef, verifyWrite, lockCard, hashPassword, readNdefUri, checkLockStatus, attemptPasswordAuth, attemptRewriteTest, unlockAndBlankCard } = require('./lib');
const { readConfig, writeConfig, clearSavedSession } = require('./config-store');

const PORT = process.env.GUI_PORT || 5175;

// Backend URL and public base URL are now real per-install SETTINGS, not
// just env vars -- an employee configures these once from the Settings
// screen and they're remembered (see config-store.js). .env values (if
// present, e.g. during local dev) only seed the very first run.
const storedConfig = readConfig();
let BACKEND_URL = storedConfig.backendUrl || process.env.BACKEND_URL || 'http://localhost:4000';
let PUBLIC_BASE_URL = storedConfig.publicBaseUrl || process.env.PUBLIC_BASE_URL || '';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------
// Single-operator session state
// -----------------------------------------------------------------------
// This tool is used by one admin at a time on one machine physically
// wired to the reader -- a simple in-memory session (not signed cookies,
// not multi-user) matches that reality. The session is ALSO persisted to
// disk (see config-store.js) so an employee doesn't have to log back in
// every time they open the app -- only when their token actually expires
// or they explicitly log out.
// ---------------------------------------------------------------------
let session = storedConfig.session || null; // { adminEmail, token }
let armedJob = null; // { clientId, fullName, url, pwdBytes, packBytes } -- WRITE mode
let readModeArmed = false; // READ mode -- mutually exclusive with armedJob
let protectTestArmed = null; // { pwdHex } -- PASSWORD TEST mode -- also mutually exclusive
let rewriteTestArmed = null; // { testText, pwdHex } -- REWRITE TEST mode -- also mutually exclusive
let recoverArmed = null; // { pwdHex } -- RECOVER mode (unlock + wipe a locked card) -- also mutually exclusive

function requireSession(req, res, next) {
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// ---------------------------------------------------------------------
// Server-Sent Events -- pushes live reader/card status to the browser
// without the browser having to poll. One tab open at a time is the
// expected use case for this tool.
// ---------------------------------------------------------------------
let sseClients = [];
let connectedReaderName = null; // tracks current state so a newly opened/reloaded tab can be told immediately, not just future events

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
}

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  sseClients.push(res);
  // Catch this client up on the CURRENT reader state -- without this, a
  // tab opened/reloaded after the reader was already detected would show
  // "no reader" forever, since the original connect event already fired
  // and is gone.
  if (connectedReaderName) {
    res.write(`event: reader-connected\ndata: ${JSON.stringify({ name: connectedReaderName })}\n\n`);
  }
  req.on('close', () => {
    sseClients = sseClients.filter((r) => r !== res);
  });
});

// ---------------------------------------------------------------------
// Settings -- backend URL and public base URL, configured once per
// install from the Settings screen and remembered from then on. No
// requireSession here deliberately: you need the backend URL set
// correctly BEFORE you can log in against it at all.
// ---------------------------------------------------------------------

app.get('/api/settings', (req, res) => {
  res.json({ backendUrl: BACKEND_URL, publicBaseUrl: PUBLIC_BASE_URL });
});

app.post('/api/settings', (req, res) => {
  const { backendUrl, publicBaseUrl } = req.body || {};
  if (!backendUrl || !/^https?:\/\//.test(backendUrl)) {
    return res.status(400).json({ error: 'Backend URL must start with http:// or https://' });
  }
  if (!publicBaseUrl || !/^https?:\/\//.test(publicBaseUrl)) {
    return res.status(400).json({ error: 'Public base URL must start with http:// or https://' });
  }
  BACKEND_URL = backendUrl.replace(/\/+$/, '');
  PUBLIC_BASE_URL = publicBaseUrl.replace(/\/+$/, '');
  writeConfig({ backendUrl: BACKEND_URL, publicBaseUrl: PUBLIC_BASE_URL });
  res.json({ ok: true, backendUrl: BACKEND_URL, publicBaseUrl: PUBLIC_BASE_URL });
});

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: body.error || 'Login failed' });

    if (body.mustChangePassword) {
      return res.status(403).json({
        error: 'This admin account is still on a temporary password. Set a real password on the admin webpage first.',
      });
    }

    session = { adminEmail: email.toLowerCase(), token: body.token };
    writeConfig({ session }); // remembered across restarts -- no re-login every launch
    res.json({ ok: true, adminEmail: session.adminEmail });
  } catch (err) {
    // Same underlying cause as the terminal tool's "fetch failed" --
    // backend not running, or BACKEND_URL pointing at the wrong place.
    res.status(502).json({ error: `Could not reach backend at ${BACKEND_URL}: ${err.message}` });
  }
});

app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!session, adminEmail: session?.adminEmail || null });
});

app.post('/api/logout', (req, res) => {
  session = null;
  armedJob = null;
  clearSavedSession();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Pending clients
// ---------------------------------------------------------------------

// Looks up ANY client by ID -- unlike /api/pending, this has no paid or
// chipEncoded filter, because the Write panel's job is finding a
// specific person to fix up their details, not listing who's ready for
// a card.
app.get('/api/client/:clientId', requireSession, async (req, res) => {
  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/encode/client/${req.params.clientId}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: body.error || `No client found with ID "${req.params.clientId}"` });
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

app.get('/api/pending', requireSession, async (req, res) => {
  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/encode/pending`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const body = await r.json().catch(() => ([]));
    if (!r.ok) return res.status(r.status).json({ error: body.error || 'Could not load pending clients' });
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

// Shared by both /api/arm (paid clients only) and /api/arm-by-id (any
// client, for gifting a card without payment) -- the actual arming logic
// is identical either way, only how the client was found differs.
function doArm(client) {
  const url = `${PUBLIC_BASE_URL}/c/${client.clientId}`;
  readModeArmed = false; // write and read are mutually exclusive
  protectTestArmed = null;
  rewriteTestArmed = null;
  recoverArmed = null;
  armedJob = {
    clientId: client.clientId,
    fullName: client.fullName,
    url,
    pwdBytes: crypto.randomBytes(4),
    packBytes: crypto.randomBytes(2),
  };
  broadcast('armed', { fullName: client.fullName, clientId: client.clientId, url });
  return { ok: true, url };
}

// Arm the tool to write the next card that's placed on the reader for
// this specific client. Nothing gets written until an actual card is
// detected -- this just tells the reader-watcher what to do when one is.
app.post('/api/arm', requireSession, async (req, res) => {
  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/encode/client/${clientId}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const client = await r.json().catch(() => null);
    if (!r.ok || !client || !client.paid || client.chipEncoded) {
      return res.status(404).json({ error: 'Client not found or already encoded' });
    }
    res.json(doArm(client));
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

// Same as /api/arm, but deliberately does NOT require paid:true --
// for gifting a card to someone (family, close contacts) without them
// going through checkout. Still refuses an already-encoded card, since
// this tool has no way to unlock and rewrite a locked chip.
// Explicit, deliberate action: allows writing a SECOND/REPLACEMENT
// physical card for a client who already has one encoded (lost original,
// wants a backup, etc.). This does NOT affect the old physical card --
// it stays working with its own password. It only clears the database
// flag so this tool will accept a new write for this client again.
app.post('/api/allow-new-card', requireSession, async (req, res) => {
  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/clients/${clientId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ chipEncoded: false }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: body.error || 'Could not reset' });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

app.post('/api/arm-by-id', requireSession, async (req, res) => {
  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/encode/client/${clientId}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const client = await r.json().catch(() => null);
    if (!r.ok || !client || client.chipEncoded) {
      return res.status(404).json({ error: `No client "${clientId}" found, or it's already encoded` });
    }
    res.json(doArm(client));
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

app.post('/api/disarm', requireSession, (req, res) => {
  armedJob = null;
  readModeArmed = false;
  protectTestArmed = null;
  rewriteTestArmed = null;
  recoverArmed = null;
  broadcast('disarmed', {});
  res.json({ ok: true });
});

// RECOVER mode -- unlocks an already-locked card using its KNOWN
// password, wipes its NDEF content, and disables password protection
// entirely. This is the only path in this tool that can touch a
// password-locked card -- every other mode either refuses one outright
// (arm/arm-by-id) or only tests it without changing anything
// (protect-test/rewrite-test). Use this when a card was written with the
// wrong data and you still have its password: recover it here, then it
// behaves like a brand-new blank card and can go through the normal
// Write/Create-a-card flow again.
app.post('/api/arm-recover', requireSession, (req, res) => {
  const { password } = req.body || {};
  if (!password || !/^[0-9a-fA-F]{8}$/.test(password)) {
    return res.status(400).json({ error: 'Password must be exactly 8 hex characters, e.g. 9C9707C8' });
  }
  armedJob = null;
  readModeArmed = false;
  protectTestArmed = null;
  rewriteTestArmed = null;
  recoverArmed = { pwdHex: password.toUpperCase() };
  broadcast('recover-armed', {});
  res.json({ ok: true });
});

// REWRITE TEST mode -- the most direct real-world test: actually attempt
// to write new data to the card (optionally authenticating with a
// password first), and report plainly whether it was accepted. This is
// what a genuine third-party rewrite attempt looks like -- not a silent
// probe, a real write with real content, on a scratch page that can
// never touch the card's actual profile URL.
app.post('/api/arm-rewrite-test', requireSession, (req, res) => {
  const { testText, password } = req.body || {};
  if (password && !/^[0-9a-fA-F]{8}$/.test(password)) {
    return res.status(400).json({ error: 'Password must be exactly 8 hex characters, e.g. 9C9707C8' });
  }
  armedJob = null;
  readModeArmed = false;
  protectTestArmed = null;
  recoverArmed = null;
  rewriteTestArmed = { testText: testText || 'TEST', pwdHex: password ? password.toUpperCase() : null };
  broadcast('rewrite-test-armed', {});
  res.json({ ok: true });
});

// PASSWORD TEST mode -- the strongest possible check: attempts the
// tag's real PWD_AUTH command with a SPECIFIC password and reports
// whether it's genuinely accepted. Unlike checkLockStatus (which only
// answers "is this locked at all"), this answers "does THIS password
// unlock THIS card" -- exactly what you want to confirm the password
// this tool generated actually works.
app.post('/api/arm-protect-test', requireSession, (req, res) => {
  const { password } = req.body || {};
  if (!password || !/^[0-9a-fA-F]{8}$/.test(password)) {
    return res.status(400).json({ error: 'Password must be exactly 8 hex characters, e.g. 9C9707C8' });
  }
  armedJob = null;
  readModeArmed = false;
  rewriteTestArmed = null;
  recoverArmed = null;
  protectTestArmed = { pwdHex: password.toUpperCase() };
  broadcast('protect-test-armed', {});
  res.json({ ok: true });
});

// READ mode -- test what's actually stored on any card, with no database
// writes at all. Read access is never password-protected by this tool's
// lock design, so this works on already-encoded/locked cards too, which
// is exactly the point: verify a card in software before (or instead of)
// tapping it on a phone.
app.post('/api/arm-read', requireSession, (req, res) => {
  armedJob = null; // read and write are mutually exclusive
  protectTestArmed = null;
  rewriteTestArmed = null;
  recoverArmed = null;
  readModeArmed = true;
  broadcast('read-armed', {});
  res.json({ ok: true });
});

// Lets the operator fill in / correct a walk-in customer's contact
// details right here, at the point of physically handing them a card --
// no need to switch to the admin webpage mid-signup. This proxies to the
// SAME authenticated route the admin app's Edit button uses
// (PATCH /api/admin/clients/:clientId), so it's the real update, not a
// separate/parallel data path.
app.patch('/api/pending/:clientId', requireSession, async (req, res) => {
  const {
    fullName, phone, loginEmail,
    jobTitle, bio, whatsapp, publicEmail, instagramUrl, twitterUrl, portfolioUrl, huntsworldUrl,
  } = req.body || {};
  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/clients/${req.params.clientId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        fullName, phone, loginEmail,
        jobTitle, bio, whatsapp, publicEmail, instagramUrl, twitterUrl, portfolioUrl, huntsworldUrl,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: body.error || 'Update failed' });
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: `Could not reach backend: ${err.message}` });
  }
});

// ---------------------------------------------------------------------
// NFC reader -- watches continuously in the background, only acts when
// a job is armed. This mirrors the terminal tool's behavior exactly,
// just reused across many cards instead of exiting after one.
// ---------------------------------------------------------------------

const nfc = new NFC();

nfc.on('reader', (reader) => {
  connectedReaderName = reader.reader.name;
  broadcast('reader-connected', { name: reader.reader.name });

  reader.on('end', () => {
    connectedReaderName = null;
    broadcast('reader-disconnected', { name: reader.reader.name });
  });

  reader.on('card', async () => {
    if (rewriteTestArmed) {
      const { testText, pwdHex } = rewriteTestArmed;
      rewriteTestArmed = null; // one test per arm
      try {
        broadcast('reading', {});
        const result = await attemptRewriteTest(reader, testText, pwdHex);
        broadcast('rewrite-test-result', result);
      } catch (err) {
        broadcast('rewrite-test-result', { writeSucceeded: false, message: err.message });
      }
      return;
    }

    if (protectTestArmed) {
      const { pwdHex } = protectTestArmed;
      protectTestArmed = null; // one test per arm
      try {
        broadcast('reading', {});
        const result = await attemptPasswordAuth(reader, pwdHex);
        broadcast('protect-test-result', result);
      } catch (err) {
        broadcast('protect-test-result', { correctPassword: false, reason: err.message });
      }
      return;
    }

    if (recoverArmed) {
      const { pwdHex } = recoverArmed;
      recoverArmed = null; // one recovery per arm
      try {
        broadcast('reading', {});
        await unlockAndBlankCard(reader, pwdHex);
        broadcast('recover-success', {});
      } catch (err) {
        broadcast('recover-error', { message: err.message });
      }
      return;
    }

    if (readModeArmed) {
      readModeArmed = false; // one read per arm, same pattern as write jobs
      try {
        broadcast('reading', {});
        // Lock status is checked independently of the URL -- a blank or
        // unreadable card can still be meaningfully reported as
        // "unprotected" (its CFG0 page is readable either way), so a
        // failure to find a URL shouldn't hide the lock answer.
        const lockStatus = await checkLockStatus(reader).catch((err) => ({ error: err.message }));

        let url = null;
        let urlError = null;
        try {
          ({ url } = await readNdefUri(reader));
        } catch (err) {
          urlError = err.message;
        }

        broadcast('read-result', { url, urlError, lockStatus });
      } catch (err) {
        broadcast('read-error', { message: err.message });
      }
      return;
    }

    if (!armedJob) {
      broadcast('card-ignored', { reason: 'No client selected -- pick one in the app first.' });
      return;
    }

    const job = armedJob;
    armedJob = null; // one card per arm -- prevents a second stray tap from reusing the same job

    try {
      broadcast('writing', { fullName: job.fullName });
      await writeNdef(reader, job.url);

      broadcast('verifying', {});
      await verifyWrite(reader, job.url);

      broadcast('locking', {});
      await lockCard(reader, job.pwdBytes, job.packBytes);

      const chipPasswordHash = hashPassword(job.pwdBytes);
      const markRes = await fetch(`${BACKEND_URL}/api/admin/encode/mark-encoded/${job.clientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ chipPasswordHash }),
      });
      if (!markRes.ok) {
        const markBody = await markRes.json().catch(() => ({}));
        throw new Error(
          `Card was written and locked successfully, but saving that to the database failed: ${markBody.error || markRes.status}. The physical card is fine -- this needs fixing on the admin side.`
        );
      }

      broadcast('success', {
        fullName: job.fullName,
        clientId: job.clientId,
        chipPassword: job.pwdBytes.toString('hex').toUpperCase(),
      });
    } catch (err) {
      broadcast('error', { fullName: job.fullName, message: err.message });
    }
  });

  reader.on('error', (err) => broadcast('reader-error', { message: err.message }));
});

nfc.on('error', (err) => broadcast('nfc-error', { message: err.message }));

const server = app.listen(PORT, () => {
  console.log(`\nHuntsTAG encode tool (GUI) running.`);
  console.log(`Open this in your browser:  http://localhost:${PORT}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Almost always means either the app is already running somewhere
    // (Electron's single-instance lock in main.js should prevent this
    // case entirely) or a genuinely stuck leftover process is still
    // holding the port from a previous crash. main.js listens on this
    // same server object to show an actionable dialog instead of this
    // becoming an uncaught exception -- this console line is just for
    // visibility when running via plain `npm run gui`.
    console.error(`\nPort ${PORT} is already in use -- the app may already be running.\n`);
    return;
  }
  console.error('\nFailed to start the local server:', err.message, '\n');
});

module.exports = { server };
