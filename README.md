# 🛡️ SouthSwift Enterprise

**Nigeria's Verified Property Transaction Platform**

> Escrow payments · Verified agents · Auto-generated legal agreements · Free in-app legal counsel

---

## 📁 Project Structure

```
southswift/
├── backend/                        ← Node.js + Express API
│   ├── config/db.js                ← PostgreSQL pool + table migrations
│   ├── controllers/                ← Business logic
│   │   ├── authController.js
│   │   ├── dealController.js       ← SwiftShield escrow flow
│   │   ├── listingController.js
│   │   ├── messageController.js    ← SwiftConnect messaging
│   │   ├── reviewController.js     ← Agent reviews & ratings
│   │   ├── agentAdminController.js ← Agent verification + admin actions
│   │   ├── swiftdocController.js   ← Legal doc generation (Signova)
│   │   └── emailController.js
│   ├── middleware/
│   │   ├── auth.js                 ← JWT protect + role guards
│   │   └── upload.js               ← Multer + Cloudinary upload middleware
│   ├── routes/                     ← Express routers
│   └── server.js
└── frontend/                       ← React 18 SPA
    └── src/
        ├── pages/                  ← Home, Login, Register, Dashboard,
        │                             ListingDetail, DealDetail, AdminPanel,
        │                             AgentProfile, CreateListing
        ├── components/             ← Navbar, ListingCard
        └── utils/api.js            ← Axios instance + all API calls
```

---

## ✅ Features

| Feature | Status |
|---|---|
| User registration & JWT auth | ✅ |
| Property listings (CRUD + image upload) | ✅ |
| SwiftShield escrow deal flow | ✅ |
| Paystack payment initiation & verification | ✅ |
| Real fund disbursement via Paystack Transfers | ✅ |
| SwiftConnect in-deal messaging | ✅ |
| Agent verification (NIN + ID docs + selfie) | ✅ |
| Post-deal reviews & agent ratings | ✅ |
| Dispute resolution (admin UI) | ✅ |
| Admin dashboard (stats, agents, deals) | ✅ |
| Listings pagination | ✅ |
| SwiftDoc legal agreements (Signova) | ⏳ Pending Signova API key |

---

## 🚀 Push to GitHub

```bash
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/southswift.git
git push -u origin main
```

> The repo is already initialised with a full commit history. Just add your remote and push.

---

## ⚙️ Local Development Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values (see Environment Variables below)
node server.js
```

Server starts on `http://localhost:5000`. Tables and indexes are created automatically on first run.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Local dev: set REACT_APP_API_URL=http://localhost:5000/api
# Vercel deploy (frontend + backend services): set REACT_APP_API_URL=/_/backend/api
npm start
```

App opens at `http://localhost:3000`.

---

## 🔑 Environment Variables

### Backend `.env`

| Variable | Where to Get It |
|---|---|
| `DATABASE_URL` | Supabase → Project → Settings → Database → Connection String |
| `JWT_SECRET` | Any long random string (e.g. `openssl rand -hex 32`) |
| `PAYSTACK_SECRET_KEY` | paystack.com → Settings → API Keys |
| `PAYSTACK_PUBLIC_KEY` | paystack.com → Settings → API Keys |
| `CLOUDINARY_CLOUD_NAME` | cloudinary.com → Dashboard |
| `CLOUDINARY_API_KEY` | cloudinary.com → Dashboard |
| `CLOUDINARY_API_SECRET` | cloudinary.com → Dashboard |
| `SIGNOVA_API_KEY` | Pending — fill in when provided by Signova |
| `EMAIL_USER` | ceo@southswift.com.ng |
| `EMAIL_PASS` | Your Yandex 360 app password |
| `CLIENT_URL` | Frontend URL (e.g. `https://southswift.vercel.app`) |
| `PORT` | Optional — defaults to `5000` |

### Frontend `.env`

| Variable | Value |
|---|---|
| `REACT_APP_API_URL` | `http://localhost:5000/api` (local dev) or `/_/backend/api` (Vercel production with services) |

---

## 🌐 Deployment

### 1. Database — Supabase (Free)

1. Create account at supabase.com
2. New Project → name it `southswift`
3. Settings → Database → Connection String (URI mode)
4. Copy and set as `DATABASE_URL` in backend `.env`

### 2. Backend — Vercel Services (same repo)

