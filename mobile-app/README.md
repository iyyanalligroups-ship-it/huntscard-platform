# huntsTAG Mobile

Expo / React Native client for the existing `../backend` API. It uses the
same client accounts and data as `../client-app`.

## Included flows

- Email/phone + password login
- Phone OTP login
- Registration, forgot password, and forced password change
- Secure JWT storage with `expo-secure-store`
- Dashboard, card preview, profile completeness, and native share (Zing)
- Profile editing and profile-photo upload
- Live card plan catalog (checkout hands off to the existing Razorpay web flow)
- Card and Magic Poster order tracking
- Contacts CRUD
- Received/sent appointments with accept, decline, and remove actions
- Polling support chat
- Account, password, public-profile pause, and per-card pause controls
- Android Device Protection Check in a development/native build

Browser-only AR target tracking, 3D editing, Web Push, invoice download, and
Razorpay checkout are not copied into Expo yet. The shop opens the existing
web checkout so payments continue using the production-tested verification
flow.

## Requirements

- Node.js 22.13 or newer
- The backend running locally or on a reachable server
- Expo Go for the standard client flows, or an Android development build for
  the custom Device Protection native module
- Android Studio/JDK 17 when building Android locally

## Configure the API

Copy `.env.example` to `.env` and replace the example LAN address:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
EXPO_PUBLIC_WEB_URL=http://192.168.1.10:5173
```

Use the computer's LAN IP when testing on a physical phone. `localhost` on a
phone points to the phone itself. Without `.env`, Android emulators default to
`http://10.0.2.2:4000` and iOS simulators default to
`http://localhost:4000`.

The backend must allow the phone to connect to its port. For HTTP development
the Android project allows cleartext traffic; production should use HTTPS.

## Run with Expo Go

```powershell
npm install
npm start
```

Scan the QR code in Expo Go. The Device Protection screen explains that its
native checks are unavailable in Expo Go; every API-backed client screen still
works.

## Run the Android development build

The checked-in `android/` project retains the existing `DeviceSafetyPackage`
and is wired to Expo Modules.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
npm run android
```

After the first native build, use `npm run start:dev-client` for normal JS
development. Rebuild after changing native modules or Expo config plugins.

## Validation

```powershell
npm run lint
npm test -- --runInBand
npx expo install --check
npx expo export --platform android
```
