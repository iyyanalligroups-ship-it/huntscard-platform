import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { resolveAssetUrl } from '../api/client.js';
import { colors } from '../theme/colors.js';
import { Glyph } from './Glyph.js';
import { NativeVideo } from './Media.js';
import { Button, Card } from './ui.js';

// Pick an image / video / 3D-model file from the phone. Mirrors the website's
// "Choose X" + hidden <input type=file> blocks in Profile Settings and
// Magic Business Card.
export async function pickMedia({ kind = 'image', editing, aspect, quality = 0.9 }) {
  if (kind === 'model') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true });
    if (result.canceled) return null;
    return result.assets[0];
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library permission is required.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'video' ? ['videos'] : kind === 'media' ? ['images', 'videos'] : ['images'],
    allowsEditing: Boolean(editing),
    aspect,
    quality,
  });
  if (result.canceled) return null;
  return result.assets[0];
}

export default function MediaUploader({ title, description, hint, uri, type = 'image', kind = 'image', chooseLabel, changeLabel, onPicked, onRemove, editing, aspect, previewHeight = 130, contain = false, extraPreview, disabled }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  async function choose() {
    setError(''); setSaved('');
    try {
      const asset = await pickMedia({ kind, editing, aspect });
      if (!asset) return;
      setBusy(true);
      await onPicked(asset);
      setSaved('Saved.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function remove() {
    setError(''); setSaved(''); setBusy(true);
    try { await onRemove(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const resolved = resolveAssetUrl(uri);
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.hint}>{description}</Text> : null}
      <View style={[styles.preview, { height: previewHeight, opacity: busy ? 0.5 : 1 }]}>
        {extraPreview || (resolved ? (
          type === 'video' ? <NativeVideo uri={resolved} style={StyleSheet.absoluteFill} muted />
            : <Image source={{ uri: resolved }} style={StyleSheet.absoluteFill} resizeMode={contain ? 'contain' : 'cover'} />
        ) : <View style={styles.empty}><Glyph name={kind === 'model' ? 'box' : 'image'} size={22} color={colors.text} /><Text style={styles.hint}>Nothing uploaded yet</Text></View>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button compact kind="secondary" icon="upload" title={busy ? 'Working…' : uri ? changeLabel || 'Change' : chooseLabel || 'Choose'} disabled={busy || disabled} onPress={choose} />
        {uri && onRemove && !busy ? <Button compact kind="danger" icon="trash" title="Remove" onPress={remove} /> : null}
      </View>
      {hint ? <Text style={styles.hint}>{busy ? 'Saving now…' : hint}</Text> : null}
      {saved && !busy ? <Text style={[styles.hint, { color: colors.holoCyan }]}>{saved}</Text> : null}
      {error ? <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontWeight: '800', fontSize: 15 }, hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  preview: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panelRaised },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
