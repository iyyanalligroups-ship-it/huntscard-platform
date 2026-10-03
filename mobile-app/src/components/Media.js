import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import { resolveAssetUrl } from '../api/client.js';
import { youtubeId } from '../lib/format.js';
import { colors } from '../theme/colors.js';
import { Glyph } from './Glyph.js';

// Native <video controls> -- also used for the AR banner preview etc.
export function NativeVideo({ uri, style, loop = false, muted = false, autoplay = false, nativeControls = true }) {
  const player = useVideoPlayer(resolveAssetUrl(uri), (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoplay) instance.play();
  });
  return <VideoView player={player} style={style} nativeControls={nativeControls} contentFit="contain" allowsFullscreen allowsPictureInPicture />;
}

// YouTube Shorts/watch links play through the embed player; anything else is
// an uploaded video file.
export function VideoClip({ url, style }) {
  const id = youtubeId(url);
  if (id) {
    return <WebView
      style={[styles.clip, style]}
      source={{ uri: `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      allowsFullscreenVideo
      javaScriptEnabled
    />;
  }
  return <NativeVideo uri={url} style={[styles.clip, style]} />;
}

// The website's hover-to-play card photo: on a phone there is no hover, so a
// tap swaps the still photo for the looping (muted) video.
export function TapToPlayMedia({ imageUrl, videoUrl, style }) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(videoUrl);
  return (
    <View style={[styles.media, style]}>
      {playing && videoUrl ? (
        id ? <WebView style={StyleSheet.absoluteFill} source={{ uri: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0` }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
          : <NativeVideo uri={videoUrl} style={StyleSheet.absoluteFill} loop muted autoplay nativeControls={false} />
      ) : imageUrl ? (
        <Image source={{ uri: resolveAssetUrl(imageUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.none}><Text style={styles.noneText}>No photo yet</Text></View>
      )}
      {videoUrl ? (
        <Pressable onPress={() => setPlaying((v) => !v)} style={styles.badge}>
          <Glyph name={playing ? 'close' : 'play'} size={12} color="#fff" />
          <Text style={styles.badgeText}>{playing ? 'Stop video' : 'Tap to play video'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  media: { width: '100%', overflow: 'hidden', backgroundColor: colors.panelRaised, borderRadius: 12 },
  none: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  noneText: { color: colors.textDim, fontSize: 13 },
  badge: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
