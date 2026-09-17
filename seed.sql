-- Seed data for Safe Water Operations platform
-- Password for all seed users is: Password123!
-- Bcrypt hash generated with salt rounds = 10:
-- '$2b$10$1SmV3KFkYXMkXrkMB1Rk5.YJVf0ygbf9wfQfIAFoM74lM/d8il6W.'

-- Clear existing records for idempotent seeding
TRUNCATE visit_decisions, visits, locations, users CASCADE;

-- 1. Insert Users (2 Field Officers, 1 HQ Approver, 1 Admin)
INSERT INTO users (id, name, email, password_hash, role)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Ramesh Kumar', 'ramesh@safewater.org', '$2b$10$1SmV3KFkYXMkXrkMB1Rk5.YJVf0ygbf9wfQfIAFoM74lM/d8il6W.', 'FIELD_OFFICER'),
    ('22222222-2222-2222-2222-222222222222', 'Priya Sharma', 'priya@safewater.org', '$2b$10$1SmV3KFkYXMkXrkMB1Rk5.YJVf0ygbf9wfQfIAFoM74lM/d8il6W.', 'FIELD_OFFICER'),
    ('33333333-3333-3333-3333-333333333333', 'Anil HQ', 'anil@safewater.org', '$2b$10$1SmV3KFkYXMkXrkMB1Rk5.YJVf0ygbf9wfQfIAFoM74lM/d8il6W.', 'HQ_APPROVER'),
    ('44444444-4444-4444-4444-444444444444', 'Super Admin', 'admin@safewater.org', '$2b$10$1SmV3KFkYXMkXrkMB1Rk5.YJVf0ygbf9wfQfIAFoM74lM/d8il6W.', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

-- 2. Insert 2 Locations
INSERT INTO locations (id, name, state)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Darbhanga Water Kiosk', 'Bihar'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Warangal Purification Plant', 'Telangana')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Visits across different states
INSERT INTO visits (id, officer_id, location_id, title, purpose, planned_date, estimated_cost, status)
VALUES
    -- DRAFT visit by Ramesh
    ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
     'Quarterly Chlorine Check', 'Test chlorine residual in 5 community points.', '2026-10-01', 3500.00, 'DRAFT'),

    -- PENDING visit submitted by Ramesh
    ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
     'Pipe Leak Repair', 'Inspect major joint leak reported by locals.', '2026-10-05', 7200.00, 'PENDING'),

    -- APPROVED visit by Priya
    ('55555555-5555-5555-5555-555555555553', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
     'Filter Membrane Replacement', 'Install newly arrived RO filters.', '2026-10-10', 12500.00, 'APPROVED'),

    -- COMPLETED visit by Priya
    ('55555555-5555-5555-5555-555555555554', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
     'Water Quality Sample Collection', 'Collected 10 samples for lab testing.', '2026-09-01', 1800.00, 'COMPLETED'),

    -- REJECTED visit by Ramesh
    ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
     'Generator Upgrade', 'Replace backup diesel generator.', '2026-10-15', 45000.00, 'REJECTED')
ON CONFLICT (id) DO NOTHING;

-- 4. Decision History (Audit Log)
-- Mandatory remark on rejected visit
INSERT INTO visit_decisions (id, visit_id, approver_id, action, remarks)
VALUES
    ('99999999-9999-9999-9999-999999999991', '55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 
     'REJECTED', 'Cost estimate exceeds current quarterly discretionary budget. Please get a second vendor quote.')
ON CONFLICT (id) DO NOTHING;
