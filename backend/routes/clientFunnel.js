const express = require('express');
const router = express.Router();
const { submitClientLead } = require('../controllers/clientFunnelController');

router.post('/', submitClientLead);

module.exports = router;
