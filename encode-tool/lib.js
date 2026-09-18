/**
 * Shared NFC/NDEF logic for the huntsTAG encode tool.
 * -----------------------------------------------------------------------
 * Used by BOTH encode.js (terminal version) and gui-server.js (local
 * browser GUI) so the two never drift out of sync -- this is the exact
 * code that already passed a real hardware write/verify/lock test, moved
 * here unchanged rather than rewritten.
 */

const crypto = require('crypto');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// NDEF construction (Type 2 Tag: TLV-wrapped NDEF URI record)
// ---------------------------------------------------------------------

// URI identifier codes per the NFC Forum URI Record Type Definition --
// these let common prefixes be stored as one byte instead of spelled out
// in the payload. 0x00 means "no abbreviation, full URI as written" and
// is the safe fallback for anything that isn't one of the well-known
// prefixes below.
const URI_PREFIXES = [
  { code: 0x04, prefix: 'https://' },
  { code: 0x03, prefix: 'http://' }, // needed for local/dev testing (PUBLIC_BASE_URL=http://localhost:4000)
];

function buildNdefUriRecord(url) {
  const match = URI_PREFIXES.find((p) => url.startsWith(p.prefix));
  const code = match ? match.code : 0x00;
  const uriRest = match ? url.slice(match.prefix.length) : url;
  const payload = Buffer.concat([Buffer.from([code]), Buffer.from(uriRest, 'ascii')]);

  const header = 0xd1; // MB=1, ME=1, CF=0, SR=1, IL=0, TNF=0x01 (well-known)
  const typeLength = 0x01;
  return Buffer.concat([
    Buffer.from([header, typeLength, payload.length]),
    Buffer.from('U', 'ascii'), // record type: URI
    payload,
  ]);
}

function wrapInTlv(ndefRecord) {
  // TLV: type 0x03 (NDEF message), length, value, terminator 0xFE
  return Buffer.concat([Buffer.from([0x03, ndefRecord.length]), ndefRecord, Buffer.from([0xfe])]);
}

function padToPages(bytes) {
  // Pages are 4 bytes each; pad the tail with zeros to a full page.
  const remainder = bytes.length % 4;
  if (remainder === 0) return bytes;
  return Buffer.concat([bytes, Buffer.alloc(4 - remainder)]);
}

// ---------------------------------------------------------------------
// Reader operations
// ---------------------------------------------------------------------

const USER_MEMORY_START_PAGE = 4; // pages 0-3 are UID/lock/OTP, off-limits

async function writeNdef(reader, url) {
  const tlv = wrapInTlv(buildNdefUriRecord(url));
  const padded = padToPages(tlv);

  for (let i = 0; i < padded.length / 4; i++) {
    const page = USER_MEMORY_START_PAGE + i;
    const chunk = padded.subarray(i * 4, i * 4 + 4);
    await reader.write(page, chunk, 4);
  }
}

// Reads back exactly what writeNdef() just wrote and confirms it matches,
// BEFORE the card gets locked -- the one chance to catch a bad write
// while it's still cheap to fix.
async function verifyWrite(reader, url) {
  const tlv = wrapInTlv(buildNdefUriRecord(url));
  const padded = padToPages(tlv);
  const pageCount = padded.length / 4;

  const chunks = [];
  for (let i = 0; i < pageCount; i++) {
    const page = USER_MEMORY_START_PAGE + i;
    const chunk = await reader.read(page, 4, 4);
    chunks.push(chunk);
  }
  const readBack = Buffer.concat(chunks);

  if (!readBack.equals(padded)) {
    throw new Error('Verification failed: data read back from the card does not match what was written.');
  }
}

