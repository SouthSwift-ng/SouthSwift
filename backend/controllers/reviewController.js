const { pool } = require('../config/db');

// POST /api/reviews — tenant submits review after completed deal
const submitReview = async (req, res) => {
  const { deal_id, rating, comment } = req.body;
  if (!deal_id || !rating) return res.status(400).json({ error: 'deal_id and rating are required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5.' });

  try {
    const dealResult = await pool.query(
      "SELECT * FROM deals WHERE id=$1 AND tenant_id=$2 AND status='completed'",
      [deal_id, req.user.id]
    );
    if (!dealResult.rows.length)
      return res.status(403).json({ error: 'Only tenants of completed deals can leave reviews.' });

    const deal = dealResult.rows[0];

    const existing = await pool.query(
      'SELECT id FROM reviews WHERE deal_id=$1 AND reviewer_id=$2',
      [deal_id, req.user.id]
    );
    if (existing.rows.length)
      return res.status(400).json({ error: 'You have already reviewed this deal.' });

    await pool.query(
      'INSERT INTO reviews (deal_id, reviewer_id, agent_id, rating, comment) VALUES ($1,$2,$3,$4,$5)',
      [deal_id, req.user.id, deal.agent_id, rating, comment || null]
    );

    // Recalculate agent average rating
    const avgResult = await pool.query(
      'SELECT ROUND(AVG(rating)::numeric, 2) AS avg FROM reviews WHERE agent_id=$1',
      [deal.agent_id]
    );
    await pool.query(
      'UPDATE agent_profiles SET rating=$1 WHERE user_id=$2',
      [avgResult.rows[0].avg, deal.agent_id]
    );

    res.status(201).json({ message: 'Review submitted. Thank you!' });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

// GET /api/reviews/agent/:agentId — get reviews for an agent
const getAgentReviews = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.rating, r.comment, r.created_at,
             u.full_name AS reviewer_name
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      WHERE r.agent_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.agentId]);
    res.json(result.rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

module.exports = { submitReview, getAgentReviews };
