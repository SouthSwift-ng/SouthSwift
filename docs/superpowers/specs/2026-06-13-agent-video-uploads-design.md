# Agent Video Uploads — Design Spec

**Date:** 2026-06-13
**Status:** Approved (pending implementation plan)

## Goal

Let verified agents upload video on SouthSwift in two places:

1. **Listing tour videos** — up to **3 videos, ≤100MB each**, attached to a property listing and shown on the listing detail page alongside the photo gallery.
2. **Agent intro video** — **1 video, ≤100MB**, attached to the agent's profile and shown on the public agent profile page.

## Approach

Extend the existing media-upload pattern already used for photos and verification documents:

```
browser → multipart POST → multer → multer-storage-cloudinary → Cloudinary
        → secure_url stored in Postgres
```

We deliberately **do not** introduce signed direct-to-Cloudinary browser uploads in this iteration. That scales better for large files but adds a signature endpoint, CORS handling, and a second upload path — overkill for the MVP. It is the documented future upgrade path if backend upload timeouts become a problem.

`multer-storage-cloudinary` streams each file to Cloudinary as the request is parsed rather than buffering the whole file in memory, so 100MB uploads are safe for Render's free-tier RAM. The real risk is **time**: a 100MB upload on a slow Nigerian mobile connection can exceed the current 60s axios timeout, so video-bearing requests use a longer client timeout (180s).

## Data Model

Two idempotent `ALTER TABLE` statements added to `initDB()` in `backend/config/db.js` (the project convention — all schema changes live in `initDB()`):

```sql
ALTER TABLE listings        ADD COLUMN IF NOT EXISTS videos          TEXT[];
ALTER TABLE agent_profiles  ADD COLUMN IF NOT EXISTS intro_video_url TEXT;
```

- `listings.videos` mirrors the existing `listings.images TEXT[]` column.
- `agent_profiles.intro_video_url` holds a single Cloudinary secure_url.

## Component 1 — Listing Tour Videos

**Upload middleware (`backend/middleware/upload.js`)**

Replace `uploadListingImages` with `uploadListingMedia`:

- `multer(...).fields([{ name: 'images', maxCount: 6 }, { name: 'videos', maxCount: 3 }])`.
- One `CloudinaryStorage` whose `params` is a function of `(req, file)`:
  - `videos` field → `resource_type: 'video'`, `folder: 'southswift/listings-videos'`, `allowed_formats: ['mp4','mov','webm']`.
  - otherwise → `resource_type: 'image'`, `folder: 'southswift/listings'`, `allowed_formats: ['jpg','jpeg','png','webp']`.
- `fileFilter`: accept `image/(jpeg|jpg|png|webp)` on the `images` field; accept `video/(mp4|quicktime|webm)` on the `videos` field; reject otherwise with a clear message.
- `limits: { fileSize: 100 * 1024 * 1024 }` (100MB).

**Route (`backend/routes/listings.js`)**

Import `uploadListingMedia` instead of `uploadListingImages` in the existing `POST /` handler. The error wrapper maps `LIMIT_FILE_SIZE` → `"File too large (max 100MB)."`.

**Controller (`backend/controllers/listingController.js`)**

`createListing` currently reads `req.files` as an array (from `.array('images')`). With `.fields()`, `req.files` becomes an object keyed by field name. Update:

```js
const images = req.files?.images?.length
  ? req.files.images.map(f => f.path)
  : (Array.isArray(req.body.images) ? req.body.images : []);
const videos = req.files?.videos?.length
  ? req.files.videos.map(f => f.path)
  : [];
```

Add `videos` to the `INSERT INTO listings (...)` column list and values.

**Frontend — `createListing` API (`frontend/src/utils/api.js`)**

Append `videos` files to the same `FormData` (mirroring the `images` handling) and raise the request timeout to `180000` ms.

**Frontend — Create Listing form (`frontend/src/pages/DealDetail.jsx`, `CreateListing`)**

- New `videos` state + `handleVideos` handler that slices `e.target.files` to 3.
- A `<input type="file" accept="video/*" multiple>` control labelled "Property Video Tour (up to 3)".
- Preview as a filename list (lightweight — no inline `<video>` previews needed pre-upload).
- Include `videos` in the `data` object passed to `createListing`.

