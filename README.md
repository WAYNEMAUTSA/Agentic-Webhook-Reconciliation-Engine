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

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/razorpay` | Incoming Razorpay webhook |
| `GET` | `/transactions` | List transactions (optional `?state=`, `?gateway=`, `?limit=`, `?page=`) |
| `GET` | `/transactions/:id/events` | Full event log for one transaction |
| `GET` | `/metrics` | Dashboard metrics (drift rate, heal success, etc.) |
| `GET` | `/anomalies` | Unresolved anomalies |
| `PATCH` | `/anomalies/:id/resolve` | Mark anomaly as resolved (body: `{ note: "..." }`) |
| `POST` | `/mock/simulate` | Trigger chaos demo scenario |
| `GET` | `/mock/razorpay/:txnId/fetch` | Mock gateway fetch for heal simulation |

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

The Supabase schema is in `backend/src/db/schema.sql`. Run it in your Supabase SQL editor to create all tables, enums, and indexes. A migration for adding `resolution_notes` to anomalies is in `backend/src/db/migration_add_resolution_notes.sql`.
