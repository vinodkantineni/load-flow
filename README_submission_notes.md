# LoadFlow — Submission Notes

**Live app:** https://load-flow-jade.vercel.app/
**Backend API:** https://load-flow-production.up.railway.app
**Seed credentials:** all seeded accounts use password `password123` (see login screen's Quick Login panel for the full list)

---

## Project Structure

```
loadflow/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI app entrypoint, CORS, router registration
│   │   ├── models.py                   # SQLModel data models (Org, User, Role, Load, RateConfirmation, etc.)
│   │   ├── auth.py                     # JWT auth, require_permission() dependency, org/object-level scoping
│   │   ├── database.py                 # SQLite engine + session setup
│   │   └── routers/
│   │       ├── auth.py                 # Login, staff creation, shipper listing
│   │       ├── roles.py                # Role/permission management (staff.manage gated)
│   │       ├── loads.py                # Load state machine, compliance gate, transitions
│   │       ├── compliance.py           # Carrier compliance records
│   │       └── rate_confirmations.py   # Versioned (insert-only) rate confirmations
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                    # App entry
│   │   ├── App.jsx                     # Route/role-based view switching
│   │   ├── context/
│   │   │   └── AuthContext.jsx         # Login, JWT storage, apiFetch() helper (API_BASE_URL aware)
│   │   └── components/
│   │       ├── Login.jsx               # Login page + Quick Login seed-account panel
│   │       ├── BrokerDashboard.jsx     # Broker load board, carrier assignment, compliance view
│   │       ├── CarrierDashboard.jsx    # Carrier's assigned loads
│   │       ├── ShipperDashboard.jsx    # Shipper's own loads (object-scoped)
│   │       └── RoleBuilder.jsx         # Org Admin: create/edit roles & staff
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── seed.py                             # Seeds orgs, roles, users, compliance records, sample loads
├── verify_rbac.py                      # Integration tests: real 403 checks against a live server
├── verify_compliance.py                # Integration tests: compliance gate + override flow
├── auth_denials.log                    # Live log of permission-denial events (evidence RBAC fires)
└── README.md
```

## Assumptions Made

- **No public signup.** Broker/Carrier staff accounts are created only by an org Admin (`staff.manage` permission); Shippers do not have a public self-registration form. Per the original spec this is acceptable — self-signup was listed as optional, not required.
- **JWT stored in localStorage** rather than httpOnly cookies, for simplicity given the hackathon timeline. Acceptable for a demo/prototype; would need to change for a production-grade auth setup.
- **SQLite as the database**, single file, no external DB service. Fine for a demo, but not suitable for concurrent production traffic.
- **Compliance status is recomputed live** at read time and immediately before every state transition, rather than relying on a cached/stored flag that could go stale.
- **Rate Confirmations are insert-only** (versioned) — never edited in place, to preserve a clean audit history.
- **POD (proof of delivery) upload accepts a filename string**, not an actual file upload, since file storage was a stretch goal outside the 14-hour scope.

## What's Incomplete

- **`GET /api/auth/shippers` has no permission gate.** Any authenticated user (including Carrier staff) can currently list all shipper names/emails. This is a minor cross-org data exposure — not a spec violation, since Shipper records aren't in the protected permission catalog, but it should be locked down before any real use.
- **POD upload is simplified** (text field, not a real file). A production version would need actual file storage (S3/equivalent) and virus scanning.
- **No in-app compliance-expiry alerting** (e.g., notifying a Broker before a carrier's insurance lapses) — compliance is only checked reactively, not proactively.
- **No audit log viewer in the UI.** Audit events are recorded correctly on the backend, but there's no dedicated screen to browse them — currently only visible via direct API calls.
- **Some HTTP status codes are imprecise** — a blocked compliance-gated transition returns `400` where a `403` would be more semantically correct.

## What We'd Do With More Time

1. Lock down the shipper-listing endpoint and audit every other route for similar org-scoping gaps.
2. Build a real file-upload flow for POD documents.
3. Add an audit log viewer screen for Broker Admins, so compliance overrides and state changes are visible without hitting the API directly.
4. Move from SQLite to Postgres for real concurrent-write support in production.
5. Add proactive compliance-expiry notifications (e.g., "Carrier X's insurance expires in 7 days").
6. Add automated CI (GitHub Actions) to run `verify_rbac.py` and `verify_compliance.py` on every push, rather than running them manually.
7. Move JWT storage to httpOnly cookies and add refresh-token rotation for stronger session security.
