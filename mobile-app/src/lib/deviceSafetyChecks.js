import { openWifiSettings, openPlayProtectSettings, openAppInfo } from '../native/deviceSafety.js';

// Turns the raw native status (see android/.../DeviceSafetyModule.kt) into
// the checklist this screen renders. `state` is one of 'pass' | 'warn' |
// 'fail' | 'unknown' -- 'unknown' is used whenever a value genuinely can't
// be determined (no public API, or an older Android version), rather than
// guessing and calling it pass or warn. 'fail' is reserved for the known-
// hacking-tool check specifically, since that's the one place a real,
// concrete danger can be confirmed -- everything else stays at warn/unknown
// to keep the calm, non-alarmist tone the rest of this screen has.
export function evaluateChecks(status) {
  const items = [];

  const playProtect = status.playProtectStatus;
  items.push({
    key: 'playProtect',
    label: 'Google Play Protect',
    state: playProtect === 'enabled' ? 'pass' : playProtect === 'disabled' ? 'warn' : 'unknown',
    detail:
      playProtect === 'enabled'
        ? 'Play Protect appears to be turned on.'
        : playProtect === 'disabled'
          ? 'Play Protect appears to be turned off.'
          : "Couldn't determine Play Protect's status on this device.",
    explain:
      'Play Protect is Android’s built-in scanner -- it checks apps for known malware, including ones installed outside the Play Store.',
    actionLabel: 'Review Play Protect',
    onAction: openPlayProtectSettings,
  });

  const wifi = status.wifi || {};
  let wifiState = 'unknown';
  let wifiDetail = "Couldn't determine this network's security.";
  if (!wifi.connected) {
    wifiDetail = 'Not currently connected to Wi-Fi.';
  } else if (wifi.isOpen === true) {
    wifiState = 'warn';
    wifiDetail = 'Connected to an open Wi-Fi network with no password.';
  } else if (wifi.isOpen === false) {
    wifiState = 'pass';
    wifiDetail = 'Connected to a secured (password-protected) Wi-Fi network.';
  }
  items.push({
    key: 'wifi',
    label: 'Secure connection',
    state: wifiState,
    detail: wifiDetail,
    explain:
      'Open Wi-Fi networks have no encryption -- anyone nearby on the same network can potentially intercept what your phone sends and receives.',
    actionLabel: 'Wi-Fi settings',
    onAction: openWifiSettings,
  });

  const detectedTools = status.detectedTools || [];
  if (detectedTools.length === 0) {
    items.push({
      key: 'tools-clean',
      label: 'Known hacking tools',
      state: 'pass',
      detail: 'None of the known tools on this app’s list are installed.',
      explain:
        'Checks for a small list of specific, known network-attack/pentesting tools only -- not a scan of every app on your phone.',
    });
  } else {
    for (const tool of detectedTools) {
      items.push({
        key: `tool-${tool.packageName}`,
        label: tool.label,
        state: 'fail',
        detail: `${tool.label} is installed. This is dangerous if you didn’t install it yourself.`,
        explain:
          'This app is commonly used for network attacks or unauthorized access. If you don’t recognize it, consider removing it.',
        actionLabel: 'Review app',
        onAction: () => openAppInfo(tool.packageName),
      });
    }
  }

  // Score only what was actually determinable -- an 'unknown' item
  // shouldn't make the header look like something failed when it simply
  // couldn't be read.
  const scorable = items.filter((item) => item.state !== 'unknown');
  const passCount = scorable.filter((item) => item.state === 'pass').length;
  return { items, passCount, total: scorable.length };
}
