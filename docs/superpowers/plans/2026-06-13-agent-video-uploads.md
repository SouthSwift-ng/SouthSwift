# Agent Video Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let verified agents upload up to 3 tour videos per property listing and 1 intro video on their profile, all rendered with native `<video>` players.

**Architecture:** Extend the existing `multer` + `multer-storage-cloudinary` upload pattern. Listing videos ride along in the existing create-listing multipart POST; the agent intro video gets its own dedicated endpoint so a verified agent can add/replace it without resetting verification status. Video URLs are stored in two new Postgres columns (`listings.videos TEXT[]`, `agent_profiles.intro_video_url TEXT`).

**Tech Stack:** Node/Express, PostgreSQL (`pg`), Cloudinary, React (CRA), axios.

**Testing note:** This repo has **no test framework** (project convention). Verification per task uses `node --check <file>` for backend JS and `npm run build` (from `frontend/`) for React. A manual smoke-test checklist is in Task 10. All commands below assume the working directory is the repo root: `C:\Users\oakin\Downloads\SouthSwift_MVP\southswift`.

---

### Task 1: Database columns

**Files:**
- Modify: `backend/config/db.js` (inside `initDB()`, after the "Add room share columns to listings" block, ~line 191)

- [ ] **Step 1: Add the idempotent ALTER statements**

Find this existing block in `initDB()`:

```js
    // Add room share columns to listings if not exists
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS is_room_share               BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS room_share_price_per_person BIGINT,
        ADD COLUMN IF NOT EXISTS room_share_slots            INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS room_share_slots_filled     INTEGER DEFAULT 0;
    `);
```

Immediately **after** it, insert:

```js
    // Add video columns (listing tour videos + agent intro video)
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS videos TEXT[];
    `);
    await client.query(`
      ALTER TABLE agent_profiles
        ADD COLUMN IF NOT EXISTS intro_video_url TEXT;
    `);
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/config/db.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add backend/config/db.js
git commit -m "feat: add videos + intro_video_url columns to schema"
```

---

### Task 2: Listing media upload middleware

**Files:**
- Modify: `backend/middleware/upload.js`

- [ ] **Step 1: Replace the listing image storage + middleware with combined media handling**

Find and replace this block:

```js
const listingStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'southswift/listings', allowed_formats: ['jpg','jpeg','png','webp'] },
});
```

with:

```js
const listingMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    if (file.fieldname === 'videos') {
      return {
        folder: 'southswift/listings-videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'webm'],
      };
    }
    return {
      folder: 'southswift/listings',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    };
  },
});
```

- [ ] **Step 2: Replace the `uploadListingImages` middleware with `uploadListingMedia`**

Find and replace this block:

```js
const uploadListingImages = multer({
  storage: listingStorage,
  limits: { files: 6, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpg, png, webp) are allowed.'), false);
  },
}).array('images', 6);
```

with:

```js
const uploadListingMedia = multer({
  storage: listingMediaStorage,
  // multer's fileSize limit is global per request — set to 100MB to allow video.
  // Cloudinary still enforces the per-field allowed_formats whitelist.
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'videos') {
      if (/^video\/(mp4|quicktime|webm)$/.test(file.mimetype)) return cb(null, true);
      return cb(new Error('Only video files (mp4, mov, webm) are allowed.'), false);
    }
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files (jpg, png, webp) are allowed.'), false);
  },
}).fields([
  { name: 'images', maxCount: 6 },
  { name: 'videos', maxCount: 3 },
]);
```

- [ ] **Step 3: Update the exports**

Find:

```js
module.exports = { uploadListingImages, uploadAgentDocs };
```

Replace with:

```js
module.exports = { uploadListingMedia, uploadAgentDocs };
```

- [ ] **Step 4: Verify syntax**

Run: `node --check backend/middleware/upload.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/upload.js
git commit -m "feat: uploadListingMedia middleware accepts images + videos"
```

---

### Task 3: Listing route + controller