// Sends a raw NTAG native command through the reader's "Direct Transmit"
// escape (FF 00 00 00 <Lc> <command>), bypassing the simplified
// Read/Write Binary abstraction that reader.read()/reader.write() use
// elsewhere in this file. That simplified path is proven reliable for
// ORDINARY user memory (pages 4+, where the profile URL lives --
// confirmed against real hardware) but is suspected unreliable for the
// tag's special configuration pages (227-230): some reader firmware
// accepts a write to those without it actually taking effect on the
// chip, while still reporting success -- which is what real-world
// testing against an independent app (NFC TagInfo-style tools) revealed
// was happening here. Native commands go straight to the tag with no
// such translation layer in between.
async function nativeTransmit(reader, nativeCommand, maxResponseLength) {
  const pseudoApdu = Buffer.concat([Buffer.from([0xff, 0x00, 0x00, 0x00, nativeCommand.length]), nativeCommand]);
  return reader.transmit(pseudoApdu, maxResponseLength);
}

// Native WRITE (single page, 4 bytes) -- command byte 0xA2.
async function nativeWritePage(reader, page, data4Bytes) {
  const command = Buffer.concat([Buffer.from([0xa2, page]), data4Bytes]);
  await nativeTransmit(reader, command, 4);
}

// Native READ (4 pages / 16 bytes starting at the given page) -- command
// byte 0x30. Used to verify a config write actually landed, with the
// same low-level path used to set it -- so the check can't be fooled by
// whatever translation quirk affected reader.read() for these pages.
async function nativeReadPages(reader, page) {
  const command = Buffer.from([0x30, page]);
  return nativeTransmit(reader, command, 18); // 16 data bytes + 2-byte status word
}

// Real hardware testing showed the raw native read above can come back
// with only a 2-byte status word (no data at all) for these config
// pages -- not a timing issue a delay fixes, but the raw Direct Transmit
// escape command itself being rejected/mishandled by this reader for
// this specific address on some attempts. Retries the native path a
// couple of times (cheap, and it does sometimes succeed), then falls
// back to the reader's own standard translated Read Binary command --
// the exact same call verifyWrite()/readNdefUri() already use reliably
// for ordinary pages elsewhere in this file. That's a different command
// path through the reader's firmware than the raw escape above, so a
// firmware quirk affecting one doesn't necessarily affect the other.
// Either way, whatever bytes come back are still independently checked
// by the caller against the exact value that was written -- this only
// changes how the bytes are fetched, not what counts as verified.
async function readConfigPageVerified(reader, page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await delay(attempt === 0 ? 150 : 350);
    try {
      const raw = await nativeReadPages(reader, page);
      if (raw && raw.length >= 4) return raw;
    } catch {
      // fall through to the next attempt / the reader.read() fallback below
    }
  }
  return reader.read(page, 4, 4);
}

// GET_VERSION (command 0x60) -- an NTAG21x-family command that returns a
// fixed 8-byte version string uniquely identifying the exact chip,
// including its real storage size. Unlike nativeReadPages/nativeWritePage
// above, this never addresses a specific page number, so it works
// identically regardless of chip size -- it's the reliable way to find
// OUT that size before assuming anything about it.
async function nativeGetVersion(reader) {
  const command = Buffer.from([0x60]);
  return nativeTransmit(reader, command, 10); // 8 data bytes + 2-byte status word
}

// Byte 6 of the GET_VERSION response is the storage-size code, which
// distinguishes the three NTAG21x family members -- this table is the
// ROOT of everything CFG0_PAGE/RECOVER_CFG0_PAGE/etc. assume elsewhere in
// this file. A real-world mixup discovered during this tool's use: some
// physical cards handed out as "NTAG216" were actually NTAG213 (45 pages
// total, vs. NTAG216's 231) -- writing this tool's hardcoded page 227
// config address to a 45-page chip doesn't address anything real on that
// chip, which is what caused those cards' lock/unlock verification to
// fail with a garbled short response no amount of retrying could fix.
const NTAG_TYPES = {
  0x0f: { name: 'NTAG213', totalPages: 45, userMemoryPages: 36 },
  0x11: { name: 'NTAG215', totalPages: 135, userMemoryPages: 126 },
  0x13: { name: 'NTAG216', totalPages: 231, userMemoryPages: 222 },
};

