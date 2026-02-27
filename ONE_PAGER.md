# Inventory Management System — One Pager

Status: Ready for product & engineering review

---

## 1 — Executive summary / Problem
Small retail business owners need a reliable Inventory Management System (IMS) to track stock, sales, purchases, returns, and supplier expenses with accurate accounting (BDT), simple UX for staff, and exportable reports. The goal is an owner-focused, production-ready MERN app (MongoDB, Express, React, Node) that is simple to operate at a single physical store but designed for later extensibility.

Business needs solved:
- Prevent stockouts and reconciliate stock changes
- Track purchases, supplier balances, and returns
- Record sales with partial payments and dues
- Produce printable/exportable reports (PDF / Excel)
- Maintain auditability and recoverability for financial data

---

## 2 — Audience & ideal customer
- Primary user: Business owner / store manager at a small retail shop (pharmacy, grocery, toiletries) operating a single outlet.
- Secondary users: Cashiers and staff (create sales), procurement/purchasing staff (create purchases/returns), Managers (admin tasks, reporting).
- Ideal customer profile: Single-store small business in Bangladesh, uses desktop/pos terminal for operations, needs VAT handling, monthly/yearly reports, and simple supplier ledger.

Persona (example):
- Name: "Rahim"
- Role: Owner of a single retail outlet
- Needs: Quick sales entry, accurate on-hand stock, purchase tracking, downloadable reports for accountant
- Devices: Desktop + occasional tablet; uses a USB barcode scanner (keyboard-emulating), not camera scanning.

---

## 3 — Platform & product scope (MVP)
- Platform: Responsive web app — desktop-first SPA built with React (Vite + TypeScript).
- Backend: Node.js + Express + Mongoose (self-hosted MongoDB on VPS for MVP).
- Storage: Product images stored in S3 / object storage + CDN recommended.
- Scope: MVP supports single-store inventory (single warehouse), internal POS (staff-entered sales), purchases, returns, supplier ledger, expense tracking, and reporting (PDF / XLSX).
- Barcode: No camera scanning in MVP; support manual SKU or keyboard-emulating barcode scanners.
- Multi-store: Not in MVP. Schema designed for later multi-warehouse support.

---

## 4 — Roles & access
- Roles (MVP): Owner/Admin, Manager, Staff
- RBAC in MVP: coarse-grained role checks
  - Owner/Admin: full access (users, settings)
  - Manager: product & purchase management, reports, approve returns
  - Staff: create sales/orders, view products
- Authentication: JWT access tokens (short-lived) + refresh tokens (HttpOnly cookie).
- Refresh token strategy: rotating refresh tokens stored hashed on user document (single-use rotation).

---

## 5 — Key functional requirements (MVP)
1. Product Management
   - CRUD products: name, product_code (unique), selling/buying price, unit, VAT percent, description, image_url, weight/unit
   - Stock fields: on_hand (authoritative), reserved (optional), available (on_hand - reserved)
   - Stock +/- adjustments (with inventory ledger entries)
   - Search: MongoDB text index + product_code exact lookup; simple fuzzy/autocomplete with front-end regex/prefix (no Algolia/Atlas Search for self-hosting)

2. Orders / Sales
   - Create Draft → Confirm workflow
   - Confirmed: stock decremented immediately
   - Support: partial payments, multiple payment lines (MVP supports single order payments but API supports multiple entries), record customer name/phone
   - Statuses: Draft, Confirmed, Partially Paid, Paid, Cancelled, Returned
   - Sales returns support (creates an inbound inventory movement)

3. Purchases
   - Single-step purchase record (receive + invoice)
   - Full payment at creation (MVP, though payments array supported)
   - Supplier details and purchase returns
   - Downloadable Purchase Report (PDF & Excel)

4. Returns
   - Supplier returns and customer returns as separate documents
   - Returns include snapshot of original invoice (no immutable DB link by default; snapshots retained)
   - Returns create inventory movements and adjust stock; require verification before completion (business rule)

5. Expenses
   - Track inventory-related expenses (date, party, total, paid/due)
   - Filterable by date range, with totals

6. Reporting & Exports
   - Sales, Purchases, Inventory reports
   - Exports: PDF (Puppeteer server-side HTML->PDF) and Excel (SheetJS or ExcelJS)
   - Scheduled exports: optional (future), on-demand supported

---

