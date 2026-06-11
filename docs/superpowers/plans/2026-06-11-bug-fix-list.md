# SouthSwift Bug Fix List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 9 reported platform bugs — idempotent deal initiation, duplicate cleanup, room-share ₦0 pricing, room-share mode choice, and data repair for existing bad rows.

**Architecture:** Node/Express + PostgreSQL backend (`backend/`), React 18 CRA frontend (`frontend/`). Deals flow: `ListingDetail.jsx` → `POST /api/deals/initiate` → Paystack redirect. Schema migrations run idempotently in `backend/config/db.js` `initDB()` at server boot.

**Tech Stack:** Express 4, pg 8, axios, React 18, react-hot-toast. No test runner exists in either package — verification is `node --check` per backend file plus `npm run build` for the frontend.

**Status of reported bugs against current code:**
- Bug 4 (total = rent × fee) — already fixed (`dealController.js:52` adds, not multiplies). Old unpaid rows still carry bad totals → repaired in Task 2.
- Bug 5 (required fields) — frontend already enforces; backend does not → Task 1 adds server-side check.
- Bug 6 (amenities `&`) — fixed for create; `updateListing` still unsanitized → Task 4.
- Bug 7 (label) — already shows "Awaiting Payment".
- Bug 9 (cancellation) — fully implemented (dropdown reasons, both-party emails, pre-payment only, no deletes).
- Bugs 1, 2, 3, 8 — open. Root causes: deal COMMITted before Paystack call so a Paystack timeout shows "Failed" while the deal exists; retries insert duplicates; room-share listings can be saved with NULL per-person price (`Number(null) === 0`); room-share listings force tenants into room-share-only flow.

---

### Task 1: Idempotent deal initiation + server-side validation (Bugs 1, 2-prevention, 3, 5, 8)

**Files:**
- Modify: `backend/controllers/dealController.js` (initiateDeal, ~lines 12–127)

- [ ] **Step 1:** Inside the transaction, after locking the listing, look up an existing unpaid deal (`status IN ('initiated','payment_pending')`) for the same listing + tenant `FOR UPDATE`. If one exists with the same room-share mode, reuse its row (refresh amounts/dates, skip INSERT and slot increment). If the mode differs, archive it (decrement slot if it was room share) and create fresh.
- [ ] **Step 2:** Require `move_in_date` and `lease_duration_months` → 400 if missing.
- [ ] **Step 3:** Resolve deal mode from `req.body.is_room_share` (default: listing's flag). Standard deal on a partially-filled room-share listing → 400.
- [ ] **Step 4:** Room-share rent = `room_share_price_per_person`, falling back to `round(rent_price / room_share_slots)`; reject any deal where rent ≤ 0 with a clear 400.
- [ ] **Step 5:** `node --check backend/controllers/dealController.js`

### Task 2: 'archived' status + idempotent data repair at boot (Bugs 2, 3-data, 4-data)

**Files:**
- Modify: `backend/config/db.js` (CHECK constraint + new repair block in initDB)

- [ ] **Step 1:** Add `'archived'` to the deals status CHECK (CREATE TABLE text + `ALTER TABLE ... DROP CONSTRAINT IF EXISTS deals_status_check; ADD CONSTRAINT ...` for existing DBs).
- [ ] **Step 2:** Repair room-share listings with NULL/0 per-person price → `round(rent_price / room_share_slots)`.
- [ ] **Step 3:** Archive older duplicate unpaid deals per (listing_id, tenant_id) keeping the newest, then archive zero-rent unpaid deals; both via CTEs that also decrement `room_share_slots_filled` for archived room-share deals.
- [ ] **Step 4:** Repair `total_paid = rent_amount + service_fee_tenant` on remaining unpaid deals.
- [ ] **Step 5:** `node --check backend/config/db.js`

### Task 3: Exclude archived deals from user deal list (Bug 2 display)

**Files:**
- Modify: `backend/controllers/dealController.js` (getMyDeals WHERE clause)

- [ ] **Step 1:** `WHERE (d.tenant_id=$1 OR d.agent_id=$1) AND d.status <> 'archived'`. Admin getAllDeals keeps showing everything (archive ≠ delete).

### Task 4: Listing validation + update-path sanitization (Bugs 3, 6)

**Files:**
- Modify: `backend/controllers/listingController.js`

- [ ] **Step 1:** Extract `sanitizeAmenities()` helper (the `&`→`and` + special-char strip currently inline in createListing).
- [ ] **Step 2:** createListing: when `is_room_share`, require numeric `room_share_price_per_person > 0` (400 otherwise) and coerce `room_share_slots` ≥ 2.
- [ ] **Step 3:** updateListing: run amenities through `sanitizeAmenities` (handles string or array input); validate room-share price > 0 when supplied.
- [ ] **Step 4:** `node --check backend/controllers/listingController.js`

### Task 5: ListingDetail — single screen, two paths + timeout UX (Bugs 1-UX, 3-display, 8)

**Files:**
- Modify: `frontend/src/pages/ListingDetail.jsx`

- [ ] **Step 1:** Add `dealMode` state (`'standard' | 'room_share'`). For room-share listings render a two-option toggle: "Rent Entire Property" / "Join Room Share Deal". Standard option disabled (with note) once any slot is filled. Default: `'standard'` unless slots are partially filled.
- [ ] **Step 2:** Per-person price helper with fallback `Number(room_share_price_per_person) || Math.round(rent_price / slots)`; fee breakdown, header, and button label keyed off `dealMode`.
- [ ] **Step 3:** `handleDeal` sends `is_room_share: dealMode === 'room_share'`; on axios timeout / no-response errors, keep the button disabled and toast "check My Deals before retrying" (backend is now idempotent, but per spec the button only re-enables on a genuine API failure).
- [ ] **Step 4:** Room-share slot panel + slotsFull guard only apply in room-share mode.

### Task 6: CreateListing — require per-person price (Bug 3 at source)

**Files:**
- Modify: `frontend/src/pages/DealDetail.jsx` (CreateListing component, submit handler)

- [ ] **Step 1:** Block submit with a toast when `is_room_share` and per-person price is empty/≤0.

### Task 7: Verification + commit

- [ ] **Step 1:** `node --check` all three backend files → no output.
- [ ] **Step 2:** `npm run build` in `frontend/` → "Compiled successfully".
- [ ] **Step 3:** Single commit on the southswift repo describing the fixes.