// Identifies whatever card is currently on the reader -- its UID (already
// known to nfc-pcsc from card detection, no extra command needed) plus
// its real chip type via GET_VERSION. Read-only, makes no assumption
// about what SHOULD be on the reader, so this is safe to run on any card
// at any time, including ones this tool doesn't support writing to.
async function identifyCard(reader, uid) {
  let version;
  try {
    version = await nativeGetVersion(reader);
  } catch (err) {
    throw new Error(`Could not read this card's version info (${err.message}). It may not be an NTAG21x chip, or the reader lost contact with it -- try tapping it again.`);
  }
  if (!version || version.length < 8) {
    throw new Error(`This card returned an unexpectedly short response (${version ? version.length : 0} bytes) to the version query -- it may not be an NTAG21x chip, or contact was lost mid-read.`);
  }

  const storageSizeByte = version[6];
  const known = NTAG_TYPES[storageSizeByte];

  return {
    uid: uid || null,
    chipType: known ? known.name : `Unknown chip (storage code 0x${storageSizeByte.toString(16).padStart(2, '0')})`,
    supported: Boolean(known) && known.name === 'NTAG216',
    totalPages: known ? known.totalPages : null,
    userMemoryPages: known ? known.userMemoryPages : null,
  };
}

// Guards every function below that writes to this tool's hardcoded
// NTAG216 config-page addresses (227-230) -- throws BEFORE touching any
// config page if the card on the reader isn't actually an NTAG216. See
// identifyCard()'s comment for the real-world mixup this exists to catch
// permanently, instead of relying on a garbled read-back to notice it
// deep into a write sequence.
async function assertNtag216(reader, uid) {
  const info = await identifyCard(reader, uid);
  if (!info.supported) {
    throw new Error(
      `This card is ${info.chipType}, not NTAG216 -- this tool's password lock only supports NTAG216 (231 pages). Use "Card type analyser" to check a card before writing to it. Do not attempt to lock or unlock this card.`
    );
  }
}

// Performs a real PWD_AUTH against the tag and returns the 2-byte PACK
// the chip sends back, or throws if the tag rejects the password. This
// is the ONE thing that can't lie about whether a password is actually
// active on the chip right now -- unlike a raw config-page write (see
// nativeTransmit's comment above), the chip's own authentication
// response is authoritative.
async function nativeAuth(reader, pwdBytes) {
  const command = Buffer.concat([Buffer.from([0x1b]), pwdBytes]);
  const response = await nativeTransmit(reader, command, 40);
  // A genuine successful PWD_AUTH returns the 2-byte PACK plus the
  // reader's own 2-byte completion signal -- 4 bytes total. A REJECTED
  // auth can come back as just the bare 2-byte completion signal with no
  // real PACK data (the tag simply doesn't respond to a bad password,
  // and some readers report that as "command completed" rather than
  // throwing) -- so anything shorter than 4 bytes is not a real success,
  // even though it technically "returned something."
  if (!response || response.length < 4) {
    throw new Error(`Card did not return a real PACK value (got ${response ? response.length : 0} bytes) -- password rejected`);
  }
  return response.subarray(0, 2);
}

