import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Password box with a show/hide eye. Paste is never blocked. Use wrap={false} when the parent
// already provides the wrapper (e.g. the .login-input row on the recovery pages).
export default function PasswordInput({ wrap = true, ...inputProps }) {
  const [shown, setShown] = useState(false);
  const content = (
    <>
      <input {...inputProps} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-eye-btn"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </>
  );
  return wrap ? <div className="password-input-wrap">{content}</div> : content;
}
