import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { resolveAssetUrl } from '../api/client.js';
import { colors } from '../theme/colors.js';

export const POSITION_MIN = -60;
export const POSITION_MAX = 160;
const RANGE = POSITION_MAX - POSITION_MIN;
const clamp = (v) => Math.round(Math.max(POSITION_MIN, Math.min(POSITION_MAX, v)));

function Handle({ item, canvasW, canvasH, onMove, onGrant, onRelease }) {
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ item, canvasW, canvasH, onMove });
  live.current = { item, canvasW, canvasH, onMove };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !live.current.item.fixed,
    onMoveShouldSetPanResponder: () => !live.current.item.fixed,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = { x: live.current.item.pos.x, y: live.current.item.pos.y }; onGrant?.(); },
    onPanResponderMove: (_, g) => {
      const { canvasW: w, canvasH: h, onMove: move, item: it } = live.current;
      move(it.key, { x: clamp(start.current.x + (g.dx / w) * RANGE), y: clamp(start.current.y + (g.dy / h) * RANGE) });
    },
    onPanResponderRelease: () => onRelease?.(),
    onPanResponderTerminate: () => onRelease?.(),
  }), [onGrant, onRelease]);

  const left = ((item.pos.x - POSITION_MIN) / RANGE) * canvasW;
  const top = ((item.pos.y - POSITION_MIN) / RANGE) * canvasH;
  return (
    <View {...responder.panHandlers} style={[styles.handle, { left: left - 28, top: top - 14 }, item.fixed && styles.handleFixed]}>
      <Text style={[styles.handleText, item.fixed && { color: '#ffffff' }]} numberOfLines={1}>{item.label}</Text>
    </View>
  );
}

// 2D stand-in for the website's drag-and-orbit ArScanPreview: the card sits in
// the middle of a larger canvas (positions run from -60% to 160% of the card),
// and every AR element is a draggable chip. Positions are the exact same
// {x, y} percentages the backend stores, so layouts stay interchangeable with
// the web editor.
export default function ArLayoutCanvas({ cardUri, aspect, items, onDragPosition, onDragStateChange }) {
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
        {items.map((item) => <Handle key={item.key} item={item} canvasW={width} canvasH={canvasH} onMove={onDragPosition} onGrant={() => onDragStateChange?.(true)} onRelease={() => onDragStateChange?.(false)} />)}
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: '100%', backgroundColor: '#0c0f16', borderRadius: 14, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' },
  card: { position: 'absolute', borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  handle: { position: 'absolute', minWidth: 56, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: 'rgba(21,101,255,0.22)', borderWidth: 1, borderColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  handleFixed: { backgroundColor: colors.holoCyan },
  handleText: { color: colors.holoCyan, fontSize: 11, fontWeight: '800' },
});
