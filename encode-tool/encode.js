/**
 * huntsTAG NFC encode tool -- terminal version
 * -----------------------------------------------------------------------
 * Runs LOCALLY on the machine with the ACR1252U plugged in -- this is NOT
 * a web app, because browsers cannot talk to PC/SC smart-card readers
 * directly. Talks to the backend over the SAME authenticated admin API
 * gui-server.js uses (no direct MongoDB connection -- an earlier version
 * of this file connected straight to Mongo with its own connection
 * string, which meant anyone who ever extracted that string from this
 * tool, once packaged and installed on multiple employees' machines,
 * could read/write the whole clients collection with no login at all).
 *
 * Flow per card:
 *   1. List paid clients who've never had a first card, let you pick one
 *   2. Reserve a new card slot from the backend (a client can have
 *      several cards now, see backend/models/Card.js) -- this hands back
 *      a cardNumber that gets written into the chip's own URL, so this
 *      specific physical card can later be individually deactivated
 *   3. Generate a random 4-byte (32-bit) write password -- this matches
 *      the NTAG216 hardware spec exactly: the PWD register is 4 bytes,
 *      full stop. (Note: the original report described this as a
 *      "12-character password" -- that's a fine human-facing label for
 *      the hex representation, but the actual chip field the hardware
 *      exposes is 4 bytes / 8 hex characters. Worth knowing so the
 *      number doesn't look "wrong" when you see it printed.)
 *   4. Write the NDEF URI record (https://huntstag.com/c/{clientId}?card={N})
 *      to the chip's user memory
 *   5. Read it back and confirm it matches, BEFORE locking -- catches a
 *      bad write while it's still cheap to fix (unlocked cards can just
 *      be rewritten; locked ones can't without the password)
 *   6. Set the password lock: write-protect user memory from page 4
 *      onward (read stays open to everyone, per the design we agreed on)
 *   7. POST the RAW password to the backend, which encrypts it at rest
 *      (see backend/utils/crypto.js) so an admin can look it up later --
 *      unlike the old one-way-hashed model, where it was gone for good
 *      the moment this step ran
 *
 * IMPORTANT: the exact low-level page-write behaviour (steps 4-5) is
 * written against the NTAG216 datasheet and nfc-pcsc's documented API,
 * but reader/firmware quirks are common in this space. Test the full
 * write -> lock -> tap-on-a-real-phone -> attempt-unauthorized-rewrite
 * cycle on ONE card before running a real batch.
 *
 * ACCESS CONTROL: this tool refuses to do anything until you log in with
 * an admin account (checked against the backend's /api/admin/auth/login
 * endpoint). Clients never have credentials that pass this check -- the
 * only way to write a card is to be a real admin. Combined with the tool
 * only running on a machine physically wired to the reader, this is what
 * makes "only admin can write the card" actually true, not just assumed.
 * An admin still on a temp password (freshly invited, hasn't logged into
 * the admin webpage to set a real one yet) is also blocked here.
 */

require('dotenv').config();
const { NFC } = require('nfc-pcsc');
const readline = require('readline');
const crypto = require('crypto');
const { writeNdef, verifyWrite, lockCard } = require('./lib');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// No Mongo connection to close anymore (see header comment) -- just the
// readline interface. NOT calling process.exit() directly: forcing an
// exit while OS-level handles (console I/O) are still being torn down is
// what triggers the libuv "UV_HANDLE_CLOSING" assertion on Windows.
// Setting exitCode and returning avoids that entirely.
function cleanExit(code) {
  process.exitCode = code;
  rl.close();
}

// NDEF construction and write/verify/lock live in ./lib.js now -- shared
// with gui-server.js so the two never drift.

// ---------------------------------------------------------------------
// Admin login gate -- nothing below this runs until it succeeds
// ---------------------------------------------------------------------