async function lockCard(reader, pwdBytes, packBytes) {
  // Confirm this is actually an NTAG216 BEFORE touching any config page --
  // see assertNtag216()'s comment for the real-world mixup (some "NTAG216"
  // cards turned out to be NTAG213) this exists to catch immediately
  // instead of via a garbled read-back deep into the write sequence.
  await assertNtag216(reader);

  // NTAG216 configuration pages (fixed addresses per datasheet):
  //   227 = CFG0 [MIRROR, RFUI, MIRROR_PAGE, AUTH0]
  //   228 = CFG1 [ACCESS, RFUI, RFUI, VCTID]
  //   229 = PWD  [4-byte write password]
  //   230 = PACK [2-byte ack, + 2 bytes RFUI]
  const CFG0_PAGE = 227;
  const CFG1_PAGE = 228;
  const PWD_PAGE = 229;
  const PACK_PAGE = 230;

  // Config pages written via the RAW native command, not reader.write().
  await nativeWritePage(reader, PWD_PAGE, pwdBytes);

  const packPage = Buffer.concat([packBytes, Buffer.alloc(2)]);
  await nativeWritePage(reader, PACK_PAGE, packPage);

  // ACCESS byte: bit7 PROT=0 means "password required to WRITE only,
  // READ stays open to everyone" -- every phone still needs to read the
  // tap URL with no password.
  const accessByte = 0x00;
  const cfg1 = Buffer.from([accessByte, 0x00, 0x00, 0x00]);
  await nativeWritePage(reader, CFG1_PAGE, cfg1);

  // AUTH0 = first page requiring the password. Set to the start of user
  // memory (4) to protect the entire NDEF record. Written LAST -- this is
  // what actually activates protection, so doing it last avoids locking
  // yourself out mid-sequence.
  const AUTH0_VALUE = USER_MEMORY_START_PAGE;
  const cfg0 = Buffer.from([0x00, 0x00, 0x00, AUTH0_VALUE]);
  await nativeWritePage(reader, CFG0_PAGE, cfg0);

  // Verify AUTH0 actually took -- don't just trust that the write above
  // didn't throw. See readConfigPageVerified()'s comment for why this
  // isn't a single raw read anymore.
  let readBack;
  try {
    readBack = await readConfigPageVerified(reader, CFG0_PAGE);
  } catch (err) {
    throw new Error(
      `Lock verification failed: could not read back the protection flag after several attempts (${err.message}). Treat this card as NOT successfully locked.`
    );
  }
  if (!readBack || readBack.length < 4) {
    throw new Error(
      `Lock verification failed: the reader returned an unexpectedly short response (${readBack ? readBack.length : 0} bytes) reading back the protection flag. Treat this card as NOT successfully locked.`
    );
  }
  const auth0Confirmed = readBack[3];
  if (auth0Confirmed !== AUTH0_VALUE) {
    throw new Error(
      `Lock verification failed: wrote AUTH0=${AUTH0_VALUE} but reading it back shows ${auth0Confirmed}. The card may not actually be protected -- do not treat this as a successful lock.`
    );
  }

  // Verify the PASSWORD itself actually took -- this is the check that
  // was missing before. A config-page write reporting success does not
  // guarantee the chip's stored value actually changed (see
  // nativeTransmit's comment). The only trustworthy proof is the chip's
  // own PWD_AUTH response: authenticate with the password we JUST wrote
  // and require the returned PACK to exactly match the PACK we also just
  // wrote. If the PWD write silently didn't take effect, the chip is
  // still holding whatever password it had before, and this either
  // rejects outright or returns a PACK that doesn't match -- either way,
  // this catches it instead of silently leaving the old password active.
  let authPack;
  try {
    authPack = await nativeAuth(reader, pwdBytes);
  } catch (err) {
    throw new Error(
      `Password verification failed: authenticating with the newly-written password was rejected by the card (${err.message}). The password write likely did not take effect -- an old password may still be active. Do not treat this as a successful lock.`
    );
  }
  if (!authPack.equals(packBytes)) {
    throw new Error(
      `Password verification failed: authenticating with the newly-written password returned PACK ${authPack.toString('hex').toUpperCase()}, expected ${packBytes.toString('hex').toUpperCase()}. The password write likely did not take effect -- an old password may still be active. Do not treat this as a successful lock.`
    );
  }
}

function hashPassword(pwdBytes) {
  return crypto.createHash('sha256').update(pwdBytes).digest('hex');
}

