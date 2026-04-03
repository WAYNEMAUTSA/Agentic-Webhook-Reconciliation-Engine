# Webhook Reconciliation Engine

A real-time dashboard and automation engine for monitoring, reconciling, and healing webhook-driven payment transactions. It detects anomalies (dropped events, state conflicts, gateway outages), runs auto-heal workflows via a BullMQ queue, and provides a visual review queue for manual intervention.

## Project Structure

```
├── backend/              # Express + Supabase + BullMQ
│   ├── src/
│   │   ├── db/           # Supabase client, SQL schema, migrations
│   │   ├── queues/       # BullMQ heal queue (Upstash Redis)
│   │   ├── routes/       # Express routes (webhook, mock, transactions, metrics, anomalies)
│   │   ├── services/     # Business logic (stateMachine, autoHealer, gapDetector)
│   │   ├── types/        # Shared TypeScript types
│   │   ├── workers/      # BullMQ workers (healWorker, webhookWorker)
│   │   └── index.ts      # Express server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── render.yaml       # Render deployment manifest
│
├── frontend/             # React + Vite + Tailwind + Recharts
│   ├── src/
│   │   ├── components/   # UI components (MetricCards, DriftChart, TransactionList, AnomalyQueue, shadcn/ui)
│   │   ├── hooks/        # React hooks (useRealtime, use-toast, use-mobile)
│   │   ├── lib/          # API client, Supabase client, utilities
│   │   ├── pages/        # Page components (Overview, Transactions, ReviewQueue, Dashboard, ManualReview)
│   │   ├── test/         # Vitest test setup
│   │   ├── App.tsx       # Main app with tab navigation
│   │   ├── main.tsx      # Vite entry point
│   │   └── index.css     # Tailwind + custom CSS tokens
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── src/                  # Shared source (both backend and frontend reference this)
├── package.json          # Root workspace scripts
├── .env.example
└── README.md
```

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the Express server listens on | `3000` |
| `SUPABASE_URL` | Supabase project URL | *(required)* |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side) | *(required)* |
| `UPSTASH_REDIS_URL` | Redis URL for BullMQ queue (Upstash) | *(optional)* |
| `FRONTEND_URL` | Allowed origin for CORS | `*` |
| `SELF_URL` | Base URL the backend uses to call itself (chaos demo, heal callbacks) | `http://localhost:3000` |

### Frontend

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | URL of the backend API | `http://localhost:3000` |
| `VITE_SUPABASE_URL` | Supabase project URL (realtime subscriptions) | *(optional)* |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (realtime subscriptions) | *(optional)* |

## Running Locally

### Option 1: Run both concurrently from root

```bash
npm run install:all     # Install all dependencies (root + backend + frontend)
npm run dev             # Starts backend on :3000 and frontend on :8080
```

### Option 2: Run separately

**Backend:**
```bash
cd backend
npm install
npm run dev             # Starts Express at http://localhost:3000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev             # Starts Vite dev server at http://localhost:8080
```

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/razorpay` | Incoming Razorpay webhook |
| `GET` | `/transactions` | List transactions (optional `?state=`, `?gateway=`, `?limit=`, `?page=`) |
| `GET` | `/transactions/:id/events` | Full event log for one transaction |
| `GET` | `/metrics` | Dashboard metrics (drift rate, heal success, AI recovery rate, open anomalies) |
| `GET` | `/metrics/drift-history` | Drift rate time series for charting |
| `GET` | `/metrics/healer-history` | Recent AI agent interventions from audit log |
| `GET` | `/anomalies` | Unresolved anomalies |
| `PATCH` | `/anomalies/:id/resolve` | Mark anomaly as resolved (body: `{ note: "...", targetState: "..." }`) |
| `POST` | `/anomalies/:id/reject` | Reject anomaly with no auto-heal (body: `{ note: "..." }`) |
| `POST` | `/anomalies/:id/refetch` | Re-fetch from gateway and replay events (auto-resolves on success) |
| `GET` | `/mock/razorpay/:txnId/fetch` | Mock gateway fetch for heal simulation |
| `POST` | `/mock/simulate` | Trigger chaos demo scenario |

### Injector Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/injector/start` | Start random injector with profile (body: `{ profile: "chaos" }`) |
| `POST` | `/injector/stop` | Stop the random injector |
| `GET` | `/injector/status` | Check injector status |

## Metrics & Monitoring

### Dashboard Metrics

The `/metrics` endpoint returns real-time data for:

- **Drift Rate**: Percentage of transactions with state gaps (dropped, out-of-order, or duplicate events)
- **AI Recovery Rate**: Percentage of AI interventions that successfully healed or suppressed anomalies
  - Formula: `(healed + suppressed) / (processed + healed + suppressed) × 100`
  - Updated whenever anomalies are resolved, rejected, or auto-healed
- **Open Anomalies**: Count of unresolved anomalies requiring attention
- **Heal Success Rate**: Success rate of automated heal jobs
- **Webhooks (60 min)**: Number of webhook events received in the last hour

### AI Agent Audit Log

