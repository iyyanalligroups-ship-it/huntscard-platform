// One place for the password rules every client-facing password field follows.
// (The backend enforces the same minimum -- keep MIN_PASSWORD_LENGTH in sync with routes/auth.js.)
export const MIN_PASSWORD_LENGTH = 6;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

// Returns an error message, or '' when the new password (and its confirmation, if given) is fine.
export function validateNewPassword(password, confirm) {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (confirm !== undefined && password !== confirm) return 'Passwords do not match.';
  return '';
}