// Reads back whatever NDEF URI record is actually stored on a card,
// independent of any expected value -- used by the GUI's "Read a card"
// mode to test/inspect any card (freshly written, written long ago, or
// unknown) without needing to tap it on a phone. Read access is never
// password-protected by this tool's lock design, so this works on
// already-locked cards too.
async function readNdefUri(reader) {
  const first = await reader.read(USER_MEMORY_START_PAGE, 4, 4);
  const tlvType = first[0];

  if (tlvType === 0x00 || tlvType === 0xff) {
    throw new Error('This card looks blank -- no data found.');
  }
  if (tlvType !== 0x03) {
    throw new Error(`Unrecognized data on this card (TLV type 0x${tlvType.toString(16)}) -- probably not written by this tool.`);
  }

  const tlvLength = first[1];
  if (tlvLength === 0xff) {
    throw new Error('This card uses a data format this tool does not support (long-form TLV). Probably not written by this tool.');
  }

  // 2 header bytes (TLV type + length) + the record itself + 1 terminator
  // byte, rounded up to a whole number of pages.
  const totalBytes = 2 + tlvLength + 1;
  const totalPages = Math.ceil(totalBytes / 4);

  const chunks = [first];
  for (let i = 1; i < totalPages; i++) {
    chunks.push(await reader.read(USER_MEMORY_START_PAGE + i, 4, 4));
  }
  const all = Buffer.concat(chunks);
  const ndef = all.subarray(2, 2 + tlvLength);

  const typeLength = ndef[1];
  const payloadLength = ndef[2];
  const recordType = ndef.subarray(3, 3 + typeLength).toString('ascii');

  if (recordType !== 'U') {
    throw new Error(`This card contains a "${recordType}" record, not a link -- can't display it as a URL.`);
  }

  const payload = ndef.subarray(3 + typeLength, 3 + typeLength + payloadLength);
  const code = payload[0];
  const rest = payload.subarray(1).toString('ascii');
  const match = URI_PREFIXES.find((p) => p.code === code);
  const url = (match ? match.prefix : '') + rest;

  return { url };
}

// Checks whether this tool's password lock is actually active on a card
// -- by attempting a REAL write and seeing if it's rejected, not by
// reading and interpreting a configuration byte. An earlier version of
// this function read the CFG0 page and inferred lock status from the
// AUTH0 byte; that gave a wrong answer on real hardware for a card that
// was independently proven locked (a genuine 0x6300 authentication error
// on a real rewrite attempt). Interpreting a raw config byte can behave
// unreliably across reader/chip firmware in ways a software simulation
// won't catch -- so this checks the actual operation that matters
// (can this tool write to it right now?) instead of a proxy for it.
//
// Safety: this writes back the EXACT SAME bytes the page already holds,
// so even on an unlocked card nothing is changed -- it's a no-op write,
// not a real modification.
async function checkLockStatus(reader) {
  const testPage = USER_MEMORY_START_PAGE; // page 4 -- first page of the NDEF data every card already has
  const existing = await reader.read(testPage, 4, 4);

  try {
    await reader.write(testPage, existing, 4);
    return { locked: false };
  } catch (err) {
    // Any failure writing to a page >= AUTH0 without the password means
    // the lock is active. We don't try to distinguish error types here --
    // a write that should have trivially succeeded (identical bytes) and
    // didn't is the definition of "locked" for this tool's purposes.
    return { locked: true };
  }
}

// Attempts the tag's native PWD_AUTH command with a specific password --
// the strongest possible test, since it doesn't just detect "is this
// locked" but verifies a SPECIFIC password genuinely unlocks it. This
// sends a raw command through the reader's "Direct Transmit" escape
// (the standard way ACR122U/ACR1252U-family readers pass through
// commands the chip understands natively but aren't part of the
// simplified Read/Write Binary set used elsewhere in this file).
//
// NOTE: unlike writeNdef/verifyWrite/lockCard/readNdefUri (all proven
// against real hardware earlier in testing), this is the first time this
// exact command path has been tried on a real reader. Test it carefully
// -- if it behaves unexpectedly, the read/write functions above remain
// the trusted, verified path.
async function attemptPasswordAuth(reader, pwdHex) {
  const pwdBytes = Buffer.from(pwdHex, 'hex');
  if (pwdBytes.length !== 4) {
    throw new Error('Password must be exactly 8 hex characters (4 bytes) -- e.g. 9C9707C8');
  }

  try {
    const pack = await nativeAuth(reader, pwdBytes);
    return { correctPassword: true, pack: pack.toString('hex').toUpperCase() };
  } catch (err) {
    // A thrown error here (including a too-short/invalid response, now
    // checked explicitly inside nativeAuth rather than just trusting
    // "the call didn't throw") means the tag rejected the password.
    return { correctPassword: false, reason: err.message };
  }
}

