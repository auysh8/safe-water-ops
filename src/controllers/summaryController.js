const db = require('../config/db');

async function getHqSummary(req, res) {
  try {
    // 1. Total counts categorized by status
    const statusCountsResult = await db.query(`
      SELECT 
        status, 
        COUNT(*)::int AS count
      FROM visits
      GROUP BY status;
    `);

    // Default counters to zero
    const statusBreakdown = {
      DRAFT: 0,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      COMPLETED: 0,
    };
    statusCountsResult.rows.forEach(row => {
      statusBreakdown[row.status] = row.count;
    });

    // 2. Per-location breakdown with total visits and sum of planned costs
    const locationBreakdownResult = await db.query(`
      SELECT 
        l.id AS location_id,
        l.name AS location_name,
        l.state,
        COUNT(v.id)::int AS total_visits,
        COALESCE(SUM(v.estimated_cost), 0)::numeric(12, 2) AS total_planned_cost
      FROM locations l
      LEFT JOIN visits v ON l.id = v.location_id
      GROUP BY l.id, l.name, l.state
      ORDER BY l.name ASC;
    `);

    return res.json({
      status_counts: statusBreakdown,
      locations: locationBreakdownResult.rows,
    });
  } catch (err) {
    console.error('HQ summary error:', err);
    return res.status(500).json({ error: 'Failed to generate HQ summary' });
  }
}

module.exports = { getHqSummary };