**Files:**
- Modify: `backend/routes/listings.js`
- Modify: `backend/controllers/listingController.js` (`createListing`)

- [ ] **Step 1: Update the route import**

In `backend/routes/listings.js`, find:

```js
const { uploadListingImages } = require('../middleware/upload');
```

Replace with:

```js
const { uploadListingMedia } = require('../middleware/upload');
```

- [ ] **Step 2: Update the POST handler to use the new middleware + 100MB message**

Find:

```js
router.post('/', protect, agentOnly, (req, res, next) => {
  uploadListingImages(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB).' : 'Upload failed. Please check your files.' });
    next();
  });
}, createListing);
```

Replace with:

```js
router.post('/', protect, agentOnly, (req, res, next) => {
  uploadListingMedia(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 100MB).' : 'Upload failed. Please check your files.' });
    next();
  });
}, createListing);
```

- [ ] **Step 3: Update `createListing` to read fields object + insert videos**

In `backend/controllers/listingController.js`, find:

```js
    const images = req.files && req.files.length > 0
      ? req.files.map(f => f.path)
      : (Array.isArray(req.body.images) ? req.body.images : []);

    const result = await pool.query(
      `INSERT INTO listings
       (agent_id, title, description, property_type, bedrooms, bathrooms,
        rent_price, rent_period, address, city, state, amenities, images, latitude, longitude,
        is_room_share, room_share_price_per_person, room_share_slots)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [req.user.id, title, description, property_type||'apartment',
       bedrooms||1, bathrooms||1, rent_price, rent_period||'yearly',
       address, city, state, amenities, images, latitude||null, longitude||null,
       is_room_share, room_share_price_per_person, room_share_slots]
    );
```

Replace with (note `req.files` is now an object keyed by field name because the middleware uses `.fields()`; `videos` is inserted right after `images`, shifting later params):

```js
    const images = req.files?.images?.length
      ? req.files.images.map(f => f.path)
      : (Array.isArray(req.body.images) ? req.body.images : []);
    const videos = req.files?.videos?.length
      ? req.files.videos.map(f => f.path)
      : [];

    const result = await pool.query(
      `INSERT INTO listings
       (agent_id, title, description, property_type, bedrooms, bathrooms,
        rent_price, rent_period, address, city, state, amenities, images, videos, latitude, longitude,
        is_room_share, room_share_price_per_person, room_share_slots)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [req.user.id, title, description, property_type||'apartment',
       bedrooms||1, bathrooms||1, rent_price, rent_period||'yearly',
       address, city, state, amenities, images, videos, latitude||null, longitude||null,
       is_room_share, room_share_price_per_person, room_share_slots]
    );
```

- [ ] **Step 4: Verify syntax**

Run: `node --check backend/routes/listings.js`
Run: `node --check backend/controllers/listingController.js`
Expected: no output for both (exit 0).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/listings.js backend/controllers/listingController.js
git commit -m "feat: persist listing videos on create"
```

---

### Task 4: Frontend — listing upload API + create form

**Files:**
- Modify: `frontend/src/utils/api.js` (`createListing`)
- Modify: `frontend/src/pages/DealDetail.jsx` (`CreateListing`)

- [ ] **Step 1: Append videos in the `createListing` API helper and raise the timeout**

In `frontend/src/utils/api.js`, find:

```js
export const createListing  = (data)   => {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (k === 'images') {
      if (Array.isArray(v)) v.forEach(file => fd.append('images', file));
    } else if (k === 'amenities' && Array.isArray(v)) {
      v.forEach(item => fd.append('amenities[]', item)); // correct — sends each item separately
    } else if (Array.isArray(v)) {
      fd.append(k, JSON.stringify(v));
    } else if (v !== undefined && v !== null) {
      fd.append(k, v);
    }
  });
  return API.post('/listings', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000, // 60s for image uploads
  });
};
```

Replace with:

```js
export const createListing  = (data)   => {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (k === 'images') {
      if (Array.isArray(v)) v.forEach(file => fd.append('images', file));
    } else if (k === 'videos') {
      if (Array.isArray(v)) v.forEach(file => fd.append('videos', file));
    } else if (k === 'amenities' && Array.isArray(v)) {
      v.forEach(item => fd.append('amenities[]', item)); // correct — sends each item separately
    } else if (Array.isArray(v)) {
      fd.append(k, JSON.stringify(v));
    } else if (v !== undefined && v !== null) {
      fd.append(k, v);
    }
  });
  return API.post('/listings', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // 180s — videos can be large on slow connections
  });
};
```

- [ ] **Step 2: Add `videos` state to the `CreateListing` component**

In `frontend/src/pages/DealDetail.jsx`, find:

```js
  const [images, setImages]  = useState([]);
  const [previews, setPreviews] = useState([]);
