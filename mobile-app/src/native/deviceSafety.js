import { NativeModules } from 'react-native';

const { DeviceSafety } = NativeModules;

// Thin wrapper, not a re-implementation -- every value returned here comes
// straight from android/.../devicesafety/DeviceSafetyModule.kt, read fresh
// from the device each call. See that file for what each field actually
// means and its honesty caveats (Play Protect status is best-effort, Wi-Fi
// security is only readable on Android 13+).
export function getDeviceSafetyStatus() {
  if (!DeviceSafety) {
    return Promise.reject(new Error('Device Protection Check needs an Android development build; it is not available in Expo Go.'));
  }
  return DeviceSafety.getStatus();
}

export function openWifiSettings() {
  DeviceSafety?.openWifiSettings();
}

export function openPlayProtectSettings() {
  DeviceSafety?.openPlayProtectSettings();
}

export function openAppInfo(packageName) {
  DeviceSafety?.openAppInfo(packageName);
}
