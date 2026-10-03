import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Card, Field, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

// What a stranger does on the web by tapping the NFC card or scanning its QR:
// land on /c/:clientId. In the app: scan the QR, or paste the card link / ID.
export function parseCardTarget(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match = text.match(/\/c\/([^/?#\s]+)(?:[^#]*[?&]card=(\d+))?/i);
  if (match) return { clientId: decodeURIComponent(match[1]), cardNumber: match[2] };
  if (/^[\w-]{3,}$/.test(text)) return { clientId: text };
  return null;
}

export default function OpenCardScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [handled, setHandled] = useState(false);

  function open(raw) {
    const target = parseCardTarget(raw);
    if (!target) return setError("That doesn't look like a HuntsTAG card link. Paste the link or card ID, or scan the card's QR code.");
    setError(''); setScanning(false);
    navigation.navigate('Card', target);
  }

  async function startScan() {
    setError(''); setHandled(false);
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) return setError('Camera permission is required to scan a QR code.');
    setScanning(true);
  }

  return <Screen>
    <Title subtitle="Scan a HuntsTAG card's QR code or paste its link to see the profile -- the same page people get when they tap the card.">Open a card</Title>
    <Message>{error}</Message>
    {scanning ? <Card style={{ gap: 12 }}>
      <View style={styles.camera}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handled ? undefined : ({ data }) => {
            const target = parseCardTarget(data);
            if (!target) { if (/^https?:\/\//i.test(data)) { setHandled(true); Linking.openURL(data); } return; }
            setHandled(true); open(data);
          }} />
        <View pointerEvents="none" style={styles.frame} />
      </View>
      <Text style={styles.hint}>Point the camera at the QR code on the card.</Text>
      <Button kind="secondary" title="Stop scanning" onPress={() => setScanning(false)} />
    </Card> : <Button icon="scan" title="Scan a QR code" onPress={startScan} />}
    <Card style={{ gap: 12 }}>
      <Field label="Card link or ID" placeholder="https://…/c/ABC123 or ABC123" autoCapitalize="none" autoCorrect={false} value={value} onChangeText={setValue} onSubmitEditing={() => open(value)} />
      <Button title="Open card" disabled={!value.trim()} onPress={() => open(value)} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  camera: { height: 300, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderWidth: 2, borderColor: colors.holoCyan, borderRadius: 16 },
  hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
});