## Component 2 — Agent Intro Video

Kept on a **separate endpoint from verification** so an already-verified agent can add or replace a video without resetting `verification_status`.

**Upload middleware (`backend/middleware/upload.js`)**

New `uploadIntroVideo`:

- `multer(...).single('intro_video')`.
- `CloudinaryStorage` → `resource_type: 'video'`, `folder: 'southswift/agent-videos'`, `allowed_formats: ['mp4','mov','webm']`, `public_id` keyed by `req.user.id`.
- `fileFilter`: accept `video/(mp4|quicktime|webm)` only.
- `limits: { fileSize: 100 * 1024 * 1024 }`.

**Route (`backend/routes/agents.js`)**

```
POST /api/agents/intro-video   (protect, agentOnly) → agentController.uploadIntroVideo
```

Wrapped in the same error handler pattern (`LIMIT_FILE_SIZE` → friendly message).

**Controller (`backend/controllers/agentAdminController.js`)**

- New `agentController.uploadIntroVideo`: read `req.file?.path`; if missing, 400. `UPDATE agent_profiles SET intro_video_url=$1, updated_at=NOW() WHERE user_id=$2`; return `{ intro_video_url }`.
- `agentController.getAgent`: add `ap.intro_video_url` to the SELECT so the public profile can render it. (`getAgents` list view is left unchanged — the video belongs on the detail page.)

**Frontend — API (`frontend/src/utils/api.js`)**

`uploadIntroVideo(file)` — builds `FormData` with `intro_video`, posts to `/agents/intro-video` as multipart with a 180s timeout.

**Frontend — Dashboard (`frontend/src/pages/Dashboard.jsx`)**

A small "Intro Video" upload card (within the agent's view): file input `accept="video/*"`, submit button calling `uploadIntroVideo`, success/error toast.

**Frontend — Public profile (`frontend/src/pages/DealDetail.jsx`, `AgentProfile`)**

When `agent.intro_video_url` is present, render a `<video controls>` block in the hero/bio area.

## Component 3 — Display

- **`frontend/src/pages/ListingDetail.jsx`**: a "Video Tour" section below the photo gallery that maps `listing.videos` (guard with `listing.videos?.length`) to `<video controls playsInline>` elements with sensible max dimensions.
- **`AgentProfile`**: single `<video controls playsInline>` when `intro_video_url` exists.

## Limits, Validation & Error Handling

- Counts capped by `maxCount` (server) and client-side `slice` (browser).
- `LIMIT_FILE_SIZE` surfaces as `"File too large (max 100MB)."`.
- Non-video files on a video field are rejected by `fileFilter` with a clear message.

**Known trade-off:** multer's `limits.fileSize` is global per request, so raising it to 100MB on the listings route relaxes the previous 5MB-per-photo cap. Cloudinary still enforces the per-field format whitelist, and realistic photo sizes remain small, so this is acceptable for the MVP. Agent verification docs (`uploadAgentDocs`) are unchanged by this work and keep their 10MB cap.

## Out of Scope

- Signed direct-to-Cloudinary browser uploads.
- Video transcoding / thumbnail generation / poster frames.
- Editing or removing individual videos after upload (replace-only for the agent intro video; listing videos are set at creation, consistent with how photos work today).
- Showing video on listing cards / agent list cards.

## Verification

No test framework exists in this repo (per project convention). Verify with:

- `node --check` on every changed backend file (`middleware/upload.js`, `routes/listings.js`, `routes/agents.js`, `controllers/listingController.js`, `controllers/agentAdminController.js`, `config/db.js`).
- `npm run build` in `frontend/` to confirm the React build compiles.
- Manual smoke-test checklist:
  1. Create a listing with 1–3 videos → videos play on the listing detail page.
  2. Upload an agent intro video from the dashboard → plays on the public agent profile.
  3. Oversized / wrong-type file → friendly error, no crash.
  4. Create a listing with photos but no video → unchanged behaviour (regression check).
