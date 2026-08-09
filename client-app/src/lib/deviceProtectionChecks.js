// Browser equivalent of the mobile app's on-device Device Protection Check
// (see mobile-app/src/screens/DeviceSafetyCheckScreen.js and its
// lib/deviceSafetyChecks.js). That version can check real OS-level things
// (Play Protect status, installed apps) through a native module -- none of
// that is reachable from a website, a browser tab is sandboxed away from
// the OS entirely. HTTPS is the only one of the app's three checks that
// has any real equivalent here, so this is deliberately just that one
// check, not a parallel feature. No network calls, no scanning.
export async function evaluateChecks() {
  const items = [];

  const secure = typeof window !== 'undefined' && window.isSecureContext;
  items.push({
    key: 'https',
    label: 'Secure connection',
    state: secure ? 'pass' : 'fail',
    detail: secure
      ? 'This page is loaded over a secure, encrypted (HTTPS) connection.'
      : 'This page is not loaded over a secure connection.',
    explain:
      'HTTPS encrypts everything sent between your browser and HuntsTAG so it can’t be read or altered in transit.',
  });

  const passCount = items.filter((item) => item.state === 'pass').length;
  return { items, passCount, total: items.length };
}
