# AR Layout Editor -- drag-and-drop control over the HuntsAR World panel

## What this adds

**Backend:**
- `models/ArLayout.js` -- new singleton config document storing one
  shared arrangement (video, contact, portfolio, social, huntsworld
  positions as 0-100 percentages)
- `routes/admin.js` -- `GET/PUT /api/admin/ar-layout` (admin-only, used
  by the editor)
- `routes/public.js` -- `GET /api/public/ar-layout` (no auth, the mobile
  app reads this)

**Admin app:**
- New **"AR Layout"** page in the sidebar. A 2D canvas represents the AR
  card area -- drag each colored block (AR Video/Photo, Contact Info,
  Portfolio, Social Icons, Huntsworld Link) to where it should appear,
  click **Save layout**. This is ONE shared arrangement for every
  client's card, not per-client.

**Mobile app:**
- `HuntsARPanelScene.tsx` rebuilt to fetch this layout and convert the
  editor's 2D percentage positions into real 3D coordinates -- nothing
  about the arrangement is hardcoded in the app anymore. If the layout
  fetch fails for any reason, it falls back to sensible defaults rather
  than breaking the panel.
- Portfolio and Huntsworld now render as their own small tappable
  blocks (matching your description of separate positioned elements),
  in addition to still appearing in the social icon row if you'd rather
  keep them there too -- both can coexist since they're independent UI
  elements.

## How to use it

1. Install backend + admin-app files, restart both.
2. Open admin app -> **AR Layout** in the sidebar.
3. Drag blocks to where you want them (video top-center, contact below
   it, portfolio left, social right, huntsworld bottom -- or whatever
   arrangement you prefer).
4. Click **Save layout**.
5. Replace `HuntsARPanelScene.tsx` in your mobile-app project. Since
   Metro is running, this hot-reloads -- no rebuild needed.
6. Scan a card's QR code again in HuntsAR World -- it now fetches your
   saved arrangement live, every time.

## What I verified
- Full mobile app type-checks and lints clean, zero errors.
- Tested the percentage-to-3D conversion math directly with the schema's
  default values -- confirmed video lands upper-center, portfolio left
  of center, social right of center, huntsworld toward the bottom,
  exactly matching what dragging those blocks to those positions in the
  editor would visually suggest.
- Admin app builds clean.

## What's still a placeholder / known limitation
- The canvas is a flat 2D representation -- there's no live AR preview
  showing exactly how it'll look in 3D space on a real card. For a true
  WYSIWYG 3D preview, that's a separate, larger piece of work (an
  in-browser 3D scene mimicking Viro's exact rendering) -- this version
  gets you real control now; a live preview can come later if the 2D
  approximation isn't precise enough once you see it on a real phone.
- Positions are the same for every element size -- a very long name or
  long portfolio URL could visually overlap a neighboring element if
  they're dragged close together. Worth testing a few real profiles
  once this is live.
