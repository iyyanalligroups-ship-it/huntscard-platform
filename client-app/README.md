# huntsTAG Client App

React (Vite) app for clients: log in with the credentials admin sent you,
change your temporary password once, then edit your profile.

## Setup

```bash
cd client-app
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:4000
npm run dev
```

Runs on http://localhost:5173. Make sure `../backend` is running first.

## Pages

- `/login` — email + password (issued by admin)
- `/change-password` — forced on first login (`mustChangePassword: true`)
- `/dashboard` — card preview + editable attributes: phone, WhatsApp,
  Instagram, Twitter, public email, portfolio link, Huntsworld link
- `/dashboard/upgrade` — request an upgrade to another active card plan
- `/dashboard/new-card` — request an additional/replacement card

`/dashboard` and its two sub-pages share a top nav (Dashboard / Upgrade
Card / Buy New Card / Log out) via `components/Layout.jsx`. Both request
pages are genuine requests, not instant purchases — no payment gateway is
wired up yet, so they land in the admin app's Requests screen for manual
follow-up.

## Not included yet

- Public tap page (`/c/:clientId`) — this app is the *logged-in* client
  dashboard only. The no-login page that opens when someone taps the
  physical card is a separate, unauthenticated frontend — build it against
  `GET /api/public/profile/:clientId` when you get to that piece.
- Password reset ("forgot password") flow
