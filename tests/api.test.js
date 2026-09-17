const request = require('supertest');
const app = require('../src/server');
const db = require('../src/config/db');

describe('API Integration & Misuse Security Tests', () => {
  let rameshToken; // FIELD_OFFICER 1
  let priyaToken;  // FIELD_OFFICER 2
  let anilToken;   // HQ_APPROVER
  let adminToken;  // ADMIN

  let rameshDraftId;
  let rameshPendingId;
  let priyaApprovedId;
  let priyaCompletedId;
  let locationId;

  beforeAll(async () => {
    // 1. Log in as each user to get valid JWT tokens
    const rameshLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ramesh@safewater.org', password: 'Password123!' });
    rameshToken = rameshLogin.body.token;

    const priyaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya@safewater.org', password: 'Password123!' });
    priyaToken = priyaLogin.body.token;

    const anilLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'anil@safewater.org', password: 'Password123!' });
    anilToken = anilLogin.body.token;

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@safewater.org', password: 'Password123!' });
    adminToken = adminLogin.body.token;

    // Fetch seed visits to get known IDs
    const visitsRes = await db.query('SELECT id, status, title FROM visits');
    const rameshDraft = visitsRes.rows.find((v) => v.status === 'DRAFT');
    if (rameshDraft) rameshDraftId = rameshDraft.id;

    const rameshPending = visitsRes.rows.find((v) => v.status === 'PENDING');
    if (rameshPending) rameshPendingId = rameshPending.id;

    const priyaApproved = visitsRes.rows.find((v) => v.status === 'APPROVED');
    if (priyaApproved) priyaApprovedId = priyaApproved.id;

    const priyaCompleted = visitsRes.rows.find((v) => v.status === 'COMPLETED');
    if (priyaCompleted) priyaCompletedId = priyaCompleted.id;

    const locRes = await db.query('SELECT id FROM locations LIMIT 1');
    locationId = locRes.rows[0]?.id;
  });

  afterAll(async () => {
    // Clean up pool connection so Jest exits cleanly
    await db.pool.end();
  });

  // --- 1. Authentication ---
  describe('Authentication (Section 3.2 & 3.3)', () => {
    test('rejects login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ramesh@safewater.org', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    test('rejects requests to protected endpoints without token', async () => {
      const res = await request(app).get('/api/visits');
      expect(res.status).toBe(401);
    });
  });

  // --- 2. Visit Visibility & Draft Isolation ---
  describe('Role-Based Visibility & Draft Isolation (Section 2.2)', () => {
    test('field officer only sees their own visits', async () => {
      const res = await request(app)
        .get('/api/visits')
        .set('Authorization', `Bearer ${rameshToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((v) => {
        expect(v.officer_name).toBe('Ramesh Kumar');
      });
    });

    test('HQ approver cannot see unsubmitted DRAFT visits', async () => {
      const res = await request(app)
        .get('/api/visits')
        .set('Authorization', `Bearer ${anilToken}`);
      expect(res.status).toBe(200);
      // No visit should have status DRAFT
      const hasDraft = res.body.data.some((v) => v.status === 'DRAFT');
      expect(hasDraft).toBe(false);
    });

    test('Admin can view all visits regardless of state, including DRAFT', async () => {
      const res = await request(app)
        .get('/api/visits')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const hasDraft = res.body.data.some((v) => v.status === 'DRAFT');
      expect(hasDraft).toBe(true);
    });

    test('HQ approver receives 403 when trying to fetch a draft visit by ID', async () => {
      if (!rameshDraftId) return;
      const res = await request(app)
        .get(`/api/visits/${rameshDraftId}`)
        .set('Authorization', `Bearer ${anilToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/unsubmitted draft/i);
    });

    test('field officer receives 403 when trying to fetch another officer’s visit', async () => {
      if (!priyaApprovedId) return;
      const res = await request(app)
        .get(`/api/visits/${priyaApprovedId}`)
        .set('Authorization', `Bearer ${rameshToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot view another officer/i);
    });
  });

  // --- 3. Filtering & Pagination ---
  describe('Filtering and Pagination (Section 3.2)', () => {
    test('filters visits by status', async () => {
      const res = await request(app)
        .get('/api/visits?status=PENDING')
        .set('Authorization', `Bearer ${anilToken}`);
      expect(res.status).toBe(200);
      res.body.data.forEach((v) => {
        expect(v.status).toBe('PENDING');
      });
    });

    test('supports pagination with limit and page', async () => {
      const res = await request(app)
        .get('/api/visits?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
    });
  });

  // --- 4. Creation & Updates Validation ---
  describe('Creation and Editing Rules (Section 3.2 & 3.3)', () => {
    test('blocks non-field officer from creating visits (403)', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${anilToken}`)
        .send({
          title: 'Unauthorized Approver Visit',
          location_id: locationId,
          planned_date: '2026-11-01',
          estimated_cost: 2000,
          purpose: 'Testing role protection',
        });
      expect(res.status).toBe(403);
    });

    test('rejects negative estimated cost on creation (400)', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${rameshToken}`)
        .send({
          title: 'Negative Cost Visit',
          location_id: locationId,
          planned_date: '2026-11-01',
          estimated_cost: -500,
          purpose: 'Testing constraint',
        });
      expect(res.status).toBe(400);
    });

    test('blocks editing another officer’s visit (403)', async () => {
      if (!priyaApprovedId) return;
      const res = await request(app)
        .put(`/api/visits/${priyaApprovedId}`)
        .set('Authorization', `Bearer ${rameshToken}`)
        .send({ title: 'Hacked Title' });
      expect(res.status).toBe(403);
    });

    test('blocks editing an approved or completed visit (400)', async () => {
      if (!priyaApprovedId) return;
      const res = await request(app)
        .put(`/api/visits/${priyaApprovedId}`)
        .set('Authorization', `Bearer ${priyaToken}`)
        .send({ title: 'Editing Approved Visit' });
      expect(res.status).toBe(400);
    });

    test('blocks submitting another officer’s draft visit (403)', async () => {
      if (!rameshDraftId) return;
      const res = await request(app)
        .post(`/api/visits/${rameshDraftId}/submit`)
        .set('Authorization', `Bearer ${priyaToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only submit your own/i);
    });

    test('blocks completing another officer’s approved visit (403)', async () => {
      if (!priyaApprovedId) return;
      const res = await request(app)
        .post(`/api/visits/${priyaApprovedId}/complete`)
        .set('Authorization', `Bearer ${rameshToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only the officer who created/i);
    });
  });

  // --- 5. Approvals, Rejections, and Concurrency ---
  describe('Approvals & Decisions (Section 2.3 & 3.2)', () => {
    test('blocks field officer from calling decision endpoint (403)', async () => {
      if (!rameshPendingId) return;
      const res = await request(app)
        .post(`/api/visits/${rameshPendingId}/decision`)
        .set('Authorization', `Bearer ${rameshToken}`)
        .send({ action: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    test('blocks rejecting a pending visit without remarks (400)', async () => {
      if (!rameshPendingId) return;
      const res = await request(app)
        .post(`/api/visits/${rameshPendingId}/decision`)
        .set('Authorization', `Bearer ${anilToken}`)
        .send({ action: 'REJECTED', remarks: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/mandatory/i);
    });

    test('allows approver to approve a pending visit with optional remarks', async () => {
      if (!rameshPendingId) return;
      const res = await request(app)
        .post(`/api/visits/${rameshPendingId}/decision`)
        .set('Authorization', `Bearer ${anilToken}`)
        .send({ action: 'APPROVED', remarks: 'Approved for execution' });
      expect(res.status).toBe(200);

      // Verify status changed to APPROVED and decision history logged
      const visitRes = await request(app)
        .get(`/api/visits/${rameshPendingId}`)
        .set('Authorization', `Bearer ${anilToken}`);
      expect(visitRes.body.status).toBe('APPROVED');
      expect(visitRes.body.decisions.length).toBeGreaterThan(0);
      expect(visitRes.body.decisions[0].action).toBe('APPROVED');
    });
  });

  // --- 6. HQ Summary Access Control ---
  describe('HQ Summary Access Control (Section 3.2)', () => {
    test('blocks field officer from viewing HQ summary (403)', async () => {
      const res = await request(app)
        .get('/api/analytics/hq-summary')
        .set('Authorization', `Bearer ${rameshToken}`);
      expect(res.status).toBe(403);
    });

    test('allows approver and admin to view HQ summary', async () => {
      const res = await request(app)
        .get('/api/analytics/hq-summary')
        .set('Authorization', `Bearer ${anilToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status_counts).toBeDefined();
      expect(res.body.locations).toBeDefined();
    });
  });
});