## 6 — Data model — core collections (high-level)
Design decisions:
- Inventory ledger: dedicated immutable collection inventory_transactions (movement_id)
- Money: stored in minor units (paisa) as 64-bit integers (NumberLong via mongoose-long)
- Historical integrity: orders & purchases store snapshots of relevant product/price fields
- Soft-delete: all finance-critical records (is_deleted + deletedAt + deletedBy); purge job uses retention config

Collections (key fields — abridged):
- products
  - _id, product_code (unique), name, description, category, unit, price_selling_paisa, price_buying_paisa, vat_percent, on_hand (int), reserved, available, image_url, is_deleted
  - Indexes: unique product_code (partial), text index (name, description, product_code), on_hand

- inventory_transactions
  - _id, movement_id (MOV-...), product_id, product_code (snapshot), qty (positive in/negative out), type (purchase_in, sale_out, purchase_return, sale_return, adjustment), unit_cost_paisa, timestamp, source { doc_type, doc_id, doc_number }, createdBy
  - Indexes: (product_id, timestamp), movement_id unique, source.doc_type+doc_id

- orders
  - _id, order_number (ORD-...), status, customer snapshot, lines [product snapshot, qty, unit_price_paisa, unit_cost_paisa, inventory_movements[]], subtotal_paisa, vat_total_paisa, total_paisa, payments[], amount_received_paisa, amount_due_paisa, is_deleted, retain_until
  - Indexes: order_number, createdAt, status

- purchases
  - _id, purchase_number, supplier_id, supplier_name, date, lines, subtotal, vat, total, payments, inventory_movements[], is_deleted

- returns
  - _id, return_number, type (supplier/customer), related_original_snapshot, lines, status, inventory_movements[], createdBy

- suppliers, users, audit_logs, counters
  - counters: key (orders,purchases,movements) + seq (for monotonic human-friendly IDs)

Note: Counters are used via findOneAndUpdate ($inc) inside transactions to allocate human-readable numbers.

---

## 7 — Money & precision
- Stored as integer minor units (paisa): price_selling_paisa, price_buying_paisa, totals, payments — NumberLong (64-bit).
- API exposes converted decimal strings for UI; server performs arithmetic in integers to avoid floating point issues.

---

## 8 — Transactional & concurrency rules
- MongoDB multi-document transactions used for critical flows that touch multiple documents:
  - Confirm order: read product.on_hand (session), ensure sufficient stock, decrement on_hand, insert inventory_transactions, update order to Confirmed, attach movement ids — commit or abort
  - Create purchase: insert purchase, increment product.on_hand, insert inventory_transactions
  - Returns/cancellations: create reversing inventory_transactions and update on_hand
- Rely on transactions to prevent negative stock under concurrent operations.
- For performance, keep transactions minimal (no heavy computations) and use optimistic reads where appropriate.

---

## 9 — Audit, retention & soft-delete
- audit_logs collection: event_id, entity_type, entity_id, action, changed_by, timestamp, diff
- Soft-delete (is_deleted + deletedBy + deletedAt + retain_until). Background purge job removes items older than soft-delete retention (configurable).
- Financial retention: keep financial records (orders/purchases/inventory_transactions/audit_logs) in live DB for 3 years by default; archival process exports older records to compressed/encrypted storage before deletion.
- Soft-delete default purge eligibility: 30 days (configurable via settings); admin override via retain_until.

---

## 10 — Search & product lookup
- Self-hosted approach: MongoDB text index on name/description/product_code plus exact indexed product_code lookup for scanner/fast lookup.
- Autocomplete/fuzzy: frontend uses debounced prefix/regex and server side text search; Atlas Search / Elastic / Algolia can be introduced later if scale requires.

---

## 11 — API surface (high-level)
Versioned base: /api/v1
- Auth
  - POST /auth/register
  - POST /auth/login -> returns access token; sets HttpOnly refresh cookie
  - POST /auth/refresh -> rotate refresh + return access token
  - POST /auth/logout -> revoke refresh token
  - GET /auth/me
- Products
  - GET /products (search, filters, pagination)
  - POST /products
  - GET /products/:id
  - PUT /products/:id
  - POST /products/:id/adjust  (create adjustment movement)
- Orders (sales)
  - POST /orders (create draft)
  - GET /orders (list)
  - GET /orders/:id
  - POST /orders/:id/confirm (transactional — decrement stock & create movements)
  - POST /orders/:id/pay
  - POST /orders/:id/cancel
  - POST /orders/:id/return
- Purchases
  - POST /purchases (create & receive — transactional)
  - POST /purchases/:id/return
- Returns
  - POST /returns
  - GET /returns
