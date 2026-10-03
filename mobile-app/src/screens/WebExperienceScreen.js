import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { WEB_URL } from '../api/client.js';
import { Button } from '../components/ui.js';
import { colors } from '../theme/colors.js';

// Hosts the website's own camera/AR experiences (Magic Camera, 3D Magic
// Camera, HuntsAR World). Those pages run MindAR + three.js against the live
// camera feed -- logic that exists, is tuned, and is shared with the website --
// so the app loads the very same pages in a camera-enabled WebView instead of
// maintaining a second AR pipeline that could drift from it.
function WebExperience({ path, navigation }) {
  const [permission, setPermission] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const webRef = useRef(null);
  const canGoBack = useRef(false);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then((result) => setPermission(result.granted ? 'granted' : 'denied')).catch(() => setPermission('denied'));
  }, []);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && webRef.current) { webRef.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []));

  if (permission === 'checking') return <View style={styles.center}><ActivityIndicator color={colors.holoCyan} /></View>;
  if (permission === 'denied') {
    return <View style={styles.center}>
      <Text style={styles.title}>Camera access needed</Text>
      <Text style={styles.text}>Allow camera access so the AR experience can see the card or poster you point it at.</Text>
      <Button title="Open app settings" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch' }} />
      <Button kind="secondary" title="Try again" onPress={() => Camera.requestCameraPermissionsAsync().then((r) => setPermission(r.granted ? 'granted' : 'denied'))} style={{ alignSelf: 'stretch' }} />
      <Button kind="ghost" title="Go back" onPress={() => navigation.goBack()} />
    </View>;
  }

  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <WebView
      ref={webRef}
      source={{ uri: `${WEB_URL}${path}` }}
      style={{ flex: 1, backgroundColor: '#000' }}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      allowsFullscreenVideo
      setSupportMultipleWindows={false}
      onNavigationStateChange={(state) => { canGoBack.current = state.canGoBack; }}
      onLoadEnd={() => setLoading(false)}
      onError={(event) => { setLoading(false); setError(event.nativeEvent.description || 'Could not load the experience.'); }}
      onHttpError={(event) => { setLoading(false); setError(`The page returned an error (${event.nativeEvent.statusCode}).`); }}
    />
    {loading ? <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none"><ActivityIndicator color={colors.holoCyan} /><Text style={styles.text}>Starting camera…</Text></View> : null}
    {error ? <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.space }]}>
      <Text style={styles.title}>Couldn't open the experience</Text><Text style={styles.text}>{error}</Text>
      <Text style={styles.text}>Check that EXPO_PUBLIC_WEB_URL points at the running website ({WEB_URL}).</Text>
      <Button title="Go back" kind="secondary" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch' }} />
    </View> : null}
  </View>;
}

const card = (route) => (route.params?.cardNumber ? `?card=${route.params.cardNumber}` : '');

export function MagicCameraScreen({ navigation, route }) {
  const id = route.params?.clientId;
  return <WebExperience navigation={navigation} path={id ? `/magic-camera/${id}${card(route)}` : '/magic-camera'} />;
}

export function MagicCamera3DScreen({ navigation, route }) {
  const id = route.params?.clientId;
  return <WebExperience navigation={navigation} path={id ? `/magic-camera-3d/${id}${card(route)}` : '/magic-camera-3d'} />;
}

export function ArExperienceScreen({ navigation, route }) {
  const { clientId, cardNumber } = route.params || {};
  return <WebExperience navigation={navigation} path={`/c/${clientId}?ar=1${cardNumber ? `&card=${cardNumber}` : ''}`} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.space },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }, text: { color: colors.textDim, textAlign: 'center', lineHeight: 20 },
});
