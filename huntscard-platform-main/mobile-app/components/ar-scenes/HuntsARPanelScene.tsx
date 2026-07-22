import { useEffect, useState } from 'react';
import { StyleSheet, Linking } from 'react-native';
import {
  ViroARScene,
  ViroNode,
  ViroFlexView,
  ViroImage,
  ViroVideo,
  ViroText,
  ViroAmbientLight,
  ViroMaterials,
} from '@reactvision/react-viro';
import { SceneProps } from './types';
import { BACKEND_URL } from '../../src/config';

/**
 * HuntsAR World's core AR panel.
 *
 * clientId arrives via viroAppProps set on <ViroARSceneNavigator> (see
 * app/ar-view.tsx) -- confirmed against ViroReact's actual runtime
 * source, not the older "passProps on initialScene" pattern some
 * tutorials show, which the current TypeScript types don't support.
 *
 * Element positions (video, contact, portfolio, social, huntsworld) are
 * NOT hardcoded here -- they're fetched per-client from /api/public/ar-layout/:clientId,
 * which the admin app's drag-and-drop AR Layout Editor writes to. This
 * scene only converts the editor's 2D percentage positions into actual
 * 3D coordinates; it doesn't decide the arrangement itself.
 */

ViroMaterials.createMaterials({
  greenScreenVideo: {
    chromaKeyFilteringColor: '#00FF00',
  },
});

type HuntsARPanelProps = SceneProps;

type Profile = {
  fullName: string;
  jobTitle?: string;
  photoUrl?: string;
  arVideoUrl?: string;
  phone?: string;
  publicEmail?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  portfolioUrl?: string;
  huntsworldUrl?: string;
  whatsapp?: string;
};

type LayoutPos = { x: number; y: number }; // percentages, 0-100

type ArLayout = {
  video: LayoutPos;
  contact: LayoutPos;
  portfolio: LayoutPos;
  social: LayoutPos;
  huntsworld: LayoutPos;
};

// Matches the schema defaults in backend/models/ArLayout.js -- used if
// the fetch fails, so the panel never renders with everything piled at
// (0,0).
const DEFAULT_LAYOUT: ArLayout = {
  video: { x: 50, y: 20 },
  contact: { x: 50, y: 45 },
  portfolio: { x: 15, y: 60 },
  social: { x: 85, y: 60 },
  huntsworld: { x: 50, y: 85 },
};

// Converts the editor's 2D percentage position (0-100 on each axis,
// matching the drag canvas in the admin app) into a 3D offset in front
// of the camera. X: 0%=left, 100%=right. Y: 0%=top, 100%=bottom (screen
// convention) -- inverted for Viro's up-is-positive Y axis.
const X_RANGE = 1.6; // meters, roughly the width of the AR card area
const Y_RANGE = 1.0; // meters
function toViroPosition(pos: LayoutPos): [number, number, number] {
  const x = (pos.x / 100 - 0.5) * X_RANGE;
  const y = (0.5 - pos.y / 100) * Y_RANGE;
  return [x, y, 0];
}

// One entry per social link HuntsTAG already collects in Profile
// Settings -- reused here, nothing new for clients to fill in just for
// AR. Each renders as a small tappable icon bubble.
const SOCIAL_LINKS: { key: keyof Profile; label: string; color: string; buildUrl?: (v: string) => string }[] = [
  { key: 'instagramUrl', label: 'IG', color: '#E1306C' },
  { key: 'twitterUrl', label: 'X', color: '#000000' },
  { key: 'portfolioUrl', label: '\u25C6', color: '#4f8ef7' },
  { key: 'huntsworldUrl', label: 'H', color: '#5eead4' },
  { key: 'whatsapp', label: 'WA', color: '#25D366', buildUrl: (v) => `https://wa.me/${v.replace(/\D/g, '')}` },
];

