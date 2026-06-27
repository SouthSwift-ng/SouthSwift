const express = require('express');
const router  = express.Router();
const { adminController } = require('../controllers/agentAdminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

router.get('/dashboard',              adminController.getDashboard);
router.get('/agents/pending',         adminController.getPendingAgents);
router.put('/agents/:userId/verify',  adminController.verifyAgent);
router.get('/deals',                  adminController.getAllDeals);
router.put('/deals/:id/release-funds',adminController.releaseFunds);
router.put('/deals/:id/refund',       adminController.refundDeal);
router.put('/deals/:id/resolve-dispute', adminController.resolveDispute);
router.get('/users',                  adminController.getUsers);
router.get('/listings',               adminController.getAllListings);
router.delete('/listings',            adminController.deleteListingsBulk);

module.exports = router;
