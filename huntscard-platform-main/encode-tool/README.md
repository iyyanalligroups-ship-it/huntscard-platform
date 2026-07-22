# HuntsTAG NFC Encode Tool

Writes a client's tap URL to an NTAG216 card via the ACR1252U and locks
it with a password. Runs on the machine physically connected to the
reader -- not deployed anywhere.

Two ways to run it:
- **`npm run gui`** -- opens in your normal browser at `http://localhost:5175`. Good for development.
- **`npm run electron`** -- opens as its own desktop window. This is what gets packaged into the installer employees actually use.

Both run the exact same `gui-server.js` and `lib.js` -- Electron doesn't
reimplement anything, it just wraps the same server in a native window.

There's also `encode.js`, the original terminal-only tool (`npm start`).
It still connects to MongoDB directly and hasn't been migrated to the
API-based approach below -- that's fine for now because it's a
dev/fallback tool only, never packaged or distributed (it's excluded
from `electron-builder`'s file list), so its `.env`'s `MONGODB_URI`
never leaves your own machine. Worth migrating it the same way
eventually for consistency, just not urgent since it doesn't ship.

## What changed recently: no more direct database access

This tool used to connect straight to MongoDB with a connection string
in `.env`. That's gone now -- everything goes through the backend API
using the admin's own login token (`backend/routes/admin.js`, the
`/encode/*` routes). This matters because the tool is now meant to be
installed on multiple employees' machines: a raw database credential
baked into every install would mean anyone who ever extracted it had
full read/write access to the whole client database, bypassing login
entirely. Now the worst a leaked install can do is nothing more than
what that specific employee's own admin account is already allowed to
do -- and revoking their admin account instantly cuts off the app too.

## Prerequisites (for building/developing)

- Node.js installed
- ACR1252U-M1 plugged in via USB (only needed to actually write cards, not to build/develop)
- PC/SC drivers installed for your OS (usually automatic on Windows/macOS; on Linux you may need `pcscd` running: `sudo apt install pcscd pcsc-tools`)

## Local development

```bash
cd encode-tool
npm install
npm run rebuild:node
npm run gui
```

Open `http://localhost:5175`. The backend (`../backend`, `npm run dev`)
needs to be running first -- this tool logs into it as an admin before
doing anything.

To test the Electron-wrapped version instead of the browser version:

```bash
npm run rebuild:electron
npm run electron
```

### Why two rebuild commands

`nfc-pcsc`'s reader driver is a native module -- it has to be compiled
specifically for whichever JavaScript runtime is going to load it.
Plain `npm run gui` runs under your system's regular Node.js. `npm run
electron` runs under Electron's own bundled Node.js, which is almost
always a *different* version. A build made for one will fail to load
under the other with an `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION`
mismatch error -- that's not a bug, it just means you switched modes
without re-running the matching rebuild command first.

**Rule of thumb:** run `npm run rebuild:node` before `npm run gui`, and
`npm run rebuild:electron` before `npm run electron` or `npm run
dist`, any time you're switching from having just used the other one.
You don't need to do this every single time -- only when switching.

## Settings (Backend URL / Public base URL)

Click the ⚙ Settings button (top right, works before or after login).
Two fields:

- **Backend URL** -- where the Express API is running. `http://localhost:4000` while developing; your real production API (e.g. `https://api.huntstag.com`) for real use.
- **Public base URL** -- gets written onto every card as `{publicBaseUrl}/c/{clientId}`. Get this wrong and every card encoded until it's fixed points at the wrong domain.

These are saved to a local config file per install (`local-config.json`
in dev, or Electron's app-data folder once packaged) -- set once, stays
set across restarts. A `.env` file (see `.env.example`) only seeds the
very first run if no settings have been saved yet; once Settings has
been saved once through the UI, `.env` is ignored for these two values.

## Access control

Nothing works until you log in with a real admin account (checked
against `POST /api/admin/auth/login` on the backend, same login the
admin webpage uses). Each employee logs in with their **own** admin
account -- not a shared login. Create admin accounts from the admin
webpage's Team page. Revoking someone's admin account there also cuts
off their access to this tool.

Login is remembered across restarts (saved locally, same place as the
other settings) so employees don't have to log back in every time they
open the app -- only when they explicitly log out, or their session
token actually expires.

## Building an installer for employees

```bash
cd encode-tool
npm install
npm run dist
```

This produces a Windows installer (`.exe`, NSIS-based) in
`encode-tool/dist-electron/`. Share that file with employees -- they
run it, it installs like normal Windows software (Start Menu shortcut,
desktop shortcut, uninstaller), then they open it, go to Settings once
to point it at the real backend, and log in with their own account.

**Before your first real build:** add a real app icon at
`encode-tool/electron/icon.ico` and add `"icon": "electron/icon.ico"`
back into both `package.json`'s `build.win` section and
`electron/main.js`'s `BrowserWindow` options (left out for now since a
missing icon file would fail the build).

## Auto-update

The app checks for a newer version on startup and every 4 hours
afterward, using [electron-updater](https://www.electron.build/auto-update)
against GitHub Releases on this repo. For this to actually work:

1. You need a [GitHub personal access token](https://github.com/settings/tokens) with `repo` scope, set as an environment variable: `GH_TOKEN=ghp_...`
2. Bump the `version` field in `encode-tool/package.json`
3. Run `npm run dist -- --publish always` instead of plain `npm run dist` -- this builds AND uploads the installer plus the update metadata files to a new GitHub Release automatically
4. Employees with an older version installed get notified and updated automatically the next time they open the app (or within 4 hours if it's already open)

Until you've published at least one release this way, auto-update
silently does nothing (it just fails to find any release, no crash) --
that's expected on the very first build.

## Known area to double-check on real hardware

The password-lock step (`lockCard` in `lib.js`) writes directly to the
NTAG216's configuration pages (227-230) using page addresses and byte
layouts from the NTAG216 datasheet, and now verifies both the
protection flag AND the password itself actually took effect (see the
`nativeAuth` verification added after a real false-positive was found
during testing). This should be solid, but if anything about reader
firmware behavior ever seems off, the **Recover a card** tab exists
specifically to safely undo a bad write using its known password.
