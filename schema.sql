-- Reset types and tables if they exist
DROP TABLE IF EXISTS visit_decisions CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS decision_action CASCADE;
DROP TYPE IF EXISTS visit_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- 1. Strict Enums for State Machine & Access Control
CREATE TYPE user_role AS ENUM ('FIELD_OFFICER', 'HQ_APPROVER', 'ADMIN');
CREATE TYPE visit_status AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
CREATE TYPE decision_action AS ENUM ('APPROVED', 'REJECTED');

-- 2. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Locations Table
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    state VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Visits Table
CREATE TABLE visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    purpose TEXT NOT NULL,
    planned_date DATE NOT NULL,
    estimated_cost NUMERIC(12, 2) NOT NULL CHECK (estimated_cost >= 0),
    status visit_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Audit Log: Decision History
CREATE TABLE visit_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action decision_action NOT NULL,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_rejection_has_remarks 
        CHECK (action != 'REJECTED' OR (remarks IS NOT NULL AND trim(remarks) != ''))
);

-- 6. Indexes for High-Frequency Queries
CREATE INDEX idx_visits_officer_id ON visits(officer_id);
CREATE INDEX idx_visits_status ON visits(status);
CREATE INDEX idx_visits_location_id ON visits(location_id);
CREATE INDEX idx_decisions_visit_id ON visit_decisions(visit_id);