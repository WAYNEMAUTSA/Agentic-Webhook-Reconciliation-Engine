# QuantumView Frontend

React frontend application for the Webhook Events & Payment Gateway Reconciliation Dashboard.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** as the build tool
- **Tailwind CSS** for styling
- **shadcn/ui** component library (with Radix UI primitives)
- **React Router** for navigation
- **TanStack Query** for data fetching
- **Axios** for HTTP requests
- **Recharts** for data visualization
- **React Hook Form** + **Zod** for validation
- **Supabase** client for real-time subscriptions
- **Vitest** + **Testing Library** + **Playwright** for testing

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Backend API running (for proxy configuration)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The dev server runs on `http://localhost:8080` with API proxy to `http://127.0.0.1:3000`.

### Build

```bash
npm run build
```

### Testing

```bash
# Unit tests
npm run test
npm run test:watch

# E2E tests (requires Playwright browsers)
npx playwright install
npx playwright test
```

## Environment Variables

Create a `.env` file in the root of the frontend directory:

```env
VITE_API_URL=                  # Backend API URL (optional, defaults to /api for proxy)
VITE_SUPABASE_URL=             # Supabase project URL
VITE_SUPABASE_ANON_KEY=        # Supabase anon key
```

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── AppLayout.tsx    # Main layout with header, nav, content
│   ├── AnomalyQueue.tsx # Anomaly list component
│   ├── DriftChart.tsx   # Recharts-based drift visualization
│   ├── MetricCards.tsx  # Dashboard metric cards
│   ├── NavLink.tsx      # Navigation link component
│   └── TransactionList.tsx # Transaction table/list
├── hooks/
│   ├── use-mobile.tsx   # Mobile viewport detection
│   ├── use-toast.ts     # Toast notification hook
│   └── useRealtime.ts   # Supabase real-time subscriptions
├── lib/
│   ├── api.ts           # API base URL config
│   ├── supabase.ts      # Supabase client initialization
│   └── utils.ts         # cn() utility function
├── pages/
│   ├── Index.tsx        # Redirect/default page
│   ├── Dashboard.tsx    # Live overview with metrics, charts, activity
│   ├── Transactions.tsx # Transaction list with filtering
│   ├── ManualReview.tsx # Manual review queue for anomalies
│   ├── Overview.tsx     # Overview page
│   ├── ReviewQueue.tsx  # Review queue component
│   └── NotFound.tsx     # 404 page
├── types/
│   └── index.ts         # TypeScript type definitions
├── App.tsx
├── App.css
├── index.css            # Tailwind directives + CSS custom properties
├── main.tsx             # React entry point
└── vite-env.d.ts        # Vite type declarations
```

## API Endpoints

The frontend connects to the backend API with these endpoints:

- `GET /api/metrics` - Dashboard metrics
- `GET /api/anomalies` - List of anomalies
- `GET /api/transactions` - List of transactions
- `POST /api/anomalies/:id/resolve` - Resolve an anomaly
- `POST /api/anomalies/:id/reject` - Reject an anomaly

## Features

1. **Dashboard Page**: 4 metric cards (Drift Rate, Heal Success Rate, Webhooks 60min, Open Anomalies) with conditional styling, drift rate trend chart, webhook volume by gateway chart, and recent activity feed. Auto-refreshes every 10 seconds.

2. **Transactions Page**: List/table of webhook transactions with gateway breakdown and filtering.

3. **Manual Review Page**: Queue of anomalies requiring manual intervention with resolve/reject actions.

4. **Real-time Updates**: Supabase real-time subscriptions for transactions and anomalies.

5. **Header**: App branding with live clock updating every 5 seconds.

6. **Tab-based Navigation**: 3 tabs — "Live Overview", "Transactions", "Manual Review".
