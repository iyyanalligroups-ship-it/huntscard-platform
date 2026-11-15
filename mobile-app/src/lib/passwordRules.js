// One place for the password rules every password field follows (same as the website; the backend enforces it too).
export const MIN_PASSWORD_LENGTH = 6;

// Live message shown under a "new password" field while typing ('' when fine).
export function newPasswordError(password, other = '') {
  if (!password) return '';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters (${password.length}/${MIN_PASSWORD_LENGTH}).`;
  if (other && password === other) return 'Choose a password different from the temporary one.';
  return '';
}

export const confirmError = (password, confirm) => (confirm && password !== confirm ? 'Passwords do not match.' : '');
