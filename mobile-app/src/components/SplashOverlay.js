import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Intro in three beats, in the spirit of a streaming-service logo sting:
//  1. the wolf is already on screen (same picture, same spot as the native splash, so no jump) and
//     "howls": three blue sound rings ripple out from it;
//  2. the "HuntsTAG" wordmark reveals letter by letter under it, then a blue light sweeps across it;
//  3. once the app is ready, the wolf zooms toward the viewer and the screen fades into the app.
// The wolf is pinned to the exact centre of the screen on both axes; the text sits below it.
const BG = '#eaf1ff';
const BLUE = '#1565ff';
const WORD = 'HuntsTAG'.split('');
const LOGO = 240;
const MIN_SHOW_MS = 2600;

export default function SplashOverlay({ ready }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const intro = useRef(new Animated.Value(0)).current;
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const letters = useRef(WORD.map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(Date.now());
  const [gone, setGone] = useState(false);
  const [laidOut, setLaidOut] = useState(false);

  // Hand over from the native splash as soon as this overlay has painted once.
  useEffect(() => {
    if (laidOut) SplashScreen.hideAsync().catch(() => {});
  }, [laidOut]);

  useEffect(() => {
    // Wolf settles in with a tiny overshoot.
    Animated.timing(intro, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    // Rings ripple out one after another.
    const ringAnims = rings.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 520),
      Animated.timing(v, { toValue: 1, duration: 1560, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));
    ringAnims.forEach((a) => a.start());
    // Letters pop in, then the tagline, then the light sweep.
    Animated.sequence([
      Animated.delay(550),
      Animated.stagger(70, letters.map((v) => Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }))),
      Animated.timing(tagline, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
    return () => ringAnims.forEach((a) => a.stop());
  }, [intro, rings, letters, tagline, sweep]);

  // Exit: zoom toward the viewer while fading out.
  useEffect(() => {
    if (!ready || !laidOut) return undefined;
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(zoom, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => setGone(true));
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, laidOut, opacity, zoom]);

  if (gone) return null;

  const wolfScale = Animated.multiply(intro.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }), zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }));

  // A native Modal is its own full-screen window (under the status bar and navigation bar too), so the
  // wolf is centred on the real screen whatever the app's own layout is doing underneath.
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
    <Animated.View style={[styles.root, { opacity }]} onLayout={() => setLaidOut(true)}>
      {rings.map((v, i) => (
        <Animated.View key={i} style={[styles.ring, { opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] }) }] }]} />
      ))}
      <Animated.View style={[styles.wolfBox, { opacity: intro.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.6, 1, 1] }), transform: [{ scale: wolfScale }] }]}>
        <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      <View style={styles.textBlock} pointerEvents="none">
        <View style={styles.wordRow}>
          {WORD.map((ch, i) => (
            <Animated.Text key={i} style={[styles.letter, i >= 5 && { color: BLUE }, { opacity: letters[i], transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>{ch}</Animated.Text>
          ))}
          <Animated.View style={[styles.shine, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 180] }) }, { skewX: '-20deg' }], opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.8, 0.8, 0] }) }]} />
        </View>
        <Animated.Text style={[styles.tag, { opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>A smart card for a smarter first impression</Animated.Text>
      </View>
    </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: BG, zIndex: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', alignSelf: 'center', width: 180, height: 180, borderRadius: 90, borderWidth: 2.5, borderColor: BLUE },
  wolfBox: { width: LOGO, height: LOGO },
  logo: { width: LOGO, height: LOGO },
  // Text hangs below the wolf: its top edge is the screen centre plus half the logo, so the wolf itself stays dead centre.
  textBlock: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: LOGO / 2 + 6, alignItems: 'center' },
  wordRow: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingHorizontal: 6 },
  letter: { color: '#0b1630', fontSize: 38, fontWeight: '900', letterSpacing: -0.5 },
  shine: { position: 'absolute', top: -6, bottom: -6, width: 34, backgroundColor: 'rgba(255,255,255,0.85)' },
  tag: { color: '#3d4a63', fontSize: 13.5, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 },
});