All AI agent actions are recorded in the `healer_audit_log` table with:
- Transaction ID and gateway
- Original vs healed event type
- Outcome (`healed`, `suppressed`, `processed`)
- Actions taken and reasoning trail
- Confidence score
- Number of bridge events synthesized

The audit log is updated when:
- **Chaos Healer** processes incoming webhooks (real-time)
- **Auto Healer** successfully completes a heal job via gateway polling
- **Manual resolution** of an anomaly via the dashboard
- **Refetch & replay** successfully resolves an anomaly

### Anomaly Resolution Flow

1. **Detection**: Gap detection or state conflict creates an anomaly
2. **Auto-Heal**: BullMQ heal job attempts to fetch missing events from gateway
3. **Manual Review**: If auto-heal fails, anomaly appears in the review queue
4. **Resolution Options**:
   - **Resolve**: Manually mark as resolved with optional target state update
   - **Reject**: Mark as rejected with no healing action (counts as "suppressed")
   - **Refetch**: Re-poll gateway and replay events (auto-resolves on success)

All resolution actions are logged in the audit trail and immediately update the AI Recovery Rate.

## Chaos Demo

Trigger simulated failure scenarios:

```bash
# Dropped webhooks — only fires "captured", skipping created/authorized
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"dropped"}'

# Surge — 10 transactions × 3 events × 2 rounds (60 webhooks total)
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"surge"}'

# Out-of-order events
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"out_of_order"}'

# Normal flow
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"normal"}'
```

Each scenario fires webhooks to `/webhook/razorpay` and returns the count of webhooks fired.

## Testing & Data Injection

### Option 1: Random Injector (Recommended for Testing)

The random injector automatically cycles through different scenarios to generate realistic test data:

```bash
cd backend
npm run injector:start   # Start continuous data injection
npm run injector:stop    # Stop the injector
npm run injector:status  # Check current status
```

Profiles (auto-cycled):
- **realistic**: Mixed normal and anomalous traffic
- **balanced**: Equal distribution of scenarios
- **chaos**: High rate of dropped and out-of-order events
- **normal-only**: Clean transaction flow

### Option 2: One-Time Test Data Injection

Inject a batch of test data including transactions, events, anomalies, and audit log entries:

```bash
cd backend
npm run inject:test-data
```

This creates:
- 20 transactions across different states
- Webhook events for each transaction
- 15 healer audit entries (boosts AI Recovery Rate display)
- 5 open anomalies for testing the review queue
- 8 heal jobs with various statuses

### Option 3: Manual Testing

**Resolve an anomaly:**
```bash
curl -X PATCH http://localhost:3000/anomalies/{anomaly-id}/resolve \
  -H "Content-Type: application/json" \
  -d '{"note": "Manually verified", "targetState": "captured"}'
```

**Reject an anomaly:**
```bash
curl -X POST http://localhost:3000/anomalies/{anomaly-id}/reject \
  -H "Content-Type: application/json" \
  -d '{"note": "False positive"}'
```

**Refetch from gateway:**
```bash
curl -X POST http://localhost:3000/anomalies/{anomaly-id}/refetch
```

### Verifying Metrics

After injecting data, refresh the dashboard to see:
- **Drift Rate** changes based on dropped/out-of-order events
- **AI Recovery Rate** increases as anomalies are resolved
- **Open Anomalies** count decreases on resolution
- **AI Agent Audit Log** shows detailed reasoning for each action

The dashboard auto-refreshes every 10 seconds.

## Deployment (Render)

### Backend

1. Connect the repo to Render as a **Web Service**.
2. Set **Root Directory**: `backend`
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `UPSTASH_REDIS_URL`, `FRONTEND_URL`, `SELF_URL`.

A `backend/render.yaml` is provided for one-click setup.

### Frontend

1. Connect the repo to Render as a **Static Site**.
2. Set **Root Directory**: `frontend`
3. Set **Build Command**: `npm install && npm run build`
4. Set **Publish Directory**: `dist`
5. Set `VITE_API_URL` to your Render backend URL.

## Database

The Supabase schema is in `backend/src/db/schema.sql`. Run it in your Supabase SQL editor to create all tables, enums, and indexes.

### Migrations

Run these migrations in order after the base schema:

1. **`migration_add_resolution_notes.sql`** - Adds resolution tracking to anomalies
2. **`migration_add_healer_audit_log.sql`** - Creates the initial healer audit log table (will be replaced by next migration)
3. **`migration_fix_healer_audit_log.sql`** - **IMPORTANT**: Recreates healer_audit_log with correct schema that the code uses
4. **`migration_add_ai_metadata.sql`** - Adds AI metadata column to webhook_events (skip the healer_audit_log CREATE TABLE in this file, it's already created by previous migration)
5. **`migration_add_drift_snapshots.sql`** - Creates drift snapshot table for historical charting

**CRITICAL**: You MUST run `migration_fix_healer_audit_log.sql` to fix the schema mismatch. The old migration created the wrong columns.

All migrations are idempotent (use `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`) and can be run multiple times safely.
