const { pool } = require('../config/db');

// POST /api/messages/send
const sendMessage = async (req, res) => {
  const { deal_id, content } = req.body;
  if (!deal_id || !content)
    return res.status(400).json({ error: 'deal_id and content are required.' });
  try {
    const deal = await pool.query(
      'SELECT tenant_id, agent_id FROM deals WHERE id=$1 AND (tenant_id=$2 OR agent_id=$2)',
      [deal_id, req.user.id]
    );
    if (!deal.rows.length) return res.status(403).json({ error: 'Not part of this deal.' });

    // Derive receiver from the deal — the other party
    const d = deal.rows[0];
    const receiver_id = d.tenant_id === req.user.id ? d.agent_id : d.tenant_id;

    const result = await pool.query(
      'INSERT INTO messages (deal_id, sender_id, receiver_id, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [deal_id, req.user.id, receiver_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

// GET /api/messages/:dealId
const getMessages = async (req, res) => {
  try {
    const deal = await pool.query(
      'SELECT * FROM deals WHERE id=$1 AND (tenant_id=$2 OR agent_id=$2)',
      [req.params.dealId, req.user.id]
    );
    if (!deal.rows.length && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorised.' });

    const result = await pool.query(`
      SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.deal_id = $1
      ORDER BY m.created_at ASC
    `, [req.params.dealId]);

    // Mark as read
    await pool.query(
      'UPDATE messages SET is_read=true WHERE deal_id=$1 AND receiver_id=$2',
      [req.params.dealId, req.user.id]
    );

    res.json(result.rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

module.exports = { sendMessage, getMessages };
