# Magic Camera (standalone)

Open the camera, point it at a Magic Poster or Magic Business Card, and the video plays on it.
No account or login. Split out of `client-app/src/pages/MagicCamera.jsx`.

- `web/` – the camera page only (React + Vite, MindAR + three.js). Static site: host it on any HTTPS host.
- `app/` – Expo/React Native shell that asks for camera permission and opens the hosted page.

## Run it
1. **Backend** – needs the existing huntsTAG API (`GET /api/public/magic-art`, `/uploads`).
2. **Web** – `cd web && cp .env.example .env` (set `VITE_API_URL`), then `npm install --legacy-peer-deps && npm run build`.
   Deploy `web/dist` over **HTTPS** (browsers only allow camera on secure origins; `localhost` also works for testing).
   Serve it with an SPA fallback (all paths → `index.html`). `/<clientId>` scans one person's card only.
3. **App** – `cd app && cp .env.example .env` (set `EXPO_PUBLIC_CAMERA_URL` to the hosted web address),
   `npm install --legacy-peer-deps`, then `npx expo start` or build with `npx expo run:android`.

The API must send CORS headers allowing the web origin.