- Inventory ledger
  - GET /inventory/transactions (productId/from/to/type)
- Reports & Exports
  - GET /reports/sales?from=&to=&format=json|excel|pdf  (API queues or generates export)
  - GET /reports/purchases, /reports/stock, /reports/top-products
- Admin
  - Users CRUD, retention settings, audit logs

Implementation notes:
- Use consistent response envelope; use status codes (400/401/403/404/409/500)
- Long-running exports: enqueue jobs via background worker (recommended) and provide job endpoint /exports/:jobId for download links.

---

## 12 — Frontend architecture (React + TypeScript)
- Tech: React + TypeScript (Vite), react-hook-form + yup, axios, react-router, minimal component library (MUI optional).
- State: local state + React Query (recommended later) or simple data fetching with axios for MVP.
- Folder structure (recommended)
  - src/
    - api/ (axios client + typed wrappers)
    - auth/ (AuthContext, token handling)
    - components/ (NavBar, DataTable, Form components)
    - pages/ (Login, Register, ProductsList, ProductCreate, OrdersList, OrderCreate, Purchases, Reports, Dashboard)
    - utils/ (money convert, date utils)
- Key flows:
  - Auth: login -> store access token in localStorage + refresh cookie (HttpOnly)
  - Products: list + create/edit modal
  - Order flow: create draft, confirm (confirm endpoint returns 409 if insufficient stock)
  - Reports: date range builder -> request export -> poll for job completion

UX considerations:
- Confirm step shows stock pre-checks before calling /orders/:id/confirm
- Export jobs are async; UI shows progress and email/download link when ready
- Image upload via presigned S3 PUT (backend returns signed URL)

---

## 13 — Reporting & export libs
- PDF: server-side rendering using Puppeteer (headless Chrome) to produce print-ready PDFs from HTML templates (consistent rendering).
- Excel: SheetJS (xlsx) or ExcelJS server-side for streaming XLSX files.
- For large exports: background jobs (Bull + Redis) recommended; can be synchronous for small datasets.

---

## 14 — Infrastructure & deployment (MVP)
- Hosting: Self-hosted VPS (DigitalOcean / Hetzner / OVH) with:
  - App server(s) running Node (stateless) behind Nginx reverse proxy + TLS
  - MongoDB self-hosted (use a replica set even on 1 node initially to enable transactions)
  - S3-compatible object storage (DigitalOcean Spaces / AWS S3) for product images
- Backups:
  - Daily mongodump or snapshot; offsite retention >= 30 days
  - Exported archival for older financial data prior to purge
- CI/CD:
  - GitHub Actions (CI for lint/test/build)
  - Manual deploy (MVP): CI artifact built, deployment triggered manually; next step automating via Actions.
- Monitoring:
  - Sentry for error tracking, and CloudWatch / Prometheus for metrics (CPU, memory, request latency)
- Jobs:
  - Background worker (optional initially) for exports using Bull + Redis (add Redis when scaling/when using background jobs)

---

## 15 — Security & compliance
- HTTPS required in production; set COOKIE_SECURE=true
- Password hashing: bcrypt (salt rounds >= 12)
- Access tokens short-lived (15m), refresh tokens long-lived and rotated; refresh tokens stored hashed
- Rate-limit auth endpoints and critical write endpoints
- Use Decimal-safe money (paisa integer) to avoid rounding issues
- Retention policy default: financial records 3 years; soft-deleted purge after 30 days; archiving before deletion

---

## 16 — Performance & scale planning
- Designed for SMB: estimate <= 10k products, <= 10k orders/month
- Indexing strategy:
  - products: product_code unique, text index (name, description, product_code), on_hand index
  - orders: order_number index, createdAt
  - inventory_transactions: (product_id, timestamp)
  - counters: key unique
- Use MongoDB transactions for writes that update multiple documents; keep transactions short
- For heavy read/analytics: add pre-aggregated rollups or scheduled aggregation jobs; consider Redis cache for dashboard

---

## 17 — Trade-offs & assumptions
- Single-store only (MVP). Later multi-warehouse requires adding warehouse_id on product stock and lot/serial features if needed.
- No camera-based barcode scanning (MVP). Support keyboard-emulating scanners.
- Money as paisa (NumberLong). Chosen for performance and aggregation simplicity.
- Self-hosted MongoDB (VPS) — simpler & cheaper for MVP but increases ops overhead vs managed Atlas. If you want Atlas features (Atlas Search), choose MongoDB Atlas later.

---