const HuntsARPanelScene = (props: HuntsARPanelProps = {}) => {
  const clientId = (props.sceneNavigator as any)?.viroAppProps?.clientId as string | undefined;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [layout, setLayout] = useState<ArLayout>(DEFAULT_LAYOUT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setError('No card was scanned.');
      return;
    }
    let cancelled = false;

    Promise.all([
      fetch(`${BACKEND_URL}/api/public/profile/${clientId}`).then((res) => {
        if (!res.ok) throw new Error(`Profile not found (${res.status})`);
        return res.json();
      }),
      // Layout fetch failure shouldn't block showing the profile --
      // fall back to DEFAULT_LAYOUT silently rather than erroring the
      // whole panel over a missing arrangement.
      fetch(`${BACKEND_URL}/api/public/ar-layout/${clientId}`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([profileData, layoutData]) => {
        if (cancelled) return;
        setProfile(profileData);
        if (layoutData) {
          setLayout({
            video: layoutData.video || DEFAULT_LAYOUT.video,
            contact: layoutData.contact || DEFAULT_LAYOUT.contact,
            portfolio: layoutData.portfolio || DEFAULT_LAYOUT.portfolio,
            social: layoutData.social || DEFAULT_LAYOUT.social,
            huntsworld: layoutData.huntsworld || DEFAULT_LAYOUT.huntsworld,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const activeSocials = profile ? SOCIAL_LINKS.filter((s) => Boolean(profile[s.key])) : [];

  function openSocial(link: (typeof SOCIAL_LINKS)[number]) {
    if (!profile) return;
    const raw = profile[link.key] as string;
    const url = link.buildUrl ? link.buildUrl(raw) : raw;
    Linking.openURL(url).catch(() => {});
  }

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" intensity={250} />

      {error && (
        <ViroText text={error} scale={[0.3, 0.3, 0.3]} position={[0, 0, -1]} style={styles.errorText} />
      )}

      {!error && !profile && (
        <ViroText text="Loading..." scale={[0.3, 0.3, 0.3]} position={[0, 0, -1]} style={styles.loadingText} />
      )}

      {profile && (
        <ViroNode position={[0, 0, -1.2]}>
          {/* Video hologram if the client has one, otherwise their photo --
              position comes from the admin-configured layout, not a
              hardcoded value. */}
          {profile.arVideoUrl ? (
            <ViroVideo
              source={{ uri: profile.arVideoUrl }}
              materials={['greenScreenVideo']}
              loop
              muted={false}
              width={0.5}
              height={0.9}
              position={toViroPosition(layout.video)}
            />
          ) : profile.photoUrl ? (
            <ViroImage source={{ uri: profile.photoUrl }} width={0.4} height={0.4} position={toViroPosition(layout.video)} />
          ) : null}

          {/* Contact info panel */}
          <ViroFlexView style={styles.infoPanel} width={0.9} height={0.55} position={toViroPosition(layout.contact)}>
            <ViroText text={profile.fullName} style={styles.name} width={0.8} height={0.12} />
            {profile.jobTitle && <ViroText text={profile.jobTitle} style={styles.title} width={0.8} height={0.08} />}
            {profile.phone && <ViroText text={profile.phone} style={styles.contactLine} width={0.8} height={0.07} />}
            {profile.publicEmail && (
              <ViroText text={profile.publicEmail} style={styles.contactLine} width={0.8} height={0.07} />
            )}
          </ViroFlexView>

          {/* Portfolio link, shown as its own block if the client has one */}
          {profile.portfolioUrl && (
            <ViroFlexView
              style={styles.smallBlock}
              width={0.5}
              height={0.18}
              position={toViroPosition(layout.portfolio)}
              onClick={() => Linking.openURL(profile.portfolioUrl!).catch(() => {})}
            >
              <ViroText text="Portfolio" style={styles.smallBlockLabel} width={0.5} height={0.18} />
            </ViroFlexView>
          )}

          {/* Huntsworld link, shown as its own block if the client has one */}
          {profile.huntsworldUrl && (
            <ViroFlexView
              style={styles.smallBlock}
              width={0.5}
              height={0.18}
              position={toViroPosition(layout.huntsworld)}
              onClick={() => Linking.openURL(profile.huntsworldUrl!).catch(() => {})}
            >
              <ViroText text="Huntsworld" style={styles.smallBlockLabel} width={0.5} height={0.18} />
            </ViroFlexView>
          )}

          {/* Social icon bubbles, arranged in a row centered on the
              layout-configured "social" position */}
          <ViroNode position={toViroPosition(layout.social)}>
            {activeSocials.map((link, i) => (
              <ViroFlexView
                key={link.key}
                style={{ ...styles.socialBubble, backgroundColor: link.color }}
                width={0.12}
                height={0.12}
                position={[i * 0.16 - (activeSocials.length - 1) * 0.08, 0, 0.02]}
                onClick={() => openSocial(link)}
              >
                <ViroText text={link.label} style={styles.socialLabel} width={0.12} height={0.12} />
              </ViroFlexView>
            ))}
          </ViroNode>
        </ViroNode>
      )}
    </ViroARScene>
  );
};

const styles = StyleSheet.create({
  infoPanel: {
    flexDirection: 'column',
    padding: 0.05,
    backgroundColor: '#ffffffee',
    borderRadius: 0.04,
  },
  name: { fontFamily: 'Arial', fontSize: 20, color: '#14161f', fontWeight: 'bold' },
  title: { fontFamily: 'Arial', fontSize: 14, color: '#5b5f6d', marginTop: 0.01 },
  contactLine: { fontFamily: 'Arial', fontSize: 12, color: '#14161f', marginTop: 0.015 },
  smallBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffffee',
    borderRadius: 0.03,
  },
  smallBlockLabel: { fontFamily: 'Arial', fontSize: 13, color: '#14161f', fontWeight: 'bold', textAlign: 'center', textAlignVertical: 'center' },
  socialBubble: { alignItems: 'center', justifyContent: 'center', borderRadius: 0.06 },
  socialLabel: { fontFamily: 'Arial', fontSize: 12, color: '#ffffff', fontWeight: 'bold', textAlign: 'center', textAlignVertical: 'center' },
  loadingText: { fontFamily: 'Arial', fontSize: 20, color: '#ffffff', textAlignVertical: 'center', textAlign: 'center' },
  errorText: { fontFamily: 'Arial', fontSize: 18, color: '#f4746a', textAlignVertical: 'center', textAlign: 'center' },
});

export default HuntsARPanelScene;
