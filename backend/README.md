# Intro Backend (Phase 1 MVP)

Express + MongoDB backend: client registration, login, profile edit, and
the public tap page data.

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env: paste your MongoDB Atlas URI and a random JWT_SECRET
npm run dev
```

Server starts on http://localhost:4000 (or whatever PORT you set).

## Two separate user types: client and admin

Clients and admins are different collections (`Client` vs `Admin`), with
different login endpoints, and JWTs tagged `type: 'client'` or
`type: 'admin'`. A client token cannot pass `requireAdmin`, and vice
versa, even though both are signed with the same secret -- this is what
enforces "only admin can write to a card" at the software level, not just
by convention.

There is **no public admin registration endpoint on purpose**. Create the
first (and any further) admin account with:

```bash
node seed-admin.js "you@example.com" "a-strong-password" "Your Name"
```

Additional team members can be invited from the admin webpage's Team
screen once you're logged in — same "generate temp password, show once"
pattern as client accounts, and they get the same full admin access.

## Card plans need seeding once

Card types are no longer hardcoded (`basic`/`pro`/`elite`) -- they're a
real `CardPlan` collection, managed from the admin webpage's Card Plans
screen. Seed the three original defaults so client creation has options
from the start:

```bash
node seed-plans.js
```

Safe to run multiple times -- skips any plan whose key already exists.
Without this, the "Create client" dropdown on the admin webpage will be
empty until you add a plan manually.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/login | none (rate-limited) | Client login, returns JWT |
| POST | /api/auth/change-password | client JWT | Client sets own password |
| GET | /api/profile/me | client JWT | Get own profile |
| PUT | /api/profile/me | client JWT | Update own profile |
| GET | /api/public/profile/:clientId | none | What the tap page fetches |
| GET | /api/public/vcard/:clientId | none | Download .vcf contact file |
| GET | /api/public/plans | none | Active card plans (for the client's upgrade picker) |
| GET | /c/:clientId | none | The public tap page itself (HTML) |
| POST | /api/profile/requests | client JWT | Submit an upgrade or new-card request |
| GET | /api/profile/requests | client JWT | List own request history |
| POST | /api/admin/auth/login | none (rate-limited) | Admin login, returns admin JWT |
| POST | /api/admin/auth/change-password | admin JWT | Admin/team sets own password |
| GET | /api/admin/stats | admin JWT | Dashboard overview counts |
| GET | /api/admin/plans | admin JWT | List card plans |
| POST | /api/admin/plans | admin JWT | Create a card plan |
| PATCH | /api/admin/plans/:id | admin JWT | Edit a plan / toggle active |
| GET | /api/admin/clients?status=pending-encode | admin JWT | List clients awaiting card encoding |
| POST | /api/admin/clients | admin JWT | Create a client account |
| PATCH | /api/admin/clients/:clientId/paid | admin JWT | Mark a client as paid |
| GET | /api/admin/team | admin JWT | List admin/team accounts |
| POST | /api/admin/team | admin JWT | Invite a new admin/team member |
| DELETE | /api/admin/team/:id | admin JWT | Remove a team member (blocked for self and for the last remaining admin) |
| GET | /api/admin/requests?status=pending | admin JWT | List client upgrade/new-card requests |
| PATCH | /api/admin/requests/:id | admin JWT | Approve/reject/fulfill a request (approving an upgrade applies it immediately) |

## Real-world order of operations

1. Client registers on the website, fills in their profile — this works
   immediately, no card needed yet
2. Client pays (manually marked via the admin endpoint above for now;
   wire up a Razorpay webhook to call it automatically later)
3. Admin runs the encode tool, which only lists clients with `paid: true`
   and `chipEncoded: false`
4. Admin encodes and ships the physical card
5. Client keeps editing their profile via the website exactly as before —
   nothing about their account access ever depended on the card being
   encoded; the card is just a pointer to their always-editable profile

## Quick manual test (with Postman/Insomnia or curl)

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","loginEmail":"test@example.com","password":"password123"}'

# copy the token from the response, then:
curl http://localhost:4000/api/profile/me \
  -H "Authorization: Bearer <token>"

curl -X PUT http://localhost:4000/api/profile/me \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phone":"9999999999","portfolioUrl":"https://example.com"}'

# public page -- no token needed, use the clientId from the register response
curl http://localhost:4000/api/public/profile/<clientId>
```

## Not included yet (add when you get there)

- React frontend (register/login/profile-builder/public pages)
- vCard fields beyond name/phone/email/portfolio -- extend as needed
- Payment integration (Razorpay) -- gate `paid: true` on successful payment
  before a client shows up in the encode tool's list
- Full 30+ field profile schema from the original report -- current
  schema is the MVP subset scoped in chat
