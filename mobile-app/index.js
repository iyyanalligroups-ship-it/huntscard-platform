/**
 * @format
 */

// Must be the very first import -- react-native-gesture-handler (a Drawer
// navigator dependency) sets up its native event handling at import time.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
