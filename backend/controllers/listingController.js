const { pool } = require('../config/db');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET /api/listings — all available listings with filters
const getListings = async (req, res) => {
  const { city, state, bedrooms, max_price, swiftshield, near, radius_km = 5, page = 1, limit = 12 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const values = [];
  let where = 'WHERE l.is_available=true';
  let proximityCoords = null;

  if (city)        { values.push(`%${city}%`);        where += ` AND l.city ILIKE $${values.length}`; }
  if (state)       { values.push(`%${state}%`);       where += ` AND l.state ILIKE $${values.length}`; }
  if (bedrooms)    { values.push(parseInt(bedrooms));  where += ` AND l.bedrooms >= $${values.length}`; }
  if (max_price)   { values.push(parseInt(max_price)); where += ` AND l.rent_price <= $${values.length}`; }
  if (swiftshield === 'true') { where += ' AND l.is_swiftshield=true'; }

  // Proximity filter — geocode via Nominatim (OpenStreetMap, free, no API key)
  if (near) {
    try {
      const q = encodeURIComponent(`${near}, Nigeria`);
      const geoRes = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ng`,
        { headers: { 'User-Agent': 'SouthSwift/1.0 (ceo@southswift.com.ng)' } }
      );
      const geoResult = geoRes.data?.[0];
      if (geoResult) {
        const lat = parseFloat(geoResult.lat);
        const lng = parseFloat(geoResult.lon);
        proximityCoords = { lat, lng, latIdx: 0, lngIdx: 0 };
        values.push(lat, lng, parseFloat(radius_km));
        const latIdx = values.length - 2;
        const lngIdx = values.length - 1;
        const radIdx = values.length;
        proximityCoords.latIdx = latIdx;
        proximityCoords.lngIdx = lngIdx;
        where += ` AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
          AND (6371 * acos(
            cos(radians($${latIdx})) * cos(radians(l.latitude)) *
            cos(radians(l.longitude) - radians($${lngIdx})) +
            sin(radians($${latIdx})) * sin(radians(l.latitude))
          )) <= $${radIdx}`;
      }
    } catch (_) {
      // Geocoding failed — skip proximity filter, don't break the request
    }
  }

  // Build the distance expression for SELECT — reuse parameterized indices from WHERE
  const distanceExpr = proximityCoords
    ? `, ROUND(CAST(6371 * acos(
        cos(radians($${proximityCoords.latIdx})) * cos(radians(l.latitude)) *
        cos(radians(l.longitude) - radians($${proximityCoords.lngIdx})) +
        sin(radians($${proximityCoords.latIdx})) * sin(radians(l.latitude))
      ) AS numeric), 1) AS distance_km`
    : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM listings l ${where}`, values
    );
    const total = parseInt(countResult.rows[0].count);

    values.push(parseInt(limit), offset);
    const result = await pool.query(`
      SELECT l.*, u.full_name AS agent_name, ap.verification_status${distanceExpr}
      FROM listings l
      JOIN users u ON u.id = l.agent_id
      LEFT JOIN agent_profiles ap ON ap.user_id = l.agent_id
      ${where}
      ORDER BY ${proximityCoords ? 'distance_km ASC,' : ''} l.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);

    res.json({
      listings: result.rows,
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

// GET /api/listings/:id
const getListing = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.full_name AS agent_name,
              ap.verification_status, ap.agency_name, ap.rating AS agent_rating,
              ap.total_deals, ap.bio AS agent_bio
       FROM listings l
       JOIN users u ON u.id = l.agent_id
       LEFT JOIN agent_profiles ap ON ap.user_id = l.agent_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Listing not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// POST /api/listings — agent creates listing
const createListing = async (req, res) => {
  const {
    title, description, property_type, bedrooms, bathrooms,
    rent_price, rent_period, address, city, state,
    latitude, longitude
  } = req.body;

  if (!title || !rent_price || !address || !city || !state)
    return res.status(400).json({ error: 'Title, price, address, city, and state are required.' });

  let amenities = [];
  if (req.body['amenities[]']) {
    amenities = Array.isArray(req.body['amenities[]'])
      ? req.body['amenities[]']
      : [req.body['amenities[]']];
  } else if (req.body.amenities) {
    amenities = typeof req.body.amenities === 'string'
      ? req.body.amenities.split(',').map(a => a.trim()).filter(Boolean)
      : req.body.amenities;
  }
  amenities = amenities.map(a => a.replace(/&/g, 'and').replace(/[^a-zA-Z0-9\s,\-]/g, '').trim()).filter(Boolean);

  const is_room_share = req.body.is_room_share === 'true' || req.body.is_room_share === true;
  const room_share_price_per_person = req.body.room_share_price_per_person || null;
  const room_share_slots = req.body.room_share_slots || 1;

  try {
    // Check agent is verified
    const agentCheck = await pool.query(
      "SELECT verification_status FROM agent_profiles WHERE user_id=$1", [req.user.id]
    );
    if (!agentCheck.rows.length || agentCheck.rows[0].verification_status !== 'verified') {
      return res.status(403).json({ error: 'Only verified agents can create listings.' });
    }

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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// PUT /api/listings/:id
const updateListing = async (req, res) => {
  const fields = ['title','description','rent_price','bedrooms','bathrooms','address','city','state','is_available','amenities',
                  'is_room_share','room_share_price_per_person','room_share_slots'];
  const updates = []; const params = [];
  let idx = 1;
  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f}=$${idx++}`); params.push(req.body[f]); }
  });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
  params.push(req.params.id, req.user.id);
  try {
    await pool.query(
      `UPDATE listings SET ${updates.join(',')}, updated_at=NOW() WHERE id=$${idx} AND agent_id=$${idx+1}`,
      params
    );
    res.json({ message: 'Listing updated.' });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// DELETE /api/listings/:id
const deleteListing = async (req, res) => {
  try {
    await pool.query('DELETE FROM listings WHERE id=$1 AND agent_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Listing deleted.' });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// GET /api/listings/agent/my — agent's own listings
const getMyListings = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM listings WHERE agent_id=$1 ORDER BY created_at DESC', [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// GET /api/listings/:id/room-share-status
const getRoomShareStatus = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.room_share_slots, l.room_share_slots_filled,
             l.room_share_price_per_person,
             COUNT(d.id) FILTER (WHERE d.status = 'escrow_held')       AS slots_paid,
             COUNT(d.id) FILTER (WHERE d.status = 'movein_pending')    AS slots_movein_pending,
             COUNT(d.id) FILTER (WHERE d.status = 'completed')         AS slots_completed
      FROM listings l
      LEFT JOIN deals d ON d.listing_id = l.id AND d.is_room_share_deal = true
      WHERE l.id = $1
      GROUP BY l.id
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Listing not found.' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

module.exports = { getListings, getListing, createListing, updateListing, deleteListing, getMyListings, getRoomShareStatus };
