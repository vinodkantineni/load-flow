# LoadFlow — Master Build Prompt for Google Antigravity

Paste everything below into Antigravity as your project prompt.

---

## Project Overview

Build **LoadFlow**, a freight brokerage operations web app, as a full-stack project with:

- **Backend:** Python, FastAPI, SQLModel (ORM), SQLite database
- **Frontend:** React (Vite), plain Tailwind CSS (no component library)
- **Auth:** JWT stored in browser localStorage, sent as `Authorization: Bearer <token>` header
- **Run mode:** local-first. Backend runs via `uvicorn app.main:app --reload` on port 8000. Frontend runs via `npm run dev` on port 5173, proxying `/api` calls to port 8000.

The app connects three account types — **Broker**, **Carrier**, **Shipper** — around a freight load lifecycle, with a real permission-based access control system (not hardcoded roles) and an automatic compliance gate that blocks a load from progressing if the assigned carrier's insurance or authority has lapsed.

Build this in the following order. Do not skip ahead — each phase depends on the last.

---

## Phase 1 — Project Scaffold

1. Create a monorepo with `/backend` (FastAPI) and `/frontend` (Vite + React + Tailwind).
2. Backend: set up SQLModel with a SQLite file `loadflow.db` at repo root, gitignored.
3. Add `.env.example` with `JWT_SECRET`, `JWT_EXPIRE_MINUTES`.
4. Add a root `README.md` stub (will be filled in later) and a `.gitignore` covering `__pycache__`, `node_modules`, `*.db`, `.env`.
5. Confirm both servers boot with a trivial `/api/health` endpoint returning `{"status": "ok"}` and a placeholder React page hitting it.

---

## Phase 2 — Data Models

Create SQLModel tables:

```
Org
  id, name, type (enum: broker | carrier | shipper)

User
  id, org_id (FK Org), role_id (FK Role, nullable — null for shipper users),
  email (unique), password_hash, full_name

Role
  id, org_id (FK Org), name, permissions (JSON list of strings)

CarrierComplianceRecord
  id, carrier_org_id (FK Org), insurance_expiry (date),
  authority_status (enum: active | suspended | revoked),
  approved_equipment (JSON list of strings),
  approved_commodities (JSON list of strings)

Load
  id, shipper_id (FK User), broker_org_id (FK Org), carrier_org_id (FK Org, nullable until assigned),
  state (enum, see state machine below), compliance_flag (bool, default false),
  origin, destination, commodity, equipment_type, created_at, updated_at

LoadAuditEvent
  id, load_id (FK Load), from_state, to_state, actor_id (FK User), timestamp, note (nullable)

RateConfirmation
  id, load_id (FK Load), version (int, increments per load),
  base_rate (decimal), accessorials (JSON list of {description, amount}),
  confirmed_at, confirmed_by (FK User)
```

Notes:
- `RateConfirmation` rows are never edited — a new rate change always inserts a new version with `version = previous + 1`. Never delete old versions.
- `permissions` on `Role` is a fixed catalog (see Phase 3) — validate against it on write.

---

## Phase 3 — Auth + RBAC Core

**Permission catalog (fixed, hardcoded enum):**
```
load.create
load.assign_carrier
load.override_compliance_flag
rate.confirm
load.update_status
staff.manage
pod.upload
```

**Auth endpoints:**
- `POST /api/auth/login` — email + password → JWT (payload: `user_id`, `org_id`, `org_type`, `role_id`)
- `POST /api/auth/staff` — Admin-only (`staff.manage`), creates a new staff User + assigns an existing Role within the caller's org

**Bootstrap (no public signup for orgs):**
- Write a `seed.py` script that creates:
  - One Broker org with an Admin user holding an implicit "Admin" role (all 7 permissions)
  - One Carrier org with an Admin user holding an implicit "Admin" role (all 7 permissions)
  - Two or three sample Shipper users (no role — shippers never have roles)
  - A couple of example non-admin roles: Broker "Dispatcher" (`load.assign_carrier`, `rate.confirm`), Broker "Ops Lead" (all broker-relevant + `load.override_compliance_flag`), Carrier "Driver" (`load.update_status`, `pod.upload`), Carrier "Carrier Dispatch" (accept/decline handled via `load.update_status`)
  - Sample compliance records: one carrier fully compliant, one with expired insurance (for demo purposes)
  - A few sample loads across different states
- Print all seed login credentials to console when the script runs.

**Permission-check dependency (critical piece — build carefully):**
- Create a FastAPI dependency `require_permission(permission: str)` that:
  1. Decodes the JWT, loads the `User`
  2. Loads the user's `Role` and checks `permission in role.permissions`. If the user has no role (shipper) or lacks the permission → 403.
  3. Logs every denial to a log file or console: timestamp, user_id, org_id, attempted permission, endpoint.
