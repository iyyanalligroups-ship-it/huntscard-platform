const crypto = require('crypto');

// This codebase's first REVERSIBLE-encryption utility -- every other
// secret here (login passwords, OTPs, reset tokens, the old chip-password
// field) is one-way hashed, because nothing else needs to be shown back
// to anyone. The admin-viewable card password (see models/Card.js) is a
// deliberate exception -- it needs to be recoverable for display, so it's
// encrypted at rest instead of hashed, keyed off CARD_PASSWORD_ENCRYPTION_KEY
// (same one-time-setup precedent as the VAPID keypair generated for tap
// notifications: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
// stored in .env, never committed).

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM

function getKey() {
  const hex = process.env.CARD_PASSWORD_ENCRYPTION_KEY;
  if (!hex) throw new Error('CARD_PASSWORD_ENCRYPTION_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('CARD_PASSWORD_ENCRYPTION_KEY must be a 32-byte (64 hex char) key');
  return key;
}

// Returns "iv:authTag:ciphertext" (all hex) -- self-contained, so decrypt
// doesn't need anything else stored alongside it.
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

function decrypt(stored) {
  const [ivHex, authTagHex, ciphertextHex] = String(stored).split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted value');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