```

Replace with:

```js
  const [images, setImages]  = useState([]);
  const [previews, setPreviews] = useState([]);
  const [videos, setVideos]  = useState([]);
```

- [ ] **Step 3: Add a `handleVideos` handler**

Find:

```js
  const handleImages = (e) => {
    const files = Array.from(e.target.files).slice(0, 6);
    setImages(files);
    setPreviews(files.map(f => URL.createObjectURL(f)));
  };
```

Immediately after it, add:

```js
  const handleVideos = (e) => {
    setVideos(Array.from(e.target.files).slice(0, 3));
  };
```

- [ ] **Step 4: Include `videos` in the submitted data**

Find:

```js
      const data = {
        ...form,
        amenities: form.amenities ? form.amenities.split(',').map(a => a.trim()) : [],
        images,
      };
```

Replace with:

```js
      const data = {
        ...form,
        amenities: form.amenities ? form.amenities.split(',').map(a => a.trim()) : [],
        images,
        videos,
      };
```

- [ ] **Step 5: Add the video file input to the form**

Find this line (the start of the Type + Beds block, which comes right after the Photos block):

```js
          {/* Type + Beds */}
```

Insert this block **immediately before** it:

```jsx
          {/* Videos */}
          <div>
            <label style={ps.label}>Property Video Tour (up to 3)</label>
            <input type="file" accept="video/*" multiple onChange={handleVideos}
              style={{ ...ps.input, padding: '6px' }}/>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              Optional. Up to 3 short walkthrough videos (max 100MB each).
            </p>
            {videos.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#444' }}>
                {videos.map((f, i) => <li key={i}>{f.name}</li>)}
              </ul>
            )}
          </div>

          {/* Type + Beds */}
```

- [ ] **Step 6: Commit** (build verification happens at the end of Task 5, which also touches the frontend)

```bash
git add frontend/src/utils/api.js frontend/src/pages/DealDetail.jsx
git commit -m "feat: video upload field on create-listing form"
```

---

### Task 5: Frontend — listing video display

**Files:**
- Modify: `frontend/src/pages/ListingDetail.jsx`

- [ ] **Step 1: Render the video tour after the gallery**

Find:

```jsx
        <div style={s.body}>
```

(This is the first occurrence — it directly follows the closing `</div>` of the GALLERY block.) Insert this block **immediately before** that line:

```jsx
        {/* VIDEO TOUR */}
        {listing.videos?.length > 0 && (
          <div style={{ background:'white', borderRadius:14, padding:'18px 20px', border:'1px solid #E5E7EB', marginBottom:20 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:G, margin:'0 0 12px' }}>Video Tour</h3>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {listing.videos.map((src, i) => (
                <video key={i} src={src} controls playsInline preload="metadata"
                  style={{ width:'100%', maxWidth:480, borderRadius:10, background:'#000' }}/>
              ))}
            </div>
          </div>
        )}

        <div style={s.body}>
