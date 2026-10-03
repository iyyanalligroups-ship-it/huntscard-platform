import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';

// Magic Camera -- point your phone at a Magic Poster or Magic Business Card and
// watch it come alive. No account, no login. The tracking itself (MindAR +
// three.js) runs in the open-source web build in ../web; this app is the
// native shell that grants it the camera.
const CAMERA_URL = (process.env.EXPO_PUBLIC_CAMERA_URL || '').replace(/\/$/, '');

function Button({ title, onPress, secondary }) {
  return <Pressable onPress={onPress} style={[styles.button, secondary && styles.secondary]}><Text style={[styles.buttonText, secondary && { color: '#edeff3' }]}>{title}</Text></Pressable>;
}

function Gate({ title, text, children }) {
  return <View style={styles.center}><Text style={styles.logo}>✨</Text><Text style={styles.title}>{title}</Text><Text style={styles.text}>{text}</Text>{children}</View>;
}

function CameraScreen() {
  const [permission, setPermission] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const webRef = useRef(null);
  const canGoBack = useRef(false);

  const askPermission = useCallback(() => Camera.requestCameraPermissionsAsync().then((r) => setPermission(r.granted ? 'granted' : 'denied')).catch(() => setPermission('denied')), []);
  useEffect(() => { askPermission(); }, [askPermission]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && webRef.current) { webRef.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  if (!CAMERA_URL) return <Gate title="Not configured" text="Set EXPO_PUBLIC_CAMERA_URL to the address where the Magic Camera web build is hosted, then restart the app." />;
  if (permission === 'checking') return <View style={styles.center}><ActivityIndicator color="#5eead4" /></View>;
  if (permission === 'denied') {
    return <Gate title="Camera access needed" text="Allow camera access so Magic Camera can see the poster or card you point it at.">
      <Button title="Allow camera" onPress={askPermission} />
      <Button secondary title="Open settings" onPress={() => Linking.openSettings()} />
    </Gate>;
  }

  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <WebView
      key={attempt}
      ref={webRef}
      source={{ uri: CAMERA_URL }}
      style={{ flex: 1, backgroundColor: '#000' }}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      setSupportMultipleWindows={false}
      onNavigationStateChange={(s) => { canGoBack.current = s.canGoBack; }}
      onShouldStartLoadWithRequest={(req) => {
        // Links to other sites (a card owner's profile, WhatsApp...) open outside the camera.
        if (req.url.startsWith(CAMERA_URL) || /^(about|data|blob):/.test(req.url)) return true;
        if (/^https?:|^tel:|^mailto:/.test(req.url)) { Linking.openURL(req.url).catch(() => {}); return false; }
        return true;
      }}
      onLoadEnd={() => setLoading(false)}
      onError={(e) => { setLoading(false); setError(e.nativeEvent.description || 'Could not load Magic Camera.'); }}
      onHttpError={(e) => { setLoading(false); setError(`The server returned an error (${e.nativeEvent.statusCode}).`); }}
    />
    {loading ? <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none"><ActivityIndicator color="#5eead4" /></View> : null}
    {error ? <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#0a0b10' }]}>
      <Text style={styles.title}>Couldn't open Magic Camera</Text><Text style={styles.text}>{error}</Text>
      <Text style={styles.text}>Check your internet connection and try again.</Text>
      <Button title="Try again" onPress={() => { setError(''); setLoading(true); setAttempt((n) => n + 1); }} />
    </View> : null}
  </View>;
}

export default function App() {
  return <SafeAreaProvider>
    <StatusBar style="light" />
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top']}><CameraScreen /></SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: '#0a0b10' },
  logo: { fontSize: 44 }, title: { color: '#edeff3', fontSize: 21, fontWeight: '800', textAlign: 'center' }, text: { color: '#8b93a3', textAlign: 'center', lineHeight: 21 },
  button: { alignSelf: 'stretch', minHeight: 48, borderRadius: 10, backgroundColor: '#5eead4', alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#181b24', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }, buttonText: { color: '#06120f', fontWeight: '800' },
});