async function requireAdminLogin(backendUrl) {
  console.log('=== Admin login required to write to any card ===');
  const email = await ask('Admin email: ');
  // Node's readline doesn't mask input out of the box; fine for a local
  // tool used by one or two trusted operators, but swap in a masked
  // prompt (e.g. the "prompts" package) before handing this to a wider
  // ops team.
  const password = await ask('Admin password: ');

  const res = await fetch(`${backendUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Admin login failed (HTTP ${res.status})`);
  }

  const body = await res.json();

  // An invited team member still on their temp password shouldn't be
  // writing cards yet -- that temp password may have passed through
  // SMS/WhatsApp/email and could be known to more than just them. Make
  // them set a real password on the admin webpage first.
  if (body.mustChangePassword) {
    throw new Error(
      'This admin account is still on a temporary password. Log into the admin webpage and set a real password before using this tool.'
    );
  }

  console.log(`✅ Admin login OK (${email}).\n`);
  return { token: body.token, adminEmail: email.toLowerCase() };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  const { token } = await requireAdminLogin(backendUrl);
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const pendingRes = await fetch(`${backendUrl}/api/admin/encode/pending`, { headers: authHeaders });
  const pending = await pendingRes.json().catch(() => []);
  if (!pendingRes.ok) throw new Error(pending.error || 'Could not load pending clients');
  if (pending.length === 0) {
    console.log('No paid clients awaiting a first card found.');
    cleanExit(0);
    return; // unreachable -- cleanExit always exits; keeps linters happy
  }

  console.log('\nPaid clients awaiting a first card:');
  pending.forEach((c, i) => console.log(`  ${i + 1}. ${c.fullName}  (${c.clientId})  [${c.cardType || 'no plan set'}]`));
  const choice = await ask('\nSelect a client number: ');
  const client = pending[parseInt(choice, 10) - 1];
  if (!client) {
    console.log('Invalid selection.');
    cleanExit(1);
    return;
  }

  // Reserve a new card slot BEFORE writing, so the chip's own URL can
  // carry the resulting cardNumber (see header comment).
  const cardRes = await fetch(`${backendUrl}/api/admin/clients/${client.clientId}/cards`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ cardType: client.cardType }),
  });
  const cardBody = await cardRes.json().catch(() => ({}));
  if (!cardRes.ok) throw new Error(cardBody.error || 'Could not reserve a card slot');
  const { cardId, cardNumber } = cardBody;

  const url = `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}?card=${cardNumber}`;
  const pwdBytes = crypto.randomBytes(4);
  const packBytes = crypto.randomBytes(2);

  console.log(`\nCard #${cardNumber} for ${client.fullName}. Will write: ${url}`);
  console.log(`Generated chip password: ${pwdBytes.toString('hex').toUpperCase()}`);
  console.log('(Also saved encrypted in the database -- an admin can look it up later if needed.)\n');

  // nfc-pcsc watches the OS's PC/SC service and fires 'reader' the moment
  // it sees a compatible device -- this is the auto-detect behavior you
  // asked for: plug the ACR1252U in (or it's already plugged in when you
  // start the tool) and this fires with no further setup on your end.
  console.log('Watching for an NFC reader... plug in the ACR1252U now if it isn\'t connected.');
  const nfc = new NFC();

  nfc.on('reader', (reader) => {
    console.log(`\n🔌 Reader detected automatically: ${reader.reader.name}`);
    console.log('Place a blank NTAG216 card on it...');

    reader.on('end', () => {
      console.log(`\n🔌 Reader disconnected: ${reader.reader.name}. Re-plug it to continue.`);
    });

    reader.on('card', async () => {
      try {
        console.log('Card detected. Writing NDEF URI record...');
        await writeNdef(reader, url);

        console.log('Verifying write before locking...');
        await verifyWrite(reader, url);

        console.log('Setting password lock...');
        await lockCard(reader, pwdBytes, packBytes);

        const markRes = await fetch(`${backendUrl}/api/admin/cards/${cardId}/mark-encoded`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ chipPassword: pwdBytes.toString('hex').toUpperCase() }),
        });
        if (!markRes.ok) {
          const markBody = await markRes.json().catch(() => ({}));
          throw new Error(
            `Card was written and locked successfully, but saving that to the database failed: ${markBody.error || markRes.status}. The physical card is fine -- this needs fixing on the admin side.`
          );
        }

        console.log('✅ Done. Card encoded and database updated.');
        console.log('Next: tap this card on a real Android phone AND an iPhone 7+ to confirm the profile page opens before shipping it.');
        cleanExit(0);
      } catch (err) {
        console.error('❌ Encoding failed:', err.message);
        cleanExit(1);
      }
    });

    reader.on('error', (err) => console.error('Reader error:', err.message));
  });

  nfc.on('error', (err) => console.error('NFC error:', err.message));
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
  rl.close();
});