```

(`G` is the green brand constant already used elsewhere in this file, e.g. the thumbnail border.)

- [ ] **Step 2: Verify the frontend builds (covers Tasks 4 + 5)**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully.` (warnings are acceptable; errors are not). Then `cd ..`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ListingDetail.jsx
git commit -m "feat: video tour player on listing detail page"
```

---

### Task 6: Agent intro video — backend

**Files:**
- Modify: `backend/middleware/upload.js` (add `uploadIntroVideo`)
- Modify: `backend/routes/agents.js`
- Modify: `backend/controllers/agentAdminController.js` (add `uploadIntroVideo`, extend `getAgent`)

- [ ] **Step 1: Add the intro-video middleware**

In `backend/middleware/upload.js`, find the export line:

```js
module.exports = { uploadListingMedia, uploadAgentDocs };
```

Insert this **above** it:

```js
const introVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'southswift/agent-videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'webm'],
    public_id: `${req.user.id}-intro-${Date.now()}`,
  }),
});

const uploadIntroVideo = multer({
  storage: introVideoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^video\/(mp4|quicktime|webm)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only video files (mp4, mov, webm) are allowed.'), false);
  },
}).single('intro_video');

```

Then update the export line to:

```js
module.exports = { uploadListingMedia, uploadAgentDocs, uploadIntroVideo };
```

- [ ] **Step 2: Add the route**

In `backend/routes/agents.js`, find:

```js
const { uploadAgentDocs } = require('../middleware/upload');
```

Replace with:

```js
const { uploadAgentDocs, uploadIntroVideo } = require('../middleware/upload');
```

Then find:

```js
router.get('/my/listings',        protect, agentOnly, agentController.getAgentListings);
```

Insert this **above** it:

```js
router.post('/intro-video', protect, agentOnly, (req, res, next) => {
  uploadIntroVideo(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 100MB).' : 'Upload failed. Please check your file.' });
    next();
  });
}, agentController.uploadIntroVideo);
```

- [ ] **Step 3: Add the `uploadIntroVideo` controller**

In `backend/controllers/agentAdminController.js`, find:

```js
  // GET /api/agents/my/listings
  getAgentListings: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM listings WHERE agent_id=$1 ORDER BY created_at DESC', [req.user.id]
      );
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },
};
```

Replace with (adds the new method before the closing `};` of `agentController`; note: `agent_profiles` has no `updated_at` column, so it is intentionally not set here):

```js
  // GET /api/agents/my/listings
  getAgentListings: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM listings WHERE agent_id=$1 ORDER BY created_at DESC', [req.user.id]
      );
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // POST /api/agents/intro-video — agent uploads/replaces their profile intro video
  uploadIntroVideo: async (req, res) => {
    const intro_video_url = req.file?.path || null;
    if (!intro_video_url) return res.status(400).json({ error: 'No video file received.' });
    try {
      await pool.query(
        'UPDATE agent_profiles SET intro_video_url=$1 WHERE user_id=$2',
        [intro_video_url, req.user.id]
      );
      res.json({ intro_video_url });
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },
};
```

- [ ] **Step 4: Expose `intro_video_url` from `getAgent`**

Find:

```js
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.phone, u.city, u.state, u.avatar_url,
               ap.agency_name, ap.verification_status, ap.total_deals,
               ap.rating, ap.bio, ap.verified_at
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]);
```

Replace with:

```js
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.phone, u.city, u.state, u.avatar_url,
               ap.agency_name, ap.verification_status, ap.total_deals,
               ap.rating, ap.bio, ap.verified_at, ap.intro_video_url
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]);
```

- [ ] **Step 5: Verify syntax**

Run: `node --check backend/middleware/upload.js`
Run: `node --check backend/routes/agents.js`
Run: `node --check backend/controllers/agentAdminController.js`
Expected: no output for all three (exit 0).

- [ ] **Step 6: Commit**

```bash
git add backend/middleware/upload.js backend/routes/agents.js backend/controllers/agentAdminController.js
git commit -m "feat: agent intro-video upload endpoint"
```

---

### Task 7: Frontend — intro video API + dashboard upload card

**Files:**
- Modify: `frontend/src/utils/api.js`
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add the `uploadIntroVideo` API helper**

In `frontend/src/utils/api.js`, find:

```js
export const submitVerification = (data) => {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, v);
  });
  return API.post('/agents/verify-request', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000, // 60s for doc uploads
  });
};
```

Insert this **immediately after** it:

```js
export const uploadIntroVideo = (file) => {
  const fd = new FormData();
  fd.append('intro_video', file);
  return API.post('/agents/intro-video', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // 180s — videos can be large on slow connections
  });
};
```

- [ ] **Step 2: Import the helper in the dashboard**

In `frontend/src/pages/Dashboard.jsx`, find:

```js
import { getMyDeals, getMyListings, submitVerification } from '../utils/api';
```

Replace with:

```js
import { getMyDeals, getMyListings, submitVerification, uploadIntroVideo } from '../utils/api';
```

- [ ] **Step 3: Add intro-video state**

Find:

```js
  const [verDocs, setVerDocs] = useState({ id_document: null, selfie: null });
