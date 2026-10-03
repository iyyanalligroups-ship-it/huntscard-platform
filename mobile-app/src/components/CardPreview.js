import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors.js';

// Card design with the AR QR code overlaid at its saved position (percent of
// the card) -- the on-screen equivalent of the website's composeCardWithQr().
// The QR is 21.2/55 of the card's short side, same ratio MagicBusinessCard.jsx
// uses for its preview box.
export default function CardPreview({ uri, aspect = 85 / 55, qrUri, qrPos = { x: 82, y: 82 }, style, children, fit = 'contain' }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const qrSize = Math.round(Math.min(size.width, size.height) * (21.2 / 55));
  return (
    <View style={[styles.box, { aspectRatio: aspect }, style]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={fit} /> : null}
      {uri && qrUri && qrSize > 0 ? (
        <Image
          source={{ uri: qrUri }}
          style={{ position: 'absolute', width: qrSize, height: qrSize, left: (qrPos.x / 100) * size.width - qrSize / 2, top: (qrPos.y / 100) * size.height - qrSize / 2, backgroundColor: '#fff', borderRadius: 4 }}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', overflow: 'hidden', backgroundColor: colors.panelRaised, borderRadius: 14, alignSelf: 'center' },
});
