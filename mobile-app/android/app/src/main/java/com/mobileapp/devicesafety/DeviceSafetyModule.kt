package com.mobileapp.devicesafety

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * Read-only checks for the "Device Protection Check" screen -- queried
 * fresh each time getStatus() is called (no caching, no background
 * service, no data leaves the device). Three checks only, per the app's
 * scope: Play Protect status, Wi-Fi network security, and whether any
 * app from a small known-tool list is installed. The known-tool check is
 * a specific-package lookup (Android 11+ package visibility), not a scan
 * of every app on the phone -- that broader approach needs the
 * QUERY_ALL_PACKAGES permission, which Google Play restricts heavily and
 * this app has no legitimate case for requesting.
 */
class DeviceSafetyModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "DeviceSafety"

  // Starter list only -- most tools in this category aren't Play Store
  // apps, so their package names aren't stable/documented the way a
  // normal app's would be, and this list makes no claim of being
  // exhaustive. Add to it as needed; each entry also needs a matching
  // <package android:name="..."/> line in AndroidManifest.xml's
  // <queries> block, or the lookup below silently can't see it on
  // Android 11+.
  private val knownTools = listOf(
    "com.zimperium.zanti" to "zANTI",
    "org.csploit.android" to "cSploit"
  )

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val context = reactApplicationContext
      val result: WritableMap = Arguments.createMap()

      result.putString("playProtectStatus", getPlayProtectStatus(context))
      result.putMap("wifi", getWifiSecurityInfo(context))
      result.putArray("detectedTools", getDetectedTools(context))

      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("DEVICE_SAFETY_ERROR", e.message, e)
    }
  }

  // Best-effort only -- there is no official public API for Play
  // Protect's own on/off toggle. This reads an undocumented setting some
  // apps use as a proxy; it isn't guaranteed accurate on every Android
  // version or OEM skin. Only claims "enabled" when the value
  // unambiguously says so -- everything else is reported as unknown/
  // likely-disabled rather than guessed, per the same "don't fake a
  // result" rule the rest of this screen follows.
  private fun getPlayProtectStatus(context: Context): String {
    return try {
      val value = Settings.Secure.getInt(context.contentResolver, "package_verifier_user_consent", -2)
      when (value) {
        1 -> "enabled"
        -1 -> "disabled"
        else -> "unknown"
      }
    } catch (e: Exception) {
      "unknown"
    }
  }

  // { connected: Boolean, isOpen: Boolean? } -- isOpen is null whenever
  // it can't be determined (not on Wi-Fi at all, or Android < 13). Only
  // Android 13+'s WifiInfo.getCurrentSecurityType() reads this without
  // needing ACCESS_FINE_LOCATION -- older Android ties Wi-Fi network
  // detail to location permission, which felt like too invasive a trade
  // for a quick settings glance, so this deliberately reports "can't
  // determine" there instead of requesting that permission.
  private fun getWifiSecurityInfo(context: Context): WritableMap {
    val result = Arguments.createMap()
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    val network = connectivityManager?.activeNetwork
    val capabilities = network?.let { connectivityManager.getNetworkCapabilities(it) }
    val onWifi = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    result.putBoolean("connected", onWifi)

    if (!onWifi) {
      result.putNull("isOpen")
      return result
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val securityType = wifiManager?.connectionInfo?.currentSecurityType
        if (securityType != null) {
          result.putBoolean("isOpen", securityType == WifiInfo.SECURITY_TYPE_OPEN)
        } else {
          result.putNull("isOpen")
        }
      } catch (e: Exception) {
        result.putNull("isOpen")
      }
    } else {
      result.putNull("isOpen")
    }
    return result
  }

  // Only ever checks for the specific packages in knownTools -- never
  // enumerates installed apps generally.
  private fun getDetectedTools(context: Context): WritableArray {
    val result = Arguments.createArray()
    for ((packageName, label) in knownTools) {
      try {
        context.packageManager.getPackageInfo(packageName, 0)
        val entry = Arguments.createMap()
        entry.putString("packageName", packageName)
        entry.putString("label", label)
        result.pushMap(entry)
      } catch (e: PackageManager.NameNotFoundException) {
        // Not installed -- expected for almost everyone, not an error.
      }
    }
    return result
  }

  // Deep-links straight into the relevant screen, falling back to the
  // generic Settings home if a specific action isn't resolvable on this
  // OEM's build.
  private fun openSettings(action: String, dataUri: Uri? = null) {
    val context = reactApplicationContext
    try {
      val intent = Intent(action)
      if (dataUri != null) intent.data = dataUri
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    } catch (e: Exception) {
      val fallback = Intent(Settings.ACTION_SETTINGS)
      fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(fallback)
    }
  }

  @ReactMethod
  fun openWifiSettings() {
    openSettings(Settings.ACTION_WIFI_SETTINGS)
  }

  // No official deep link to "Play Protect settings" specifically --
  // tries the action the Play Store app itself uses internally first
  // (undocumented, may not resolve on every device/Play Store version),
  // then falls back to just opening the Play Store app, then Settings.
  @ReactMethod
  fun openPlayProtectSettings() {
    val context = reactApplicationContext
    try {
      val intent = Intent("com.google.android.gms.security.settings.VerifyApps")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    } catch (e: Exception) {
      try {
        val launchIntent = context.packageManager.getLaunchIntentForPackage("com.android.vending")
        if (launchIntent != null) {
          launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(launchIntent)
        } else {
          openSettings(Settings.ACTION_SETTINGS)
        }
      } catch (e2: Exception) {
        openSettings(Settings.ACTION_SETTINGS)
      }
    }
  }

  // Opens a specific detected tool's own App Info page so the user can
  // review or uninstall it directly -- not a generic Settings screen.
  @ReactMethod
  fun openAppInfo(packageName: String) {
    openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
  }
}
