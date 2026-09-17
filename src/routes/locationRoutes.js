const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, state FROM locations ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

module.exports = router;