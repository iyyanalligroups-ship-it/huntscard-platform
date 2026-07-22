import { StyleSheet, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { useLocalSearchParams } from 'expo-router';
import HuntsARPanelScene from '@/components/ar-scenes/HuntsARPanelScene';

export default function ArViewScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{ scene: HuntsARPanelScene }}
        // Confirmed against ViroReact's runtime source: viroAppProps set
        // here is copied onto sceneNavigator.viroAppProps, which every
        // scene receives as props.sceneNavigator.viroAppProps -- the
        // real, current way to pass data into a scene (see
        // HuntsARPanelScene.tsx for the read side).
        viroAppProps={{ clientId }}
        style={styles.arNavigator}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  arNavigator: { flex: 1 },
});
