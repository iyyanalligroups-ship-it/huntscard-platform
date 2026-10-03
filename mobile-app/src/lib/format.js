export const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

export function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(value, options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, options);
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '';
}

export function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function roundUpToNext5Min(date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5);
  return rounded;
}

export function waNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function initialsOf(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

export function onlyDigits(value, max) {
  const digits = String(value || '').replace(/\D/g, '');
  return max ? digits.slice(0, max) : digits;
}

export function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function stripProtocol(url) {
  return String(url || '').replace(/^https?:\/\//, '');
}

export function youtubeId(url) {
  if (!url) return null;
  const patterns = [/youtube\.com\/shorts\/([\w-]+)/, /youtube\.com\/watch\?v=([\w-]+)/, /youtu\.be\/([\w-]+)/, /youtube\.com\/embed\/([\w-]+)/];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return match[1];
  }
  return null;
}

// Card-shape aspect (width / height) -- same 85x55mm business-card ratio the
// website's cardAspectFor() assumes until a design's real pixel size is known.
export function cardAspect(shape) {
  return shape === 'vertical' ? 55 / 85 : 85 / 55;
}