// A page far outside any realistic NDEF payload huntsTAG ever writes
// (a short "huntstag.com/c/{clientId}" URL only occupies roughly pages
// 4-16). Used ONLY for this rewrite test -- writing test data here can
// never corrupt a card's real profile URL, even if the write succeeds
// (i.e. even if the card turns out to be unprotected).
const SCRATCH_TEST_PAGE = 200;

// The most direct, real-world test there is: actually attempt to write
// new data to the card (optionally after authenticating with a
// password first) and report plainly whether the card accepted it.
// This is what a genuine third-party rewrite attempt looks like --
// not a silent/idempotent check, an actual write with real content.
async function attemptRewriteTest(reader, testText, pwdHex) {
  if (pwdHex) {
    const pwdBytes = Buffer.from(pwdHex, 'hex');
    if (pwdBytes.length !== 4) {
      throw new Error('Password must be exactly 8 hex characters (4 bytes) -- e.g. 9C9707C8');
    }
    try {
      await nativeAuth(reader, pwdBytes);
    } catch (err) {
      // Password itself was rejected -- never even attempted the write.
      return { authAttempted: true, authSucceeded: false, writeSucceeded: false, message: `Password rejected: ${err.message}` };
    }
  }

  // Pack the test text into a single 4-byte page (truncated/padded --
  // this is a capability test, not meant to store a real message).
  const dataBytes = Buffer.alloc(4);
  Buffer.from((testText || 'TEST').slice(0, 4), 'ascii').copy(dataBytes);

  try {
    await nativeWritePage(reader, SCRATCH_TEST_PAGE, dataBytes);
    return { authAttempted: !!pwdHex, authSucceeded: !!pwdHex, writeSucceeded: true };
  } catch (err) {
    return { authAttempted: !!pwdHex, authSucceeded: !!pwdHex, writeSucceeded: false, message: err.message };
  }
}

// -----------------------------------------------------------------------
// Recovery: unlock an already-locked card using its KNOWN password, wipe
// its NDEF content, and disable password protection entirely -- puts the
// card back in the same blank/unlocked state a brand-new NTAG216 is in,
// so it can go through the normal Write/Create-a-card flow again from
// scratch (fresh URL, fresh password). This is the ONLY way this tool
// can touch an already-locked card -- everything else (writeNdef,
// lockCard) assumes a card that isn't protected yet.
// -----------------------------------------------------------------------

const RECOVER_CFG0_PAGE = 227;
// Generously covers any realistic NDEF payload this tool ever writes --
// a short "huntstag.com/c/{clientId}" URL only occupies roughly pages
// 4-16 (see attemptRewriteTest's SCRATCH_TEST_PAGE comment above), so
// wiping through page 19 clears it with margin to spare.
const RECOVER_BLANK_PAGE_COUNT = 16;

