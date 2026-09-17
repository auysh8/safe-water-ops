const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Connect to our Postgres database using the connection string from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Starting seed...');

    // 1. Hash a default password for all test accounts
    // The second parameter (10) is the "salt rounds" — how securely it is scrambled
    const saltRounds = 10;
    const commonPasswordHash = await bcrypt.hash('Password123!', saltRounds);

    // Clean existing tables so seeding is completely idempotent
    await client.query(`TRUNCATE visit_decisions, visits, locations, users CASCADE;`);

    // 2. Insert Users (2 Officers, 1 Approver, 1 Admin)
    // $1 is a parameterized query placeholder — it prevents SQL injection
    console.log('Seeding users...');
    const userResult = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES
        ('Ramesh Kumar', 'ramesh@safewater.org', $1, 'FIELD_OFFICER'),
        ('Priya Sharma', 'priya@safewater.org', $1, 'FIELD_OFFICER'),
        ('Anil HQ', 'anil@safewater.org', $1, 'HQ_APPROVER'),
        ('Super Admin', 'admin@safewater.org', $1, 'ADMIN')
      RETURNING id, email, role;
    `, [commonPasswordHash]);

    // Store user IDs in a quick lookup map so we can reference them below
    const users = {};
    for (const row of userResult.rows) {
      users[row.email] = row.id;
    }

    // 3. Insert 2 Locations
    console.log('Seeding locations...');
    const locationResult = await client.query(`
      INSERT INTO locations (name, state)
      VALUES
        ('Darbhanga Water Kiosk', 'Bihar'),
        ('Warangal Purification Plant', 'Telangana')
      RETURNING id, name;
    `);

    const loc1Id = locationResult.rows[0].id;
    const loc2Id = locationResult.rows[1].id;

    // 4. Insert Visits in different stages
    console.log('Seeding visits...');
    const visitResult = await client.query(`
      INSERT INTO visits (officer_id, location_id, title, purpose, planned_date, estimated_cost, status)
      VALUES
        -- A draft visit by Ramesh
        ($1, $3, 'Quarterly Chlorine Check', 'Test chlorine residual in 5 community points.', '2026-10-01', 3500.00, 'DRAFT'),
        
        -- A visit submitted for approval by Ramesh
        ($1, $3, 'Pipe Leak Repair', 'Inspect major joint leak reported by locals.', '2026-10-05', 7200.00, 'PENDING'),
        
        -- An approved visit by Priya
        ($2, $4, 'Filter Membrane Replacement', 'Install newly arrived RO filters.', '2026-10-10', 12500.00, 'APPROVED'),
        
        -- A completed visit by Priya
        ($2, $4, 'Water Quality Sample Collection', 'Collected 10 samples for lab testing.', '2026-09-01', 1800.00, 'COMPLETED'),
        
        -- A rejected visit by Ramesh
        ($1, $4, 'Generator Upgrade', 'Replace backup diesel generator.', '2026-10-15', 45000.00, 'REJECTED')
      RETURNING id, status;
    `, [users['ramesh@safewater.org'], users['priya@safewater.org'], loc1Id, loc2Id]);

    // Find the rejected visit ID to attach an approver remark
    const rejectedVisit = visitResult.rows.find(v => v.status === 'REJECTED');

    // 5. Decision History (Required: rejections must carry a written remark)
    console.log('Seeding decision log...');
    await client.query(`
      INSERT INTO visit_decisions (visit_id, approver_id, action, remarks)
      VALUES ($1, $2, 'REJECTED', 'Cost estimate exceeds current quarterly discretionary budget. Please get a second vendor quote.')
    `, [rejectedVisit.id, users['anil@safewater.org']]);

    console.log('\nSeed successful! Test credentials created:');
    console.log('----------------------------------------------------');
    console.log('Officer 1 : ramesh@safewater.org  / Password123!');
    console.log('Officer 2 : priya@safewater.org   / Password123!');
    console.log('Approver  : anil@safewater.org    / Password123!');
    console.log('Admin     : admin@safewater.org   / Password123!');
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();