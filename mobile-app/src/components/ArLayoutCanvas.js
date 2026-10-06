import { useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { resolveAssetUrl } from '../api/client.js';
import { colors } from '../theme/colors.js';

export const POSITION_MIN = -60;
export const POSITION_MAX = 160;
const RANGE = POSITION_MAX - POSITION_MIN;
const clamp = (v) => Math.round(Math.max(POSITION_MIN, Math.min(POSITION_MAX, v)));

function Handle({ item, canvasW, canvasH, selected, onMove, onGrant, onRelease, onSelect }) {
  const start = useRef({ x: 0, y: 0 });
  // The gesture is created once; everything it needs is read from this ref, so re-renders during a drag
  // (every move updates the position) never replace it mid-gesture.
  const live = useRef({});
  live.current = { item, canvasW, canvasH, onMove, onGrant, onRelease, onSelect };
  const gesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(true)
    .onBegin(() => {
      const { item: it } = live.current;
      if (it.fixed) return;
      start.current = { x: it.pos.x, y: it.pos.y };
      live.current.onSelect?.(it.key);
      live.current.onGrant?.();
    })
    .onUpdate((e) => {
      const { canvasW: w, canvasH: h, onMove: move, item: it } = live.current;
      if (it.fixed) return;
      move(it.key, { x: clamp(start.current.x + (e.translationX / w) * RANGE), y: clamp(start.current.y + (e.translationY / h) * RANGE) });
    })
    .onFinalize(() => live.current.onRelease?.()), []);

  const left = ((item.pos.x - POSITION_MIN) / RANGE) * canvasW;
  const top = ((item.pos.y - POSITION_MIN) / RANGE) * canvasH;
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={[styles.handle, { left: left - 34, top: top - 18 }, item.fixed && styles.handleFixed, selected && styles.handleOn]}>
        <Text style={[styles.handleText, (item.fixed || selected) && { color: '#ffffff' }]} numberOfLines={1}>{item.label}</Text>
      </View>
    </GestureDetector>
  );
}

// 2D stand-in for the website's drag-and-orbit ArScanPreview: the card sits in
// the middle of a larger canvas (positions run from -60% to 160% of the card),
// and every AR element is a draggable chip. Positions are the exact same
// {x, y} percentages the backend stores, so layouts stay interchangeable with
// the web editor.
export default function ArLayoutCanvas({ cardUri, aspect, items, selectedKey, onSelect, onDragPosition, onDragStateChange }) {
  const [width, setWidth] = useState(0);
  const cardW = (width * 100) / RANGE;
  const cardH = cardW / aspect;
  const canvasH = (cardH * RANGE) / 100;
  const cardLeft = ((0 - POSITION_MIN) / RANGE) * width;
  const cardTop = ((0 - POSITION_MIN) / RANGE) * canvasH;
  return (
    <View style={[styles.canvas, { height: canvasH || 200 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? <>
        <View style={[styles.card, { left: cardLeft, top: cardTop, width: cardW, height: cardH }]}>
          {cardUri ? <Image source={{ uri: resolveAssetUrl(cardUri) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        </View>
        {items.map((item) => <Handle key={item.key} item={item} selected={item.key === selectedKey} onSelect={onSelect} canvasW={width} canvasH={canvasH} onMove={onDragPosition} onGrant={() => onDragStateChange?.(true)} onRelease={() => onDragStateChange?.(false)} />)}
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: '100%', backgroundColor: '#0c0f16', borderRadius: 14, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' },
  card: { position: 'absolute', borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  handle: { position: 'absolute', minWidth: 68, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 2, borderColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  handleFixed: { backgroundColor: colors.holoCyan },
  handleOn: { backgroundColor: '#ea6a12', borderColor: '#ffffff' },
  handleText: { color: colors.holoCyan, fontSize: 12, fontWeight: '800' },
});