// Shared by unlockAndBlankCard (password-protected cards) and
// blankUnprotectedCard (cards with no password at all) -- wipes the NDEF
// content and ensures AUTH0=0xFF (no protection), with the same
// defensive read-back verification lockCard() uses for its own
// config-page writes. Assumes the caller has already done whatever
// authentication (if any) is needed to get write access to these pages.
async function wipeContentAndDisableProtection(reader) {
  // Same NTAG216-only guard lockCard() uses -- see assertNtag216()'s
  // comment. Wiping/unprotecting also writes to the hardcoded config-page
  // addresses, so this needs the exact same check before touching them.
  await assertNtag216(reader);

  // Wipe the NDEF content back to all-zero pages, using the SAME
  // reader.write() path writeNdef() uses -- that path is proven reliable
  // for ordinary user memory (pages 4+). The raw native command path is
  // only needed (and only risky) for the special configuration pages
  // below, not for this.
  for (let i = 0; i < RECOVER_BLANK_PAGE_COUNT; i++) {
    await reader.write(USER_MEMORY_START_PAGE + i, Buffer.alloc(4), 4);
  }

  // AUTH0 = 0xFF disables password protection entirely -- 0xFF sits
  // outside the tag's valid page range, so the chip treats NO page as
  // protected. Written after the content wipe, same "activate/deactivate
  // last" principle lockCard() uses when turning protection ON.
  const cfg0 = Buffer.from([0x00, 0x00, 0x00, 0xff]);
  await nativeWritePage(reader, RECOVER_CFG0_PAGE, cfg0);

  // Verify with the same read-with-fallback path lockCard() uses -- don't
  // just trust the write above didn't throw (see readConfigPageVerified()'s
  // comment for why this isn't a single raw read).
  let readBack;
  try {
    readBack = await readConfigPageVerified(reader, RECOVER_CFG0_PAGE);
  } catch (err) {
    throw new Error(
      `Unlock verification failed: could not read back the protection flag after several attempts (${err.message}). The card may still be protected -- do not treat this as successfully unlocked.`
    );
  }
  if (!readBack || readBack.length < 4) {
    throw new Error(
      `Unlock verification failed: the reader returned an unexpectedly short response (${readBack ? readBack.length : 0} bytes) reading back the protection flag. The card may still be protected -- do not treat this as successfully unlocked.`
    );
  }
  const auth0Confirmed = readBack[3];
  if (auth0Confirmed !== 0xff) {
    throw new Error(
      `Unlock verification failed: wrote AUTH0=0xFF but reading it back shows ${auth0Confirmed}. The card may still be protected -- do not treat this as successfully unlocked.`
    );
  }
}

async function unlockAndBlankCard(reader, pwdHex) {
  const pwdBytes = Buffer.from(pwdHex, 'hex');
  if (pwdBytes.length !== 4) {
    throw new Error('Password must be exactly 8 hex characters (4 bytes) -- e.g. 9C9707C8');
  }

  // Authenticate FIRST -- this is what actually grants write access to
  // the protected pages for the remainder of this tag session. If the
  // password is wrong, this throws and nothing below ever runs, so a
  // wrong password can't partially wipe a card.
  try {
    await nativeAuth(reader, pwdBytes);
  } catch (err) {
    throw new Error(`Password rejected -- this is not the correct password for this card. (${err.message})`);
  }

  await wipeContentAndDisableProtection(reader);
}

// For a card that was NEVER password-locked (or a lock attempt failed
// partway through and left it unclear, see the "unexpectedly short
// response" error case) -- no PWD_AUTH step at all, since there's no
// password to authenticate with. If the card actually IS protected, the
// write below will simply fail/throw (a protected page rejects an
// unauthenticated write) rather than silently corrupting anything.
async function blankUnprotectedCard(reader) {
  try {
    await wipeContentAndDisableProtection(reader);
  } catch (err) {
    // Status word 6300 from a write is specifically "rejected, no auth
    // provided" (see checkLockStatus()'s comment) -- the reliable signal
    // this card actually IS password-protected, not the unrelated variety
    // of other things that can go wrong here (reader dropped the card,
    // wrong chip type, etc, which this deliberately leaves as-is so real
    // errors aren't masked behind a wrong explanation).
    if (/6300/i.test(err.message)) {
      throw new Error(
        'This card is password-protected, so it can\'t be blanked without its password. Use "Unlock & wipe this card" (the Recover a card tab) with that card\'s actual password instead -- look it up on the client\'s Cards section in the admin panel if you don\'t have it handy.'
      );
    }
    throw err;
  }
}

module.exports = {
  writeNdef, verifyWrite, lockCard, hashPassword, readNdefUri, checkLockStatus, attemptPasswordAuth, attemptRewriteTest,
  unlockAndBlankCard, blankUnprotectedCard, identifyCard, assertNtag216,
  USER_MEMORY_START_PAGE,
};
