import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 20000, // 20s timeout — prevents hanging requests
});

// Auto-attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('ss_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401, surface errors cleanly
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── KEEP-ALIVE PING ────────────────────────────────────────────────────────────
// Pings the backend every 4 minutes to prevent Render free-tier cold starts.
// Render free tier sleeps after 15 minutes of inactivity — this keeps it warm.
const startKeepAlive = () => {
  const ping = () => {
    axios.get(
      `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000'}/api/ping`,
      { timeout: 5000 }
    ).catch(() => {}); // silent — never block the app
  };
  ping(); // immediate ping on app load
  setInterval(ping, 4 * 60 * 1000); // then every 4 minutes
};

// Only run keep-alive in production
if (process.env.NODE_ENV === 'production') {
  startKeepAlive();
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
export const registerUser  = (data) => API.post('/auth/register', data);
export const loginUser     = (data) => API.post('/auth/login', data);
export const getMe         = ()     => API.get('/auth/me');
export const updateProfile = (data) => API.put('/auth/profile', data);

// ── LISTINGS ─────────────────────────────────────────────────────────────────
export const getListings    = (params) => API.get('/listings', { params });
export const getListing     = (id)     => API.get(`/listings/${id}`);
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
export const updateListing      = (id, data) => API.put(`/listings/${id}`, data);
export const deleteListing      = (id)        => API.delete(`/listings/${id}`);
export const getMyListings      = ()           => API.get('/listings/agent/my');
export const getRoomShareStatus = (listingId)  => API.get(`/listings/${listingId}/room-share-status`);

// ── DEALS ─────────────────────────────────────────────────────────────────────
export const initiateDeal  = (data)         => API.post('/deals/initiate', data);
export const verifyPayment = (reference)    => API.get(`/payments/verify/${reference}`);
export const confirmMoveIn = (dealId)       => API.post(`/deals/${dealId}/confirm-movein`);
export const raiseDispute  = (dealId, reason) => API.post(`/deals/${dealId}/dispute`, { reason });
export const getMyDeals    = ()             => API.get('/deals/my');
export const getDeal       = (id)           => API.get(`/deals/${id}`);

// ── MESSAGES ─────────────────────────────────────────────────────────────────
export const sendMessage = (dealId, receiverId, content) =>
  API.post('/messages/send', { deal_id: dealId, content });
export const getMessages = (dealId) => API.get(`/messages/${dealId}`);

// ── REVIEWS ───────────────────────────────────────────────────────────────────
export const submitReview    = (data)    => API.post('/reviews', data);
export const getAgentReviews = (agentId) => API.get(`/reviews/agent/${agentId}`);

// ── AGENTS ────────────────────────────────────────────────────────────────────
export const getAgents  = ()   => API.get('/agents');
export const getAgent   = (id) => API.get(`/agents/${id}`);
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

// ── ADMIN ─────────────────────────────────────────────────────────────────────
export const getDashboard     = ()               => API.get('/admin/dashboard');
export const getPendingAgents = ()               => API.get('/admin/agents/pending');
export const verifyAgent      = (userId, action) => API.put(`/admin/agents/${userId}/verify`, { action });
export const getAllDeals       = ()               => API.get('/admin/deals');
export const releaseFunds     = (dealId)         => API.put(`/admin/deals/${dealId}/release-funds`);
export const resolveDispute   = (dealId, data)   => API.put(`/admin/deals/${dealId}/resolve-dispute`, data);
export const getAllUsers       = ()               => API.get('/admin/users');
export const getAllListings    = ()               => API.get('/admin/listings');

// ── WAITLIST ──────────────────────────────────────────────────────────────────
export const joinWaitlist = (data) => API.post('/waitlist', data);
export const getWaitlist  = ()     => API.get('/waitlist');

export default API;
