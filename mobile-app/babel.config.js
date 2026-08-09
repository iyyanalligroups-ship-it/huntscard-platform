module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Required by react-native-gesture-handler (the Drawer navigator's
  // dependency) -- must stay last in this list.
  plugins: ['react-native-reanimated/plugin'],
};