1. Create account at vercel.com → connect GitHub
2. Import your repo (or open existing SouthSwift project)
3. Ensure `vercel.json` includes both `frontend` and `backend` in `experimentalServices`
4. Add all backend environment variables in the Vercel project
5. Deploy and verify backend health at `/_/backend/`

### 3. Frontend — Vercel (Free)

1. Create account at vercel.com → connect GitHub
2. Import your repo
3. Set:
   - **Root Directory:** `frontend` (if using separate project setup)
   - **Environment Variable:** `REACT_APP_API_URL` = `/_/backend/api`
4. Deploy → note your URL (e.g. `https://southswift.vercel.app`)

### 4. Custom Domain (Truehost → Vercel)

1. Login to Truehost → DNS Management for `southswift.com.ng`
2. Add CNAME record: Name `www` → Value `cname.vercel-dns.com`
3. Vercel → Project → Settings → Domains → Add `southswift.com.ng`

---

## 🔗 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register (tenant / agent / landlord) |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✅ | Current user profile |
| PUT | `/api/auth/profile` | ✅ | Update profile |

### Listings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/listings` | — | All listings (`?page=1&limit=12&city=&state=&bedrooms=&max_price=&swiftshield=true`) |
| GET | `/api/listings/:id` | — | Single listing |
| POST | `/api/listings` | Agent | Create listing (multipart — includes images) |
| PUT | `/api/listings/:id` | Agent | Update listing |
| DELETE | `/api/listings/:id` | Agent | Delete listing |
| GET | `/api/listings/agent/my` | Agent | My listings |

### Deals — SwiftShield Escrow
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/deals/initiate` | ✅ | Start deal, returns Paystack payment URL |
| POST | `/api/deals/verify-payment` | ✅ | Verify payment, moves to `escrow_held` |
| POST | `/api/deals/:id/confirm-movein` | Tenant | Confirm move-in, triggers fund release |
| POST | `/api/deals/:id/dispute` | Tenant | Raise dispute |
| GET | `/api/deals/my` | ✅ | All my deals |
| GET | `/api/deals/:id` | ✅ | Single deal |

### Messages — SwiftConnect
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/messages/send` | ✅ | Send message in a deal |
| GET | `/api/messages/:dealId` | ✅ | Get messages for a deal |

### Reviews
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/reviews` | Tenant | Submit review after completed deal |
| GET | `/api/reviews/agent/:agentId` | — | Get all reviews for an agent |

### Agents
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/agents` | — | All verified agents |
| GET | `/api/agents/:id` | — | Agent profile |
| POST | `/api/agents/verify-request` | Agent | Submit verification (multipart — NIN + ID doc + selfie + bank details) |
| GET | `/api/agents/my/listings` | Agent | My listings |

### Payments
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/webhook` | — | Paystack webhook (HMAC verified) |
| GET | `/api/payments/verify/:reference` | ✅ | Manually verify a payment |

### Admin
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/dashboard` | Admin | Platform stats |
| GET | `/api/admin/agents/pending` | Admin | Agents awaiting verification |
| PUT | `/api/admin/agents/:id/verify` | Admin | Verify or reject agent |
| GET | `/api/admin/deals` | Admin | All deals |
| PUT | `/api/admin/deals/:id/release-funds` | Admin | Disburse funds via Paystack Transfer |
| PUT | `/api/admin/deals/:id/resolve-dispute` | Admin | Resolve a disputed deal |
| GET | `/api/admin/users` | Admin | All users |
| GET | `/api/admin/listings` | Admin | All listings |

---

## Deal Status Flow

```
initiated → payment_pending → escrow_held → docs_generated → completed
                                                ↓
                                           disputed → (admin resolves) → completed
```

---

## 🤝 SwiftDoc Integration (Pending)

When the Signova API key and docs are available:

1. Open `backend/controllers/swiftdocController.js`
2. Set `SIGNOVA_API_KEY` in `.env`
3. Update `generateSwiftDoc` with the correct Signova endpoint and payload
4. The escrow flow automatically attaches the document after payment

---

## 👑 Admin Login

Default admin account created automatically on first run:
- **Email:** `ceo@southswift.com.ng`
- **Password:** `SouthSwift@Admin2024`

⚠️ Change this password immediately after first login.

---

## 📞 Support

**Oladeji Ayeni Joshua** — CEO & Founder  
ceo@southswift.com.ng · +234 816 818 5692 · southswift.com.ng

*SouthSwift Enterprise — CAC BN 7310264*
