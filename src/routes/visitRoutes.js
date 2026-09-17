const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  createVisit,
  listVisits,
  getVisitById,
  updateVisit,
  submitVisit,
  decideVisit,
  completeVisit,
} = require('../controllers/visitController');

// All visit routes require authentication
router.use(authenticate);

router.post('/', requireRole('FIELD_OFFICER'), createVisit);
router.get('/', listVisits);
router.get('/:id', getVisitById);
router.put('/:id', updateVisit);
router.post('/:id/submit', submitVisit);
router.post('/:id/decision', requireRole('HQ_APPROVER', 'ADMIN'), decideVisit);
router.post('/:id/complete', completeVisit);

module.exports = router;