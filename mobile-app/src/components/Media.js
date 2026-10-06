import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import { WEB_URL, resolveAssetUrl } from '../api/client.js';
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

// YouTube refuses to play an embed that has no referrer ("Error 153, video player configuration error"),
// and a bare WebView uri sends none. So the player is loaded inside a tiny HTML page whose base URL is the
// website's own origin, with the same origin passed to the player.
function youtubeSource(id, { autoplay = false, loop = false, controls = true } = {}) {
  const origin = String(WEB_URL || '').startsWith('http') ? WEB_URL : 'https://huntstag.com';
  const params = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1', origin, widget_referrer: origin });
  if (autoplay) { params.set('autoplay', '1'); params.set('mute', '1'); }
  if (loop) { params.set('loop', '1'); params.set('playlist', id); }
  if (!controls) params.set('controls', '0');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="https://www.youtube.com/embed/${id}?${params.toString()}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return { html, baseUrl: origin };
}

// YouTube Shorts/watch links play through the embed player; anything else is
// an uploaded video file.
export function VideoClip({ url, style }) {
  const id = youtubeId(url);
  if (id) {
    return <WebView
      style={[styles.clip, style]}
      source={youtubeSource(id)}
      originWhitelist={['*']}
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
        id ? <WebView style={StyleSheet.absoluteFill} source={youtubeSource(id, { autoplay: true, loop: true, controls: false })} originWhitelist={['*']} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
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
