// The full website's <Link> pointed at its own routes; here there is only the
// camera, so those links open the website instead.
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');

export default function Link({ to, children, ...props }) {
  return <a href={`${SITE_URL}${to}`} {...props}>{children}</a>;
}