- Create a separate `require_org_scope` dependency/helper that checks the resource being accessed belongs to the caller's `org_id` (Broker staff can only touch their broker org's loads; Carrier staff only their carrier org's loads).
- Create an object-level scope check for Shippers: a shipper can only fetch loads where `load.shipper_id == self.id`.
- **Every** protected endpoint must use these dependencies — permission checks belong in the API layer, never only in the frontend. Write at least one test/manual check per endpoint confirming a direct API call from an unauthorized token is rejected with 403.

**Role management endpoints** (Admin only, `staff.manage`):
- `GET /api/roles` — list org's roles
- `POST /api/roles` — create role (name + list of permissions, validated against the catalog)
- `PATCH /api/roles/{id}` — edit permissions

---

## Phase 4 — Load Lifecycle + State Machine

States, in strict order:
```
Posted → Carrier Assigned → Rate Confirmed → Dispatched → In Transit → Delivered → POD Verified → Invoiced/Closed
```

Endpoints:
- `POST /api/loads` — create (Broker, `load.create`)
- `GET /api/loads` — list, scoped by caller's org/shipper identity; supports query params for search/filter (by state, origin, destination, carrier)
- `GET /api/loads/{id}` — detail, scoped
- `POST /api/loads/{id}/assign-carrier` — Broker, `load.assign_carrier`. On assignment, recompute `compliance_flag` from the carrier's `CarrierComplianceRecord` (expired insurance, non-active authority, or equipment/commodity mismatch → flag = true).
- `POST /api/loads/{id}/transition` — body: `{to_state, note?}`. Validate:
  - Only legal forward transitions (no skipping states, no going backward except by a dedicated correction path if you choose to add one)
  - Requires `load.update_status` (or `rate.confirm` specifically for the Rate-Confirmed transition)
  - **Compliance gate:** any transition past "Carrier Assigned" is blocked if `compliance_flag == true`, UNLESS the actor has `load.override_compliance_flag` — in which case allow it but write an audit note that it was an override.
  - Every transition writes a `LoadAuditEvent` row (timestamped, attributed to the actor).

---

## Phase 5 — Compliance Records

- `GET/POST/PATCH /api/compliance/{carrier_org_id}` — CRUD on `CarrierComplianceRecord`. Only Carrier Admins can edit their own org's record; Broker staff can view any carrier's record (read-only) when relevant to a load.
- On every read of a load or carrier record, recompute expiry status live against today's date (don't rely on a stale stored flag alone — recheck at read time, and also at any state-transition attempt).

---

## Phase 6 — Rate Confirmation

- `POST /api/loads/{id}/rate-confirmation` — Broker/Carrier with `rate.confirm`, creates a new `RateConfirmation` version tied to the load. Required before the "Rate Confirmed" transition succeeds.
- `GET /api/loads/{id}/rate-confirmations` — list all versions, newest first, showing which version applies to the load's current/historical state.

---

## Phase 7 — Frontend

Build with plain Tailwind, no UI library. Three dashboard views gated by `org_type` after login:

- **Broker dashboard:** load board (table with search/filter by state, origin, destination, carrier), compliance alerts banner for any load with `compliance_flag = true`, buttons to assign carrier / confirm rate / transition state (only rendered if the logged-in user's role includes the relevant permission — but remember the API is the real gate, this is just UX).
- **Carrier dashboard:** list of loads assigned to their org, action buttons to accept/update status/upload POD per their role's permissions.
- **Shipper dashboard:** read-only view of their own loads and current state/delivery confirmation, no edit actions.
- **Admin role-builder UI** (Broker/Carrier Admin only): list roles, create a role by checking boxes from the permission catalog, assign roles when creating staff.
- Login page, JWT stored in localStorage, attached to all API calls, redirect to the correct dashboard by `org_type` after login.

---

## Phase 8 — Seed, Local Run, and Polish

1. Confirm `seed.py` cleanly rebuilds `loadflow.db` from scratch and prints credentials.
2. Confirm both servers run locally with a clean `git clone` + documented steps (see README below).
3. Manually walk every account type through: login → view dashboard → attempt at least one action inside and outside their permissions (confirm the outside-permission one is blocked with 403 at the API, not just hidden in UI).
4. Manually verify the compliance-block demo: assign a load to the carrier with expired insurance, confirm the app refuses to move it past "Carrier Assigned" for a non-override user, and succeeds with an override-permission user.

---

## README requirements (write this incrementally, not at the end)

Include:
- **Run instructions:** exact commands to clone, install backend deps (`pip install -r requirements.txt`), install frontend deps (`npm install`), run `seed.py`, start both servers, and seeded login credentials for one user of each account type.
- **Assumptions made:** JWT in localStorage, plain Tailwind, [add any others made during the build].
- **What's incomplete:** be honest — list any stretch features not built (POD upload, expiry renewal alerts, audit log viewer) and any must-have you had to cut for time.
- **What you'd do with more time.**

---

## Constraints to respect throughout

- Never hardcode role names in permission checks — always check permission strings against the role's permission list.
- Every state-changing and every data-read endpoint must be scoped by org and, where relevant, by object ownership — verify this at the API layer, not just by trusting the frontend to only show the right data.
- Keep commits incremental and frequent as you build each phase — don't do one giant commit at the end.
