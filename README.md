# Safe Water Operations Platform

A robust, minimal field visit planning, routing, and approval service designed for the **India Safe Water Program (Evidence Action)**. Built with Node.js, Express, PostgreSQL, and standard web technologies.

---

## 1. Setup Instructions

Assume you have **Node.js** (v18+) and a running **PostgreSQL** instance.

### Step 1: Clone and Install Dependencies
```bash
git clone <repository-url>
cd safe-water-ops
npm install
```

### Step 2: Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
Open `.env` and fill in your PostgreSQL credentials and a JWT secret:
```env
DATABASE_URL=postgres://<username>:<password>@localhost:5432/<database_name>
PORT=5000
JWT_SECRET=super_secret_jwt_key_12345
```

### Step 3: Run Database Migrations and Seed Data
Create the database in PostgreSQL if it doesn't already exist, then run the schema and seed data.

**Option A: Using Node.js Script (Recommended)**
```bash
# 1. Run schema DDL
psql -d <database_name> -f schema.sql

# 2. Run seed script (idempotent, sets up users, locations, visits, and decisions)
npm run seed
```

**Option B: Using Pure SQL**
```bash
psql -d <database_name> -f schema.sql
psql -d <database_name> -f seed.sql
```

### Step 4: Run the Application
```bash
# Start server in production mode
npm start

# Or start in hot-reload development mode
npm run dev
```
Open your browser and navigate to: **`http://localhost:5000`**

### Step 5: Run Automated Tests
Run unit and integration misuse tests using Jest:
```bash
npm test
```

---

## 2. Environment Variables

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URI containing protocol, user, password, host, port, and DB name. | `postgres://postgres:password@localhost:5432/safewater_db` |
| `PORT` | Local network port the Express HTTP server listens on. Defaults to `5000` if omitted. | `5000` |
| `JWT_SECRET` | Cryptographic secret key used by `jsonwebtoken` to sign and verify caller bearer tokens. | `your_secure_random_key_here` |

---

## 3. Seeded Test Credentials

All seeded accounts share the default password: **`Password123!`**

| Name | Role | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Ramesh Kumar** | `FIELD_OFFICER` | `ramesh@safewater.org` | `Password123!` | Create, edit, submit own visits; view own visits; complete own approved visits. |
| **Priya Sharma** | `FIELD_OFFICER` | `priya@safewater.org` | `Password123!` | Create, edit, submit own visits; view own visits; complete own approved visits. |
| **Anil HQ** | `HQ_APPROVER` | `anil@safewater.org` | `Password123!` | View all submitted visits (`PENDING`, `APPROVED`, etc.); approve/reject pending visits; view HQ summary. Cannot see drafts. |
| **Super Admin** | `ADMIN` | `admin@safewater.org` | `Password123!` | View all visits regardless of state (including unsubmitted drafts); approve/reject; view HQ summary. |

---

## 4. Design Decisions & Architecture

### 4.1 Data Modeling
- **Entities**: Modeled around 4 core relational tables: `users`, `locations`, `visits`, and `visit_decisions`.
- **Enums & State Enforcing**: Native PostgreSQL ENUMs (`user_role`, `visit_status`, `decision_action`) make invalid string values impossible to store.
- **Constraints**:
  - `visits.estimated_cost >= 0` ensures monetary amounts cannot be negative.
  - Foreign key constraints with `ON DELETE RESTRICT` protect critical audit trails from accidental deletion of users or locations tied to active visits.
  - `visit_decisions` contains a table-level `CHECK (action != 'REJECTED' OR (remarks IS NOT NULL AND trim(remarks) != ''))` guaranteeing that rejections can never enter the database without written remarks.

