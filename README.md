# LoadFlow — Logistics & Freight Brokerage Portal

LoadFlow is a premium, local-first full-stack operations web application designed for freight brokerages, carriers, and shippers. The platform integrates a real role-based permission system (RBAC), automated compliance gating, versioned rate confirmations, and transition log audits.

---

## Technical Stack
- **Backend:** Python (FastAPI), SQLModel ORM, SQLite database
- **Frontend:** React (Vite), Plain Tailwind CSS (no UI component libraries)
- **Authentication:** Local JWT (token saved in browser `localStorage` and sent in headers)
- **Local Runs:** Backend on port `8000`, Frontend on port `5173` (proxied to backend)

---

## Getting Started & Run Instructions

To run LoadFlow locally, follow these steps:

### 1. Prerequisite Setup (Local Env)
Make sure you have **Node.js** (v22+) and **Python** (v3.14+) installed.

### 2. Backend Setup
1. Open a terminal in the `/backend` folder:
   ```bash
   cd backend
   ```
2. Create a local virtual environment:
   ```bash
   py -m venv .venv
   ```
3. Activate the virtual environment:
   - **Windows PowerShell:**
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - **Windows Command Prompt:**
     ```cmd
     .venv\Scripts\activate.bat
     ```
   - **macOS / Linux:**
     ```bash
     source .venv/bin/activate
     ```
4. Install all backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### 3. Database Seeding
From the **root folder** of the project, run the seeding script using the backend virtual environment python executable to create the SQLite database (`loadflow.db`) and seed the organizations, roles, compliance records, users, and audit logs:

- **Windows:**
  ```bash
  backend\.venv\Scripts\python.exe seed.py
  ```
- **macOS / Linux:**
  ```bash
  backend/.venv/bin/python seed.py
  ```

### 4. Running the Servers

#### Start Backend API
From the `/backend` folder (with the virtual environment activated):
```bash
uvicorn app.main:app --reload --port 8000
```
This runs the API server locally at `http://127.0.0.1:8000`. You can inspect the health check at `http://127.0.0.1:8000/api/health`.

#### Start Frontend Dev Server
From the `/frontend` folder in a new terminal window:
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run Vite dev server:
   ```bash
   npm run dev
   ```
This launches the interface at `http://127.0.0.1:5173/`. Vite will automatically proxy API calls matching `/api/*` to the FastAPI backend at `http://127.0.0.1:8000`.

---

## Seeded Testing Credentials
All seeded users share the same password: **`password123`**.

1. **Broker Admin:** `broker.admin@loadflow.com` (All 7 permissions, including Staff Management)
2. **Broker Dispatcher:** `broker.dispatcher@loadflow.com` (Carrier assignment and rate confirmation)
3. **Carrier Admin:** `carrier.admin@loadflow.com` (Manages their compliance records and staff)
4. **Carrier Driver:** `carrier.driver@loadflow.com` (Status updates and POD uploads)
5. **Non-Compliant Carrier:** `lapsed.admin@loadflow.com` (Suspended carrier, expired insurance)
6. **Shipper 1 (Produce):** `shipper.global@loadflow.com` (Read-only status stepper tracking)
7. **Shipper 2 (Steel):** `shipper.steel@loadflow.com` (Read-only status stepper tracking)

*For ease of evaluation, the login page features a **Quick Login Helper Panel**. You can click any role name to autofill credentials and sign in instantly.*

---

## Key Scenarios to Evaluate

### Scenario A: Successful Shipment Operations Flow
1. Log in as **Broker Admin** (`broker.admin@loadflow.com`).
2. Click **+ Create Shipment** to post a load:
   - Select Shipper: `Gary Shipper (Global Food)`
   - Origin: `Salinas, CA`
   - Destination: `Chicago, IL`
   - Commodity: `Produce`
   - Equipment: `Reefer`
3. Click on the new load. In the action panel, select the compliant carrier **Swift Transport** and click **Assign**.
4. Now in the `Carrier Assigned` state, fill out a Rate Confirmation base rate (e.g. `2200`) and click **Confirm Rate Contract**.
5. Once confirmed, you can transition the state to `Rate Confirmed`.
6. Log out and log in as **Carrier Driver** (`carrier.driver@loadflow.com`).
7. You will see the shipment. Advance it:
   - Click **Dispatch Load** (transitions to `Dispatched`).
   - Click **Start Transit** (transitions to `In Transit`).
   - Click **Mark Delivered** (transitions to `Delivered`).
8. Now in the `Delivered` state, type a file name in the upload POD box (e.g., `salinas_pod.pdf`) and click **Upload Document**. This transitions the load to `POD Verified`.
9. Log out and log back in as **Broker Admin**.
10. Select the load and click **Invoiced / Close Shipment**. This closes the shipment file.

### Scenario B: Compliance Gate Hold & Override
1. Log in as **Broker Admin**.
2. Create a load or select the posted load.
3. In the assignment dropdown, select **Lapsed Logistics** (the non-compliant carrier) and click **Assign**.
4. The system immediately flags a **Compliance Hold** (expired insurance, suspended status, and equipment mismatch).
5. Attempt to transition or confirm a rate for this load. The system will **block** the operation at the API level and return a 400 Bad Request warning.
6. Since you are logged in as Broker Admin (who holds the `load.override_compliance_flag` permission), an **Override Compliance Hold** button is visible. Click it to bypass the hold.
7. The system registers the override in the immutable audit log and allows the load to transition.

### Scenario C: Strict RBAC Enforcement
1. Log in as **Carrier Driver** (`carrier.driver@loadflow.com`).
2. Attempt to make a direct API call to create a role or fetch organization statistics.
3. The API checks the bearer token, verifies permissions, and rejects unauthorized requests with a `403 Forbidden` response, logging the attempt in `auth_denials.log` at the root folder.

---

## Assumptions & Design Details
- **Dynamic Compliance Checks:** Carrier compliance records are re-evaluated live at runtime against `date.today()` whenever a load detail is read or a state transition is attempted, ensuring stale flags never override live expiry.
- **Append-only Rate Confirmations:** Every new rate contract creation increments the version number. Historical records are preserved in the DB for audit trails.
- **Password Hashing:** Implemented using standard `bcrypt` to prevent installation/runtime crashes on Windows due to python 3.13+ removing the legacy `crypt` module relied on by standard `passlib`.

---

## Project Status

### What is Completed:
- Full API routes for auth, roles, loads, compliance, and rate confirmations.
- Strict object-level database checks (Broker, Carrier, and Shipper boundaries).
- Dynamic compliance re-evaluation.
- Versioned rate confirmations.
- Front-end views for all 3 organization dashboards.
- Visual status steppers, audit milestones, and rate histories.
- Role Builder UI for customizing permissions and registering new staff.

### What is Incomplete / Future Scope:
- **Actual File Storage (S3 / Local Storage):** POD uploads are currently simulated by saving the document identifier (string) in the DB.
- **Auto-Renewal Alerts:** Cron jobs/notifications warning carriers when insurance is within 30 days of expiry.
- **Interactive Map Integrations:** Showing real-time latitude/longitude points of trucks in transit.
