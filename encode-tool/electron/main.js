/**
 * Electron main process for the HuntsTAG Encode Tool.
 * -----------------------------------------------------------------------
 * This does NOT reimplement any of the tool's logic -- it starts the
 * exact same gui-server.js (same Express routes, same nfc-pcsc reader
 * handling, same lib.js hardware functions that already passed real
 * hardware testing) inside Electron's main process, then opens a normal
 * BrowserWindow pointed at it. From the reader's point of view this is
 * identical to running `npm run gui` and opening it in Chrome -- Electron
 * bundles its own Node.js runtime, so nfc-pcsc's native USB/PC-SC access
 * works completely unchanged.
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const PORT = process.env.GUI_PORT || 5175;

// Single-instance lock -- without this, opening the app a second time
// (e.g. double-clicking the desktop icon again while it's already
// running, or a previous window closing without the process fully
// exiting) tries to start a SECOND gui-server.js, which crashes with
// "address already in use" because the first copy is still holding
// port 5175. Requesting the lock BEFORE requiring gui-server.js means a
// second launch never even attempts to bind the port -- it just quits
// immediately and hands off to the instance that's already running.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  // Starting gui-server.js just by requiring it -- it calls app.listen()
  // and sets up the NFC reader watcher as soon as this module loads, same
  // as running it directly with `node gui-server.js`.
  const { server } = require(path.join(__dirname, '..', 'gui-server.js'));

  let mainWindow = null;
  let serverReady = false;

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 900,
      minHeight: 640,
      title: 'HuntsTAG Encode Tool',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Any link that would normally open a new browser tab (e.g. "View live
    // page" preview links) opens in the person's real default browser
    // instead of a second app window -- this app is the encode tool, not a
    // general browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // Someone tried to open a second copy -- bring the existing window to
  // the front instead of doing nothing (or crashing, as before).
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function startApp() {
    createWindow();

    // Check for a newer published release on startup, then again every 4
    // hours while the app stays open -- silent unless an update is
    // actually found (see log/dialog wiring below).
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }

  server.on('error', (err) => {
    if (serverReady) return; // already up and running -- a later transient error shouldn't quit the whole app
    const message =
      err.code === 'EADDRINUSE'
        ? "HuntsTAG Encode Tool couldn't start because something else on this computer is already using port " +
          PORT +
          '. This usually means the app is already running somewhere (check your taskbar and system tray), or a previous session didn\'t close properly. Restarting your computer will also clear this.'
        : `HuntsTAG Encode Tool couldn't start: ${err.message}`;
    dialog.showErrorBox('HuntsTAG Encode Tool', message);
    app.quit();
  });

  app.whenReady().then(() => {
    if (server.listening) {
      serverReady = true;
      startApp();
    } else {
      server.once('listening', () => {
        serverReady = true;
        startApp();
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // electron-updater already shows its own native "restart to update"
  // prompt via checkForUpdatesAndNotify() -- these listeners are just for
  // visibility in logs while this is still new, easy to remove later.
  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error:', err.message);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[auto-update] version ${info.version} downloaded, will install on restart`);
  });
}
