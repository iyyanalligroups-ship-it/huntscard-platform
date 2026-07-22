/**
 * Config persistence for the encode tool.
 * -----------------------------------------------------------------------
 * Stores backendUrl, publicBaseUrl, and (after a successful login) the
 * admin's session token, in a plain JSON file -- so an employee logs in
 * once and the app remembers it, and the backend URL survives restarts
 * without needing a .env file on every machine.
 *
 * Location:
 *   - Packaged inside Electron: app.getPath('userData')/config.json
 *     (Windows: %APPDATA%/HuntsTAG Encode Tool/config.json)
 *   - Running via `npm run gui` in dev: ./local-config.json, next to
 *     this file (already gitignored alongside .env)
 *
 * Deliberately plain fs + JSON, not electron-store, so this file works
 * unchanged in both contexts without an Electron-only dependency.
 */

const fs = require('fs');
const path = require('path');

function resolveConfigPath() {
  // Only require('electron') when actually running inside Electron --
  // this file is also required from plain `node gui-server.js` in dev,
  // where the 'electron' package may not even be installed as a runtime
  // dependency of THIS process.
  if (process.versions && process.versions.electron) {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'config.json');
    } catch {
      // fall through to the dev-mode path below
    }
  }
  return path.join(__dirname, 'local-config.json');
}

const CONFIG_PATH = resolveConfigPath();

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(partial) {
  const current = readConfig();
  const merged = { ...current, ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

function clearSavedSession() {
  const current = readConfig();
  delete current.session;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
}

module.exports = { readConfig, writeConfig, clearSavedSession, CONFIG_PATH };
