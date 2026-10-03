/**
 * @format
 */

// Must be the very first import -- react-native-gesture-handler (a Drawer
// navigator dependency) sets up its native event handling at import time.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
