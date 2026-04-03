import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials not configured. Real-time features will be disabled."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);

export type Transaction = {
  id: string;
  gateway: string;
  event_type: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type Anomaly = {
  id: string;
  transaction_id?: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
};

export type Metric = {
  drift_rate: number;
  heal_success_rate: number;
  webhooks_60min: number;
  open_anomalies: number;
  timestamp: string;
};
