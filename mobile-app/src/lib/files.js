import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { authedDownloadTarget } from '../api/client.js';

const safeName = (name) => String(name || 'download').replace(/[^\w.\-]+/g, '_');

// Download a (possibly authenticated) file into the cache and hand it to the
// OS share sheet -- how the website's "Invoice", "Export contacts" and "Save
// contact" browser downloads map onto a phone.
export async function downloadAndShare({ path, url, headers, filename, mimeType, dialogTitle }) {
  const target = path ? await authedDownloadTarget(path) : { url, headers };
  const destination = `${FileSystem.cacheDirectory}${safeName(filename)}`;
  const result = await FileSystem.downloadAsync(target.url, destination, { headers: target.headers });
  if (result.status !== 200) {
    let message = `Download failed (${result.status})`;
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
      if (body?.error) message = body.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Saved', `File saved to ${result.uri}`);
    return result.uri;
  }
  await Sharing.shareAsync(result.uri, { mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined });
  return result.uri;
}

export async function writeAndShare({ filename, content, encoding = 'utf8', mimeType, dialogTitle }) {
  const destination = `${FileSystem.cacheDirectory}${safeName(filename)}`;
  await FileSystem.writeAsStringAsync(destination, content, { encoding: encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Saved', `File saved to ${destination}`);
    return destination;
  }
  await Sharing.shareAsync(destination, { mimeType, dialogTitle });
  return destination;
}

export async function readFileBase64(uri) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

const CART_FILE = `${FileSystem.documentDirectory}huntstag_magic_poster_cart.json`;

export async function loadJsonFile(path = CART_FILE, fallback = []) {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return fallback;
  }
}

export async function saveJsonFile(value, path = CART_FILE) {
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  } catch { /* best effort -- cart just won't survive a restart */ }
}
