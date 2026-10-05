# huntsTAG Mobile

Expo / React Native client for the existing `../backend` API. It uses the
same client accounts and data as `../client-app`.

## Included flows (parity with client-app)

**Public (no login):** Home (the website's engagement homepage: AR, Zing, editions, Magic Business Card, contact backup, order tracking, device protection, profession tabs, contact form/chat, live plans with style swatches, optional WhatsApp button via EXPO_PUBLIC_WHATSAPP_NUMBER), Shop (plans, variants, coupons), Catalog, Magic Poster gallery + cart, Contact Us, About, What is HuntsWorld, FAQ, Chat Support gate, Open a Card (QR scan / link), public card page (tabs, exchange contact, save, share, QR, deactivated-card ticket), Magic Camera / 3D / AR via the website's own pages in a camera WebView.

**Auth:** password + phone-OTP login, registration (gender/DOB/designation), 3-step forgot password with resend cooldown, forced password change, admin impersonation deep link (huntstag://impersonate?token=&clientId=).

**Dashboard:** overview (KPIs with live tap count, completeness donut, order progress, Zing, card picker, QR overlay, device protection), Appointment Requests (calendar, week grid, filters, preview), Profile preview, Profile Settings (banner, logo, AR banner, 3D model, AR links, identity, private details, tabs, highlights), Contacts (phone import, vCard/Excel import-export, template, photos, appointment requests), AR Layout (drag editor + controls), Magic Business Card (image/video/3D upload, go-live, QR colours, component positions, download with QR), Track Orders, Settings (password, card pause, per-card pause), Notifications, Device Protection Check.

**Payments:** Razorpay checkout runs in a WebView; orders are created and verified by the same backend endpoints as the website. Invoices download and open in the share sheet.

Not ported: Web Push (browser-only; the bell polls instead) and the experimental HuntsEngine Test page.

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

## Building the installable apps

The cloud build needs a free Expo account (`npx eas-cli login`). No Android Studio or Mac is required.

```powershell
npm install
npx eas-cli build --platform android --profile preview     # produces an installable .apk
npx eas-cli build --platform ios --profile production      # produces an .ipa (needs an Apple Developer account, $99/yr)
```

`eas.json` points both profiles at `https://api.huntstag.com`; change `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` there
if your API lives elsewhere. Upload the finished `.apk` / `.ipa` (or paste your Play Store / App Store link) in the
admin panel under **App Downloads**, and it appears in the website footer.

Note: the Android project in `android/` also builds locally with JDK 17 + Android SDK (`cd android; .\gradlew assembleRelease`).
