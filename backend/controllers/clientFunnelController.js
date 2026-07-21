const { pool } = require('../config/db');
const { validateClientLeadInput } = require('../utils/clientFunnel');
const escapeHtml = require('../utils/escapeHtml');

const submitClientLead = async (req, res) => {
  const validation = validateClientLeadInput(req.body || {});
  if (!validation.ok) {
    return res.status(400).json({ error: 'Please complete all required funnel fields.', missing: validation.errors });
  }

  const {
    fullName,
    email,
    phone,
    role,
    city,
    state,
    propertyType,
    budget,
    moveInTiming,
    needs,
    notes,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO waitlist (email, phone, role, city, state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, phone, role, city, state || null]
    );

    const lead = {
      fullName,
      email,
      phone,
      role,
      city,
      state,
      propertyType,
      budget,
      moveInTiming,
      needs: Array.isArray(needs) ? needs : [],
      notes: notes || '',
      source: 'client-funnel',
    };

    if (process.env.RESEND_API_KEY || process.env.EMAIL_PASS) {
      try {
        const message = `
          New client funnel lead: ${escapeHtml(fullName)}<br/>
          Email: ${escapeHtml(email)}<br/>
          Phone: ${escapeHtml(phone)}<br/>
          Role: ${escapeHtml(role)}<br/>
          City: ${escapeHtml(city)}<br/>
          Property type: ${escapeHtml(propertyType)}<br/>
          Budget: ${escapeHtml(budget)}<br/>
          Move-in timing: ${escapeHtml(moveInTiming)}<br/>
          Needs: ${escapeHtml((lead.needs || []).join(', '))}<br/>
          Notes: ${escapeHtml(notes || '')}
        `;

        // Non-blocking best effort email notification.
        const { default: axios } = require('axios');
        await axios.post('https://api.resend.com/emails', {
          from: 'SouthSwift <onboarding@southswift.com.ng>',
          to: ['ceo@southswift.com.ng'],
          subject: 'New SouthSwift client funnel lead',
          html: `<p>${message}</p>`,
        }, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY || process.env.EMAIL_PASS}` },
        });
      } catch (emailErr) {
        console.error('Client funnel email notification failed:', emailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Your SouthSwift onboarding request is ready. We will contact you with the next steps shortly.',
      lead,
      created: result.rows[0]?.id ? true : false,
    });
  } catch (error) {
    console.error('Client funnel submit error:', error.message);
    return res.status(500).json({ error: 'Unable to save your request right now. Please try again later.' });
  }
};

module.exports = { submitClientLead };
