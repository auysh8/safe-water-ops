const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { getHqSummary } = require('../controllers/summaryController');

// Restricted to HQ_APPROVER and ADMIN only
router.get(
  '/hq-summary',
  authenticate,
  requireRole('HQ_APPROVER', 'ADMIN'),
  getHqSummary
);

module.exports = router;