### 4.2 State Machine Enclosure
- State transitions are strictly governed by a dedicated state machine module ([`src/utils/stateMachine.js`](file:///home/auysh/Projects/safe-water-ops/src/utils/stateMachine.js)).
- Legal transitions:
  - `DRAFT` $\xrightarrow{\text{Submit}}$ `PENDING` *(Creator only)*
  - `PENDING` $\xrightarrow{\text{Approve}}$ `APPROVED` *(Approver/Admin only; never the creator)*
  - `PENDING` $\xrightarrow{\text{Reject}}$ `REJECTED` *(Approver/Admin only; never the creator; mandatory written remarks)*
  - `REJECTED` $\xrightarrow{\text{Resubmit}}$ `PENDING` *(Creator only)*
  - `APPROVED` $\xrightarrow{\text{Complete}}$ `COMPLETED` *(Creator only)*
  - `COMPLETED`: Terminal state. All subsequent transitions are rejected.
- All requests attempting transitions outside this matrix are refused with explicit error messages.

### 4.3 Server-Side Authorisation
- Authorisation is enforced strictly on the server:
  - Every API endpoint (except `POST /api/auth/login`) passes through `authenticate` middleware, extracting the caller identity and role from the signed JWT.
  - Role guards (`requireRole`) protect action endpoints with proper `403 Forbidden` statuses.
  - Field Officers can **only** read and edit their own visits (`WHERE officer_id = $1`). Guessing another officer's UUID returns `403 Forbidden`.
  - HQ Approvers can view all submitted visits, but are barred from seeing unsubmitted `DRAFT` visits (`WHERE status != 'DRAFT'`). Only `ADMIN` can view visits regardless of state.
  - Approvers can **never** approve or reject their own visits (separation of concerns enforced both in middleware and state machine).

### 4.4 Transaction & Concurrency Isolation
- Status updates and decision audit log entries are executed within an explicit database transaction using a dedicated checked-out pool client (`const client = await db.getClient()`).
- The visit record is locked using `SELECT * FROM visits WHERE id = $1 FOR UPDATE` to eliminate race conditions if two approvers act simultaneously.
- If any insert or validation fails, the entire transaction issues a `ROLLBACK` before releasing the client connection back to the pool.

### 4.5 Indexing Strategy
#### Indexes Added:
1. `CREATE INDEX idx_visits_officer_id ON visits(officer_id)`:
   - **Why:** High-frequency filter for Field Officers (`WHERE officer_id = $1`), which executes on every single visit query by officers.
2. `CREATE INDEX idx_visits_status ON visits(status)`:
   - **Why:** Used constantly for filtering pending queues, approver views (`status != 'DRAFT'`), and the HQ summary aggregation queries.
3. `CREATE INDEX idx_visits_location_id ON visits(location_id)`:
   - **Why:** Powers location-based filtering and joins in the HQ summary (`LEFT JOIN visits ON l.id = v.location_id`).
4. `CREATE INDEX idx_decisions_visit_id ON visit_decisions(visit_id)`:
   - **Why:** Lookups for the audit trail of a specific visit (`WHERE visit_id = $1`) to display decision history.

#### Indexes Deliberately Omitted:
1. **`users(email)` index**: Deliberately omitted because PostgreSQL automatically creates a unique B-tree index for `UNIQUE` constraints. Adding an explicit index would be redundant and waste write performance.
2. **`visits(created_at)`**: Deliberately omitted for current scale. Sorting by `created_at` within a filtered set of an officer's visits is negligible in cost; a composite index `(officer_id, created_at)` would only be justified at massive scale.
3. **`visit_decisions(remarks)`**: Decision remarks are unstructured text only read when displaying history for a single visit, never queried via full-text search.

---

## 5. Trade-Offs and Known Gaps

1. **Token Invalidation / Revocation**:
   - *Current Implementation:* Stateless JWTs with an 8-hour expiry.
   - *Trade-off:* Fast, zero-database lookup for authentication on high-frequency routes.
   - *What we would do with another two days:* Implement a Redis-backed token blocklist or a refresh token rotation schema so an admin can immediately revoke an active session.
2. **Database Migrations Tooling**:
   - *Current Implementation:* Plain SQL scripts (`schema.sql` and `seed.sql`).
   - *Trade-off:* Completely zero-dependency setup for evaluators.
   - *What we would do with another two days:* Integrate a formal migration runner (such as `node-pg-migrate` or Prisma migrations) to handle schema versioning and rollbacks in production CI/CD.
3. **Frontend Framework**:
   - *Current Implementation:* Vanilla JavaScript, semantic HTML5, and pure CSS.
   - *Trade-off:* Deliberately chosen to keep the bundle size zero, load instantly without build steps, and focus development time on business rules and server authorization.
   - *What we would do with another two days:* Build a React or Vue SPA with Tailwind CSS and TanStack Table for sorting, column resizing, and richer modal interactions.

---

## 6. AI Assistant Declaration (Section 8)

In accordance with the guidelines in Section 8:
- An AI coding assistant (Antigravity CLI / Gemini) was utilized during development for scaffolding boilerplate, identifying edge-case authorization gaps, and drafting unit test fixtures.
- **Modifications & Rejections:**
  - Initial boilerplate suggested handling database transactions directly via `pool.query('BEGIN')`. This was caught and corrected to use a dedicated client connection (`pool.connect()`) with `SELECT ... FOR UPDATE` row locks to prevent race conditions.
  - An initial listing query omitted the distinction between `HQ_APPROVER` (who must only see submitted visits) and `ADMIN` (who can view all visits including drafts); this was specifically refined to uphold domain rule Section 2.2.
  - A database-level `CHECK` constraint on `visit_decisions` was explicitly introduced to enforce the business rule that rejections require non-empty remarks directly in the schema.