```

Replace with:

```js
  const [verDocs, setVerDocs] = useState({ id_document: null, selfie: null });
  const [introVideo, setIntroVideo] = useState(null);
  const [introUploading, setIntroUploading] = useState(false);
```

- [ ] **Step 4: Add the upload handler**

Find:

```js
  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      await submitVerification({
        nin: verForm.nin,
        agency_name: verForm.agency_name,
        bio: verForm.bio,
        account_number: verForm.account_number,
        bank_code: verForm.bank_code,
        account_name: verForm.account_name,
        id_document: verDocs.id_document,
        selfie: verDocs.selfie
      });
      toast.success('Verification submitted! SouthSwift will review within 48 hours.');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed.'); }
  };
```

Insert this **immediately after** it:

```js
  const handleIntroVideo = async (e) => {
    e.preventDefault();
    if (!introVideo) { toast.error('Please choose a video first.'); return; }
    setIntroUploading(true);
    try {
      await uploadIntroVideo(introVideo);
      toast.success('Intro video uploaded! It now shows on your public profile.');
      setIntroVideo(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed.'); }
    setIntroUploading(false);
  };
```

- [ ] **Step 5: Add the intro-video card next to the verification card**

Find (the opening of the verification block):

```jsx
        {tab==='verification' && user?.role==='agent' && (
          <div style={s.verCard}>
            <h3 style={s.verTitle}>Submit Agent Verification</h3>
```

Replace with (wraps the block in a fragment so a second card can be a sibling):

```jsx
        {tab==='verification' && user?.role==='agent' && (
          <>
          <div style={s.verCard}>
            <h3 style={s.verTitle}>Submit Agent Verification</h3>
```

Then find (the closing of the verification block):

```jsx
              <button style={s.verBtn}>Submit for Verification</button>
            </form>
          </div>
        )}
```

Replace with:

```jsx
              <button style={s.verBtn}>Submit for Verification</button>
            </form>
          </div>

          <div style={{...s.verCard, marginTop:16}}>
            <h3 style={s.verTitle}>Agent Intro Video</h3>
            <p style={s.verDesc}>Upload a short video introducing yourself. It appears on your public agent profile. (Optional, max 100MB.)</p>
            <form onSubmit={handleIntroVideo}>
              <input type="file" accept="video/*"
                onChange={e => setIntroVideo(e.target.files[0])}
                style={{...s.input, padding:'6px'}} />
              {introVideo && <span style={{fontSize:11,color:'#888'}}>✓ {introVideo.name}</span>}
              <button style={{...s.verBtn, marginTop:12}} disabled={introUploading}>
                {introUploading ? 'Uploading…' : 'Upload Intro Video'}
              </button>
            </form>
          </div>
          </>
        )}
```

- [ ] **Step 6: Commit** (build verification happens at the end of Task 8)

```bash
git add frontend/src/utils/api.js frontend/src/pages/Dashboard.jsx
git commit -m "feat: agent intro-video upload card on dashboard"
```

---

### Task 8: Frontend — agent profile video display

**Files:**
- Modify: `frontend/src/pages/DealDetail.jsx` (`AgentProfile`)

- [ ] **Step 1: Render the intro video on the public profile**

In `frontend/src/pages/DealDetail.jsx`, find:

```jsx
        {agent.bio && <div style={ps.agentBio}>{agent.bio}</div>}
```

Insert this **immediately after** it:

```jsx
        {agent.intro_video_url && (
          <div style={{...ps.agentBio, marginTop:16}}>
            <h3 style={{fontSize:15, fontWeight:700, color:G, margin:'0 0 12px'}}>Intro Video</h3>
            <video src={agent.intro_video_url} controls playsInline preload="metadata"
              style={{width:'100%', maxWidth:560, borderRadius:10, background:'#000'}}/>
          </div>
        )}
```

(`G` is the green brand constant already used in this component, e.g. the reviews heading.)

- [ ] **Step 2: Verify the frontend builds (covers Tasks 7 + 8)**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully.` Then `cd ..`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DealDetail.jsx
git commit -m "feat: intro video player on public agent profile"
```

---

### Task 9: Full backend syntax sweep

**Files:** none (verification only)

- [ ] **Step 1: Re-check every touched backend file**

Run:

```bash
node --check backend/config/db.js
node --check backend/middleware/upload.js
node --check backend/routes/listings.js
node --check backend/routes/agents.js
node --check backend/controllers/listingController.js
node --check backend/controllers/agentAdminController.js
```

Expected: no output from any (exit 0 each).

- [ ] **Step 2: Confirm the frontend production build is clean**

Run: `cd frontend && npm run build && cd ..`
Expected: `Compiled successfully.`

---

### Task 10: Manual smoke test (requires running app + DB)

**Files:** none (manual QA — run only if a local/staging environment with Cloudinary + Postgres is available)

- [ ] **Step 1: Listing video happy path**
  - Log in as a **verified** agent, go to Add Listing, fill required fields, attach 1–2 small `.mp4` files plus a photo, submit.
  - Expected: listing created; on the listing detail page the photo gallery shows and a "Video Tour" section plays the video(s).

- [ ] **Step 2: Agent intro video happy path**
  - As a verified agent, open Dashboard → Verification tab → "Agent Intro Video" card, choose an `.mp4`, click Upload.
  - Expected: success toast; visiting `/agents/<that agent id>` shows an "Intro Video" player.

- [ ] **Step 3: Validation paths**
  - Attach a non-video file (e.g. a `.txt` renamed to `.mp4` will pass the extension but fail mimetype; a clearly wrong type like a `.zip`) to the video input → expect a friendly "Only video files…" / "Upload failed" error, no crash.
  - Attach a >100MB file → expect "File too large (max 100MB)."

- [ ] **Step 4: Regression check**
  - Create a listing with photos and **no** video.
  - Expected: behaves exactly as before — listing created, no empty Video Tour section (it is gated on `listing.videos?.length`).

---

## Self-Review Notes

- **Spec coverage:** DB columns (Task 1), listing upload middleware (Task 2), listing route/controller (Task 3), listing upload UI + API (Task 4), listing display (Task 5), agent intro-video middleware/route/controller + `getAgent` (Task 6), intro-video UI + API (Task 7), profile display (Task 8), verification (Tasks 9–10). All spec sections map to a task.
- **Param-index integrity:** Task 3's INSERT goes from 18 → 19 placeholders with `videos` at `$14`; later params shift accordingly. Double-check the value array order matches the column order when implementing.
- **Naming consistency:** `uploadListingMedia`, `uploadIntroVideo`, `intro_video_url`, and `listing.videos` are used identically across backend and frontend tasks.
- **Known trade-off (from spec):** the listings route's global `fileSize` limit rises to 100MB, relaxing the old 5MB photo cap. Cloudinary still enforces formats. `uploadAgentDocs` is untouched and keeps its 10MB cap.
