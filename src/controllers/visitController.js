const db = require("../config/db");
const { validateTransition } = require("../utils/stateMachine");

// 1. Create a visit (Starts in DRAFT)
async function createVisit(req, res) {
  if (req.user.role !== "FIELD_OFFICER") {
    return res
      .status(403)
      .json({ error: "Only field officers are permitted to create visits" });
  }
  const { title, purpose, location_id, planned_date, estimated_cost } =
    req.body;

  if (
    !title ||
    !purpose ||
    !location_id ||
    !planned_date ||
    estimated_cost === undefined
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (Number(estimated_cost) < 0) {
    return res.status(400).json({ error: "Estimated cost cannot be negative" });
  }

  try {
    const result = await db.query(
      `
      INSERT INTO visits (officer_id, location_id, title, purpose, planned_date, estimated_cost, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
      RETURNING *;
    `,
      [req.user.id, location_id, title, purpose, planned_date, estimated_cost],
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create visit error:", err);
    return res.status(500).json({ error: "Failed to create visit" });
  }
}

// 2. List visits with pagination & role filtering
async function listVisits(req, res) {
  const { status, location_id, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  // Field officers see only their own visits; Approvers see all submitted visits; Admins see all
  if (req.user.role === "FIELD_OFFICER") {
    params.push(req.user.id);
    conditions.push(`v.officer_id = $${params.length}`);
  } else if (req.user.role === "HQ_APPROVER") {
    // Approvers can only view submitted visits (Section 2.2)
    conditions.push(`v.status != 'DRAFT'`);
  }

  // Filter by status if provided
  if (status) {
    params.push(status);
    conditions.push(`v.status = $${params.length}`);
  }

  // Filter by location if provided
  if (location_id) {
    params.push(location_id);
    conditions.push(`v.location_id = $${params.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // Query items
    const queryText = `
      SELECT 
        v.*, 
        u.name AS officer_name, 
        l.name AS location_name
      FROM visits v
      JOIN users u ON v.officer_id = u.id
      JOIN locations l ON v.location_id = l.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;
    const items = await db.query(queryText, [...params, limit, offset]);

    // Query total count for pagination metadata
    const countQuery = `SELECT COUNT(*) FROM visits v ${whereClause};`;
    const totalCountResult = await db.query(countQuery, params);
    const total = parseInt(totalCountResult.rows[0].count, 10);

    return res.json({
      data: items.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("List visits error:", err);
    return res.status(500).json({ error: "Failed to fetch visits" });
  }
}

// 3. Get single visit with full decision history
async function getVisitById(req, res) {
  const { id } = req.params;

  try {
    const visitResult = await db.query(
      `
      SELECT 
        v.*, 
        u.name AS officer_name, 
        l.name AS location_name
      FROM visits v
      JOIN users u ON v.officer_id = u.id
      JOIN locations l ON v.location_id = l.id
      WHERE v.id = $1;
    `,
      [id],
    );

    const visit = visitResult.rows[0];
    if (!visit) {
      return res.status(404).json({ error: "Visit not found" });
    }

    // Authorization: Officers can view only their own visits
    if (req.user.role === "FIELD_OFFICER" && visit.officer_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden: You cannot view another officer’s visit" });
    }

    // Authorization: Approvers cannot view unsubmitted draft visits
    if (req.user.role === "HQ_APPROVER" && visit.status === "DRAFT") {
      return res
        .status(403)
        .json({ error: "Forbidden: Approvers cannot view unsubmitted draft visits" });
    }

    // Retrieve decision history (audit log)
    const decisionsResult = await db.query(
      `
      SELECT 
        d.id, d.action, d.remarks, d.created_at, 
        u.name AS approver_name, u.email AS approver_email
      FROM visit_decisions d
      JOIN users u ON d.approver_id = u.id
      WHERE d.visit_id = $1
      ORDER BY d.created_at ASC;
    `,
      [id],
    );

    visit.decisions = decisionsResult.rows;
    return res.json(visit);
  } catch (err) {
    console.error("Get visit error:", err);
    return res.status(500).json({ error: "Failed to retrieve visit" });
  }
}

// 4. Update visit (Only while DRAFT or REJECTED)
async function updateVisit(req, res) {
  const { id } = req.params;
  const { title, purpose, location_id, planned_date, estimated_cost } =
    req.body;

  if (estimated_cost !== undefined && Number(estimated_cost) < 0) {
    return res.status(400).json({ error: "Estimated cost cannot be negative" });
  }

  try {
    const check = await db.query("SELECT * FROM visits WHERE id = $1", [id]);
    const visit = check.rows[0];

    if (!visit) return res.status(404).json({ error: "Visit not found" });

    // Authorization: Only creator can edit
    if (visit.officer_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You can only edit your own visits" });
    }

    // Editable only when in DRAFT or REJECTED
    if (visit.status !== "DRAFT" && visit.status !== "REJECTED") {
      return res
        .status(400)
        .json({ error: `Cannot edit a visit in status ${visit.status}` });
    }

    const updated = await db.query(
      `
      UPDATE visits
      SET 
        title = COALESCE($1, title),
        purpose = COALESCE($2, purpose),
        location_id = COALESCE($3, location_id),
        planned_date = COALESCE($4, planned_date),
        estimated_cost = COALESCE($5, estimated_cost),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *;
    `,
      [title, purpose, location_id, planned_date, estimated_cost, id],
    );

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error("Update error:", err);
    return res.status(500).json({ error: "Failed to update visit" });
  }
}

// 5. Submit visit: moves DRAFT/REJECTED -> PENDING
async function submitVisit(req, res) {
  const { id } = req.params;

  try {
    const check = await db.query("SELECT * FROM visits WHERE id = $1", [id]);
    const visit = check.rows[0];
    if (!visit) return res.status(404).json({ error: "Visit not found" });

    // Authorization: Only the creator can submit their own visit (Section 2.2 & 3.3)
    if (visit.officer_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden: You can only submit your own visits" });
    }

    const checkTransition = validateTransition({
      currentStatus: visit.status,
      action: "SUBMIT",
      userRole: req.user.role,
      isCreator: true,
    });

    if (!checkTransition.valid) {
      return res.status(400).json({ error: checkTransition.error });
    }

    const updated = await db.query(
      `UPDATE visits SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [checkTransition.nextStatus, id],
    );

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error("Submit error:", err);
    return res.status(500).json({ error: "Failed to submit visit" });
  }
}

// 6. Decide on visit (Approver approves or rejects)
async function decideVisit(req, res) {
  const { id } = req.params;
  const { action, remarks } = req.body; // action: 'APPROVED' or 'REJECTED'

  if (!action || !["APPROVED", "REJECTED"].includes(action)) {
    return res
      .status(400)
      .json({ error: "Action must be APPROVED or REJECTED" });
  }

  // Server-side role enforcement (Section 3.3)
  if (req.user.role !== "HQ_APPROVER" && req.user.role !== "ADMIN") {
    return res
      .status(403)
      .json({ error: "Forbidden: Only approvers or admins can decide on visits" });
  }

  let client;
  try {
    client = await db.getClient();
    await client.query("BEGIN");

    // Lock visit row to prevent concurrent race conditions
    const check = await client.query(
      "SELECT * FROM visits WHERE id = $1 FOR UPDATE",
      [id]
    );
    const visit = check.rows[0];
    if (!visit) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Visit not found" });
    }

    // Separation of concerns: An approver can never approve their own visit (Section 2.3)
    const isCreator = visit.officer_id === req.user.id;
    if (isCreator) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Forbidden: Approvers cannot decide on their own visits" });
    }

    const checkTransition = validateTransition({
      currentStatus: visit.status,
      action: action === "APPROVED" ? "APPROVE" : "REJECT",
      userRole: req.user.role,
      isCreator,
      remarks,
    });

    if (!checkTransition.valid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: checkTransition.error });
    }

    await client.query(
      `UPDATE visits SET status = $1, updated_at = NOW() WHERE id = $2`,
      [checkTransition.nextStatus, id]
    );

    await client.query(
      `
      INSERT INTO visit_decisions (visit_id, approver_id, action, remarks)
      VALUES ($1, $2, $3, $4)
    `,
      [id, req.user.id, action, remarks && remarks.trim() ? remarks.trim() : null]
    );

    await client.query("COMMIT");

    return res.json({
      message: `Visit ${checkTransition.nextStatus.toLowerCase()} successfully`,
    });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Rollback error:", rollbackErr);
      }
    }
    console.error("Decision error:", err);
    return res.status(500).json({ error: "Failed to process decision" });
  } finally {
    if (client) {
      client.release();
    }
  }
}

// 7. Complete visit: Officer marks APPROVED -> COMPLETED
async function completeVisit(req, res) {
  const { id } = req.params;

  try {
    const check = await db.query("SELECT * FROM visits WHERE id = $1", [id]);
    const visit = check.rows[0];
    if (!visit) return res.status(404).json({ error: "Visit not found" });

    // Authorization: Only the creator can complete their own visit (Section 2.2 & 3.3)
    if (visit.officer_id !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden: Only the officer who created the visit can mark it as completed",
      });
    }

    const checkTransition = validateTransition({
      currentStatus: visit.status,
      action: "COMPLETE",
      userRole: req.user.role,
      isCreator: true,
    });

    if (!checkTransition.valid) {
      return res.status(400).json({ error: checkTransition.error });
    }

    const updated = await db.query(
      `UPDATE visits SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [checkTransition.nextStatus, id],
    );

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error("Complete error:", err);
    return res.status(500).json({ error: "Failed to complete visit" });
  }
}

module.exports = {
  createVisit,
  listVisits,
  getVisitById,
  updateVisit,
  submitVisit,
  decideVisit,
  completeVisit,
};
