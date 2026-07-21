import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
/**
 * HuntsAR World home screen: a plain QR scanner, not an AR view yet.
 * Scanning a HuntsTAG's QR code identifies EXACTLY which client it is
 * -- instantly and unambiguously -- then hands off to the AR screen
 * (app/ar-view.tsx) to show their floating panel. This two-step flow
 * (scan to identify, then AR to display) is deliberately simpler and
 * more reliable than trying to recognize a card by its printed photo:
 * no pre-registered target list, no lighting/angle sensitivity, and no
 * ceiling on how many clients the app can recognize.
 */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [notAHuntsTAG, setNotAHuntsTAG] = useState(false);
  const router = useRouter();

  function handleScan(result: BarcodeScanningResult) {
    if (scanned) return; // ignore repeat fires while we're already handling one
    setScanned(true);

    // The QR encodes the same tap URL every card already uses:
    // https://huntstag.com/c/{clientId} (or your dev host). Pull the
    // clientId back out of it rather than assuming a bare ID was
    // encoded, since that's what the QR generator actually produces.
    const match = result.data.match(/\/c\/([^/?#]+)/);
    const clientId = match ? match[1] : null;

    if (!clientId) {
      // Show this clearly rather than silently doing nothing -- a QR
      // that isn't a HuntsTAG link (e.g. Metro's own dev-server QR
      // code, WiFi QR codes, anything else) needs a real message, not
      // a scan that just appears to have failed.
      setNotAHuntsTAG(true);
      setTimeout(() => {
        setNotAHuntsTAG(false);
        setScanned(false);
      }, 2000);
      return;
    }

    router.push({ pathname: '/ar-view', params: { clientId } });
  }

  if (!permission) {
    return <View style={styles.center} />; // permission state still loading
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>HuntsAR World needs camera access to scan cards.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.scanFrame} />
        <Text style={styles.hint}>
          {notAHuntsTAG ? "That's not a HuntsTAG QR code" : "Point at a HuntsTAG's QR code"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0c11' },
  message: { color: '#edeff3', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: '#5eead4', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  buttonText: { color: '#0b0c11', fontWeight: '700' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: '#5eead4', borderRadius: 16 },
  hint: { color: '#fff', marginTop: 20, fontSize: 14 },
});
