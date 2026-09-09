const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { buildShareHtml, buildListingFrontendUrl } = require('../utils/share');
const { buildApiShareUrl } = require('../utils/autoShare');

// GET /api/share/:id — crawlable OG page for WhatsApp/Facebook/X/Telegram.
// Crawlers read the meta tags; humans are redirected to the SPA listing page.
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.full_name AS agent_name
       FROM listings l
       JOIN users u ON u.id = l.agent_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).type('html').send(
        buildShareHtml({
          listing: { title: 'Listing not found' },
          shareUrl: buildApiShareUrl(req.params.id, req),
          frontendUrl: String(process.env.CLIENT_URL || 'https://southswift.com.ng').replace(/\/+$/, ''),
        })
      );
    }
    const listing = result.rows[0];
    res
      .type('html')
      .set('Cache-Control', 'public, max-age=300')
      .send(buildShareHtml({
        listing,
        shareUrl: buildApiShareUrl(listing, req),
        frontendUrl: buildListingFrontendUrl(listing),
      }));
  } catch (err) {
    console.error('share page error:', err.message);
    res.status(500).type('html').send(
      buildShareHtml({
        listing: { title: 'SouthSwift listing' },
        shareUrl: buildApiShareUrl(req.params.id, req),
        frontendUrl: buildListingFrontendUrl(req.params.id),
      })
    );
  }
});

module.exports = router;
