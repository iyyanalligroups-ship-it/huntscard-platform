/**
 * HuntsTAG NFC encode tool
 * -----------------------------------------------------------------------
 * Runs LOCALLY on the machine with the ACR1252U plugged in -- this is NOT
 * a web app, because browsers cannot talk to PC/SC smart-card readers
 * directly. It connects to the SAME MongoDB database as the website
 * backend, but only ever touches admin/system fields (paid, chipEncoded,
 * chipPasswordHash, encodedAt) -- never profile content.
 *
 * Flow per card:
 *   1. List paid clients who aren't encoded yet, let you pick one
 *   2. Generate a random 4-byte (32-bit) write password -- this matches
 *      the NTAG216 hardware spec exactly: the PWD register is 4 bytes,
 *      full stop. (Note: the original report described this as a
 *      "12-character password" -- that's a fine human-facing label for
 *      the hex representation, but the actual chip field the hardware
 *      exposes is 4 bytes / 8 hex characters. Worth knowing so the
 *      number doesn't look "wrong" when you see it printed.)
 *   3. Write the NDEF URI record (https://huntstag.com/c/{clientId}) to the
 *      chip's user memory
 *   4. Read it back and confirm it matches, BEFORE locking -- catches a
 *      bad write while it's still cheap to fix (unlocked cards can just
 *      be rewritten; locked ones can't without the password)
 *   5. Set the password lock: write-protect user memory from page 4
 *      onward (read stays open to everyone, per the design we agreed on)
 *   6. Update the client's DB record: chipEncoded, chipPasswordHash,
 *      encodedAt, encodedBy (which admin did this, for audit)
 *
 * IMPORTANT: the exact low-level page-write behaviour (steps 3-4) is
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
const { MongoClient } = require('mongodb');
const { NFC } = require('nfc-pcsc');
const readline = require('readline');
const crypto = require('crypto');
const { writeNdef, verifyWrite, lockCard, hashPassword } = require('./lib');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// Every exit path must close BOTH the readline interface and the Mongo
// connection, then let Node exit ON ITS OWN once the event loop has
// nothing left to do -- NOT call process.exit() directly. Forcing an
// exit while OS-level handles (console I/O, TCP sockets) are still being
// torn down is what triggers the libuv "UV_HANDLE_CLOSING" assertion on
// Windows. Setting exitCode and returning avoids that entirely.
async function cleanExit(code, mongo) {
  process.exitCode = code;
  rl.close();
  if (mongo) await mongo.close().catch(() => {});
  // No process.exit() here -- once callers return, Node has nothing left
  // to keep it alive and exits naturally with the exitCode set above.
}

// NDEF construction, write/verify/lock, and password hashing all live in
// ./lib.js now -- shared with gui-server.js so the two never drift.

// ---------------------------------------------------------------------
// Admin login gate -- nothing below this runs until it succeeds
// ---------------------------------------------------------------------

async function requireAdminLogin() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

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
  const { adminEmail } = await requireAdminLogin();

  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  const clients = mongo.db().collection('clients');

  const pending = await clients.find({ paid: true, chipEncoded: false }).toArray();
  if (pending.length === 0) {
    console.log('No paid, unencoded clients found.');
    await cleanExit(0, mongo);
    return; // unreachable -- cleanExit always exits; keeps linters happy
  }

  console.log('\nPaid clients awaiting encoding:');
  pending.forEach((c, i) => console.log(`  ${i + 1}. ${c.fullName}  (${c.clientId})  [${c.cardType || 'no plan set'}]`));
  const choice = await ask('\nSelect a client number: ');
  const client = pending[parseInt(choice, 10) - 1];
  if (!client) {
    console.log('Invalid selection.');
    await cleanExit(1, mongo);
    return;
  }

  const url = `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}`;
  const pwdBytes = crypto.randomBytes(4);
  const packBytes = crypto.randomBytes(2);

  console.log(`\nWill write: ${url}`);
  console.log(`Generated chip password: ${pwdBytes.toString('hex').toUpperCase()}`);
  console.log('⚠️  Write this down / screenshot it now. If it is lost after locking, the tag cannot be recovered.\n');

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

        await clients.updateOne(
          { clientId: client.clientId },
          {
            $set: {
              chipEncoded: true,
              chipPasswordHash: hashPassword(pwdBytes),
              encodedAt: new Date(),
              encodedBy: adminEmail,
            },
          }
        );

        console.log('✅ Done. Card encoded and database updated.');
        console.log('Next: tap this card on a real Android phone AND an iPhone 7+ to confirm the profile page opens before shipping it.');
        await cleanExit(0, mongo);
      } catch (err) {
        console.error('❌ Encoding failed:', err.message);
        await cleanExit(1, mongo);
      }
    });

    reader.on('error', (err) => console.error('Reader error:', err.message));
  });

  nfc.on('error', (err) => console.error('NFC error:', err.message));
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
  rl.close(); // mongo may not exist yet at this point (e.g. login itself failed) -- rl always does
});