## 18 — Risks & mitigation
- Risk: Concurrent sales causing stock races. Mitigation: use MongoDB transactions and pre-checks.
- Risk: Large exports blocking API. Mitigation: move exports to background worker and stream results.
- Risk: Data drift between inventory ledger & product.on_hand. Mitigation: scheduled reconciliation job to rebuild on_hand from ledger and alert on discrepancy.

---

## 19 — Deliverables (ready now)
- Database schema (Mongoose models) and samples (provided)
- REST API route structure + transactional controller code for Confirm Order and Create Purchase (provided)
- React TypeScript skeleton (Vite) with auth, products, order flows (provided)
- OpenAPI spec (openapi.yaml) — base provided
- Scripts: create_repo.sh and create_zip.sh (helpers provided)
- Tests: Jest + Supertest integration tests for auth, order, purchase flows (provided)

---

## 20 — Action items for product & engineering leadership
1. Product: Review/approve MVP scope and business rules:
   - Confirm immediate decrement on Confirmed orders (current design).
   - Confirm retention and purge policy (30-day soft-delete; 3-year financial live retention).
   - Confirm VAT policy per-product (vat_percent + price_includes_vat flag optional later).
2. Engineering:
   - Provision a dev VPS or local Mongo replica set (transactions require replica set).
   - Pull provided repo scaffold, run seed script, and run integration tests.
   - Review models & controller code and finalize input validation (Joi / express-validator).
   - Configure object storage (S3) and update env, implement S3 presigned uploads for images.
   - Implement background job worker for exports when moving heavy jobs off API thread (Bull + Redis).
3. Security & Ops:
   - Rotate and store JWT secrets in vault / environment securely.
   - Implement daily backups and recovery runbook.
4. UX/Design:
   - Product to provide branding assets (logo) and report template requirements (header/footer).

---

## 21 — Recommended next technical tasks (priority)
- [P0] Provision a MongoDB replica set (local or managed) so transactions work reliably.
- [P0] Backend: wire validation middleware and role-based middleware; finalize openapi.yaml & generate client stubs for frontend.
- [P0] Frontend: connect auth flows to real backend, run end-to-end walkthrough (create product, create order, confirm, create purchase).
- [P1] Add background job queue & implement export worker (Bull + Redis) and implement server-side Puppeteer + SheetJS export handlers.
- [P1] Configure S3 (or DO Spaces) and implement image presigned upload flow.
- [P2] Add monitoring (Sentry) and CI pipeline (GitHub Actions: lint/test/build) and automated build artifacts.

Estimated initial delivery time (approximate):
- Backend API + models + transactional endpoints + tests: 2–3 weeks (1 backend engineer)
- Frontend MVP pages + auth + POS flow: 2–3 weeks (1 frontend engineer)
- Integrations (S3, exports, CI, backups): +1–2 weeks

---

## 22 — Suggested tech stack & libraries
- Backend (Node/Express):
  - mongoose, mongoose-long (NumberLong), express-async-errors, bcrypt, jsonwebtoken, uuid
  - puppeteer (PDF), sheetjs or exceljs (XLSX), bull + ioredis (jobs)
- Frontend:
  - React + TypeScript (Vite), react-router, react-hook-form + yup, axios, react-query (recommended)
- Dev & Ops:
  - GitHub Actions for CI, Sentry for errors, Prometheus/CloudWatch, mongodump backups, S3 / CDN
- Testing:
  - Jest + Supertest for API tests; React Testing Library for frontend; Cypress for E2E

---

## 23 — Final notes & acceptance checklist
Before we mark this PR/design as ready for implementation:
- [ ] Product approves confirmed business rules (stock decrement timing, returns approval policy, retention periods).
- [ ] Ops approves self-host vs managed DB decision (self-host chosen here).
- [ ] Engineering confirms availability of a Mongo replica set for dev & testing (transactions).
- [ ] Product supplies branding and report template guidance for PDFs.

If you approve the above choices, engineering can:
- Clone scaffold (create_repo.sh), run npm install (backend & frontend),
- Seed demo users (backend/scripts/seed_users.js),
- Run tests (npm test in backend),
- Start implementing iterative features and CI.

---

If you'd like, I can now:
- Generate a concise executive slide (3 slides) for leadership summarizing costs/ops.
- Produce the finalized OpenAPI YAML and generated TypeScript client from it.
- Produce a step-by-step runbook for deploying the MVP ( VMs, nginx, Mongo replica set, backup schedule).

Which would you prefer next?